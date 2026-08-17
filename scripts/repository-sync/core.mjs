import path from "node:path";

const shaPattern = /^[0-9a-f]{40}$/;
const evidenceCategories = new Set(["language", "framework", "library", "runtime", "database", "infrastructure", "tool", "service"]);

const stackCategoryByEvidenceCategory = {
  language: "Language",
  framework: "Framework",
  library: "Library",
  runtime: "Runtime",
  database: "Database",
  infrastructure: "Platform",
  tool: "Tool",
  service: "SaaS",
};

function normalizedName(value) {
  return value.trim().toLocaleLowerCase("en-US");
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function assertExactKeys(value, keys, label) {
  const expected = new Set(keys);
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !(key in value));
  if (unexpected.length || missing.length) {
    throw new Error(`${label} has invalid fields (missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}).`);
  }
}

function validateTechnology(technology, index) {
  if (!technology || Array.isArray(technology) || typeof technology !== "object") {
    throw new Error(`technologies[${index}] must be an object.`);
  }
  assertExactKeys(technology, ["name", "category", "evidence"], `technologies[${index}]`);
  if (typeof technology.name !== "string" || !technology.name.trim() || technology.name !== technology.name.trim() || technology.name.length > 80) {
    throw new Error(`technologies[${index}].name is invalid.`);
  }
  if (!evidenceCategories.has(technology.category)) throw new Error(`Invalid category for ${technology.name}.`);
  if (!Array.isArray(technology.evidence) || technology.evidence.length < 1 || technology.evidence.length > 5) {
    throw new Error(`${technology.name} must have between 1 and 5 evidence entries.`);
  }
  for (const [evidenceIndex, evidence] of technology.evidence.entries()) {
    if (!evidence || Array.isArray(evidence) || typeof evidence !== "object") {
      throw new Error(`${technology.name} evidence[${evidenceIndex}] must be an object.`);
    }
    assertExactKeys(evidence, ["path", "detail"], `${technology.name} evidence[${evidenceIndex}]`);
    if (typeof evidence.path !== "string" || !evidence.path || evidence.path.includes("\\") || path.posix.normalize(evidence.path) !== evidence.path || evidence.path.startsWith("/")) {
      throw new Error(`${technology.name} has an invalid evidence path.`);
    }
    if (typeof evidence.detail !== "string" || !evidence.detail.trim() || evidence.detail.length > 300) {
      throw new Error(`${technology.name} has an invalid evidence detail.`);
    }
  }
  return technology;
}

function validateRepository(repository) {
  if (!repository || Array.isArray(repository) || typeof repository !== "object") {
    throw new Error("GitHub repository metadata is required.");
  }
  const id = String(repository.id ?? "").trim();
  if (!/^\d+$/.test(id)) throw new Error("repository.id must be a numeric GitHub repository ID.");
  if (repository.visibility !== "public") throw new Error('repository.visibility must be explicitly "public" for repository sync v1.');
  if (repository.private !== false) throw new Error("repository.private must be explicitly false for repository sync v1.");
  if (repository.archived !== false) throw new Error("repository.archived must be explicitly false for repository sync v1.");
  if (repository.fork !== false) throw new Error("repository.fork must be explicitly false for repository sync v1.");
  return {
    id,
    fullName: requireString(repository.full_name, "repository.full_name"),
    url: requireString(repository.html_url, "repository.html_url"),
    visibility: repository.visibility,
    private: repository.private,
    archived: repository.archived,
    fork: repository.fork,
    defaultBranch: requireString(repository.default_branch, "repository.default_branch"),
  };
}

function validateManifest(manifest, fullName) {
  if (!manifest || manifest.schemaVersion !== 2) throw new Error("A schemaVersion 2 evidence manifest is required.");
  if (manifest.repository !== fullName) throw new Error(`Evidence manifest must belong to ${fullName}.`);
  if (!shaPattern.test(manifest.commitSha)) throw new Error("Evidence manifest commitSha is invalid.");
  if (!manifest.summary || Array.isArray(manifest.summary) || typeof manifest.summary !== "object") {
    throw new Error("manifest.summary must contain both en and it.");
  }
  const summaryKeys = Object.keys(manifest.summary).sort();
  if (summaryKeys.length !== 2 || summaryKeys[0] !== "en" || summaryKeys[1] !== "it") {
    throw new Error("manifest.summary must contain exactly en and it.");
  }
  const summary = {
    en: requireString(manifest.summary.en, "manifest.summary.en"),
    it: requireString(manifest.summary.it, "manifest.summary.it"),
  };
  if (summary.en.length > 400 || summary.it.length > 400) throw new Error("manifest.summary locales must not exceed 400 characters.");
  if (!Array.isArray(manifest.technologies)) throw new Error("manifest.technologies must be an array.");
  const technologies = manifest.technologies.map(validateTechnology);
  const seen = new Set();
  for (const technology of technologies) {
    const name = normalizedName(technology.name);
    if (seen.has(name)) throw new Error(`Duplicate technology: ${technology.name}.`);
    seen.add(name);
  }
  return { summary, technologies };
}

function validatePublicSelection(publicSelection) {
  if (!publicSelection || publicSelection.schemaVersion !== 1 || !Array.isArray(publicSelection.technologies)) {
    throw new Error("A schemaVersion 1 curated public technology manifest is required.");
  }
  const seen = new Set();
  const names = publicSelection.technologies.map((technology, index) => {
    const name = requireString(technology, `public technologies[${index}]`);
    const normalized = normalizedName(name);
    if (seen.has(normalized)) throw new Error(`Duplicate curated technology: ${name}.`);
    seen.add(normalized);
    return name;
  });
  return names;
}

export function buildRepositorySyncProposal({ repository, evidenceManifest, publicTechnologyManifest, stackCatalog = [] }) {
  const identity = validateRepository(repository);
  const evidence = validateManifest(evidenceManifest, identity.fullName);
  const publicTechnologyNames = validatePublicSelection(publicTechnologyManifest);
  const evidenceByName = new Map(
    evidence.technologies.map((technology) => [normalizedName(technology.name), technology]),
  );
  const stackByName = new Map(
    stackCatalog.map((entry) => [normalizedName(entry.name), entry]),
  );

  const selectedTechnologies = publicTechnologyNames.map((name) => {
    const detected = evidenceByName.get(normalizedName(name));
    if (!detected) throw new Error(`Curated public technology lacks committed-file evidence: ${name}.`);
    const stackEntry = stackByName.get(normalizedName(name));
    return {
      name,
      evidenceCategory: detected.category,
      stackMatch: stackEntry
        ? {
            status: "matched",
            name: stackEntry.name,
            category: stackEntry.category,
            websiteVisible: Boolean(stackEntry.websiteVisible),
          }
        : {
            status: stackCatalog.length > 0 ? "missing" : "not-checked",
            suggestedCategory: stackCategoryByEvidenceCategory[detected.category] ?? "Tool",
          },
      evidence: detected.evidence,
    };
  });

  return {
    schemaVersion: 1,
    repository: identity,
    sourceCommitSha: evidenceManifest.commitSha,
    summaryProposal: {
      value: evidence.summary,
      status: "needs-approval",
    },
    detectedTechnologies: evidence.technologies.map((technology) => technology.name).sort(),
    selectedTechnologies,
    publication: {
      status: "blocked-pending-approval",
      privateRepositoriesExcluded: true,
      generatedSummaryRequiresApproval: true,
    },
  };
}
