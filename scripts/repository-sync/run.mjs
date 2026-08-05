#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildRepositorySyncProposal } from "./core.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${filePath}: ${error.message}`);
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

async function fetchRepository(fullName) {
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${fullName}`, { headers });
  if (!response.ok) throw new Error(`GitHub repository lookup failed with ${response.status}.`);
  return response.json();
}

const repoDir = path.resolve(option("--repo-dir", process.cwd()));
const repository = option("--repository", process.env.GITHUB_REPOSITORY);
const evidencePath = path.resolve(
  repoDir,
  option("--evidence", ".artifacts/repository-technologies/manifest.json"),
);
const publicTechnologyPath = path.resolve(
  repoDir,
  option("--public-technologies", ".github/project-technologies.json"),
);
const outputPath = path.resolve(
  repoDir,
  option("--output", ".artifacts/repository-sync/proposal.json"),
);
const repositoryFixturePath = option("--repository-fixture", null);

if (!repository) {
  console.error("Provide --repository owner/name or set GITHUB_REPOSITORY.");
  process.exit(2);
}

try {
  const [repositoryMetadata, evidenceManifest, publicTechnologyManifest] = await Promise.all([
    repositoryFixturePath
      ? readJson(path.resolve(repoDir, repositoryFixturePath))
      : fetchRepository(repository),
    readJson(evidencePath),
    readJson(publicTechnologyPath),
  ]);
  const proposal = buildRepositorySyncProposal({
    repository: repositoryMetadata,
    evidenceManifest,
    publicTechnologyManifest,
  });
  await writeJsonAtomic(outputPath, proposal);
  console.log(JSON.stringify({ status: "proposal-created", outputPath, proposal }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
