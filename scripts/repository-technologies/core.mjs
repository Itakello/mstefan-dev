import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const shaPattern = /^[0-9a-f]{40}$/;
const categories = new Set(["language", "framework", "library", "runtime", "database", "infrastructure", "tool", "service"]);

async function readJson(filePath, fallback, { invalidAsFallback = false } = {}) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    if (invalidAsFallback && error instanceof SyntaxError) return fallback;
    throw new Error(`Could not read ${filePath}: ${error.message}`);
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function assertExactKeys(value, keys, label) {
  const expected = new Set(keys);
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !(key in value));
  if (unexpected.length || missing.length) {
    throw new Error(`${label} has invalid fields (missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}).`);
  }
}

export async function validateManifest(manifest, { repoDir, repository, commitSha, trackedFiles, requireFilesPresent = true }) {
  if (!manifest || Array.isArray(manifest) || typeof manifest !== "object") throw new Error("Extractor output must be a JSON object.");
  assertExactKeys(manifest, ["schemaVersion", "repository", "commitSha", "summary", "technologies"], "Manifest");
  if (manifest.schemaVersion !== 1) throw new Error("schemaVersion must be 1.");
  if (manifest.repository !== repository) throw new Error(`repository must equal ${repository}.`);
  if (manifest.commitSha !== commitSha || !shaPattern.test(manifest.commitSha)) throw new Error(`commitSha must equal ${commitSha}.`);
  if (typeof manifest.summary !== "string" || !manifest.summary.trim() || manifest.summary.length > 400) {
    throw new Error("summary must be a non-empty string of at most 400 characters.");
  }
  if (!Array.isArray(manifest.technologies)) throw new Error("technologies must be an array.");

  const seen = new Set();
  for (const [index, technology] of manifest.technologies.entries()) {
    if (!technology || Array.isArray(technology) || typeof technology !== "object") throw new Error(`technologies[${index}] must be an object.`);
    assertExactKeys(technology, ["name", "category", "evidence"], `technologies[${index}]`);
    if (typeof technology.name !== "string" || !technology.name.trim() || technology.name.length > 80) throw new Error(`technologies[${index}].name is invalid.`);
    const normalizedName = technology.name.toLocaleLowerCase("en-US");
    if (seen.has(normalizedName)) throw new Error(`Duplicate technology: ${technology.name}.`);
    seen.add(normalizedName);
    if (!categories.has(technology.category)) throw new Error(`Invalid category for ${technology.name}.`);
    if (!Array.isArray(technology.evidence) || technology.evidence.length < 1 || technology.evidence.length > 5) {
      throw new Error(`${technology.name} must have between 1 and 5 evidence entries.`);
    }
    for (const [evidenceIndex, evidence] of technology.evidence.entries()) {
      if (!evidence || Array.isArray(evidence) || typeof evidence !== "object") throw new Error(`${technology.name} evidence[${evidenceIndex}] must be an object.`);
      assertExactKeys(evidence, ["path", "detail"], `${technology.name} evidence[${evidenceIndex}]`);
      if (typeof evidence.path !== "string" || !evidence.path || evidence.path.includes("\\") || path.posix.normalize(evidence.path) !== evidence.path || evidence.path.startsWith("/")) {
        throw new Error(`${technology.name} has an invalid evidence path.`);
      }
      if (!trackedFiles.has(evidence.path)) throw new Error(`${technology.name} evidence path is not tracked: ${evidence.path}.`);
      if (typeof evidence.detail !== "string" || !evidence.detail.trim() || evidence.detail.length > 300) throw new Error(`${technology.name} has an invalid evidence detail.`);
      if (requireFilesPresent) {
        try {
          const evidenceStat = await lstat(path.join(repoDir, evidence.path));
          if (!evidenceStat.isFile()) throw new Error("not a file");
        } catch {
          throw new Error(`${technology.name} evidence path does not exist: ${evidence.path}.`);
        }
      }
    }
  }
  return manifest;
}

function technologyMap(manifest) {
  return new Map((manifest?.technologies ?? []).map((technology) => [technology.name.toLocaleLowerCase("en-US"), technology]));
}

export function diffManifests(previous, next) {
  const before = technologyMap(previous);
  const after = technologyMap(next);
  return {
    added: [...after.keys()].filter((name) => !before.has(name)).map((name) => after.get(name).name).sort(),
    removed: [...before.keys()].filter((name) => !after.has(name)).map((name) => before.get(name).name).sort(),
    changed: [...after.keys()]
      .filter((name) => before.has(name) && JSON.stringify(before.get(name)) !== JSON.stringify(after.get(name)))
      .map((name) => after.get(name).name)
      .sort(),
    summaryChanged: (previous?.summary ?? null) !== next.summary,
  };
}

export async function processRepositoryTechnologies({ repoDir, repository, statePath, outputPath, getCurrentSha, getTrackedFiles, extract }) {
  const currentSha = await getCurrentSha(repoDir);
  if (!shaPattern.test(currentSha)) throw new Error(`Invalid current commit SHA: ${currentSha}.`);
  const trackedFiles = await getTrackedFiles(repoDir, currentSha);
  const state = await readJson(statePath, { schemaVersion: 1, status: "never-run" });
  let currentManifest = await readJson(outputPath, null, { invalidAsFallback: true });

  if (currentManifest && state.lastSuccessfulProcessedSha) {
    try {
      const previousTrackedFiles = state.lastSuccessfulProcessedSha === currentSha
        ? trackedFiles
        : await getTrackedFiles(repoDir, state.lastSuccessfulProcessedSha);
      await validateManifest(currentManifest, {
        repoDir,
        repository,
        commitSha: state.lastSuccessfulProcessedSha,
        trackedFiles: previousTrackedFiles,
        requireFilesPresent: false,
      });
    } catch {
      currentManifest = null;
    }
  }
  if (state.lastSuccessfulProcessedSha === currentSha && currentManifest) return { status: "unchanged", currentSha };

  const attemptedState = {
    schemaVersion: 1,
    lastSeenSha: currentSha,
    lastAttemptedSha: currentSha,
    lastSuccessfulProcessedSha: state.lastSuccessfulProcessedSha ?? null,
    status: "running",
  };
  await writeJsonAtomic(statePath, attemptedState);

  try {
    const extraction = await extract({ repoDir, repository, currentSha, currentManifest });
    const candidate = extraction?.manifest ?? extraction;
    const evidenceFiles = extraction?.evidenceFiles ?? trackedFiles;
    await validateManifest(candidate, { repoDir, repository, commitSha: currentSha, trackedFiles: evidenceFiles, requireFilesPresent: false });
    const diff = diffManifests(currentManifest, candidate);
    await writeJsonAtomic(outputPath, candidate);
    await writeJsonAtomic(statePath, { ...attemptedState, lastSuccessfulProcessedSha: currentSha, status: "succeeded" });
    return { status: "updated", currentSha, diff, manifest: candidate };
  } catch (error) {
    await writeJsonAtomic(statePath, { ...attemptedState, status: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
