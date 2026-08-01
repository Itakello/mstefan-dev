const shaPattern = /^[0-9a-f]{40}$/;

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

function validateRepository(repository) {
  if (!repository || Array.isArray(repository) || typeof repository !== "object") {
    throw new Error("GitHub repository metadata is required.");
  }
  if (repository.private || repository.visibility === "private") {
    throw new Error("Private repositories are excluded from repository sync v1.");
  }
  if (repository.archived) throw new Error("Archived repositories are excluded from repository sync v1.");
  if (repository.fork) throw new Error("Forked repositories are excluded from repository sync v1.");
  return {
    id: String(repository.id),
    fullName: requireString(repository.full_name, "repository.full_name"),
    url: requireString(repository.html_url, "repository.html_url"),
    visibility: repository.visibility || "public",
    defaultBranch: requireString(repository.default_branch, "repository.default_branch"),
  };
}

function validateManifest(manifest, fullName) {
  if (!manifest || manifest.schemaVersion !== 1) throw new Error("A schemaVersion 1 evidence manifest is required.");
  if (manifest.repository !== fullName) throw new Error(`Evidence manifest must belong to ${fullName}.`);
  if (!shaPattern.test(manifest.commitSha)) throw new Error("Evidence manifest commitSha is invalid.");
  const summary = requireString(manifest.summary, "manifest.summary");
  if (summary.length > 400) throw new Error("manifest.summary must not exceed 400 characters.");
  if (!Array.isArray(manifest.technologies)) throw new Error("manifest.technologies must be an array.");
  return { summary, technologies: manifest.technologies };
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
