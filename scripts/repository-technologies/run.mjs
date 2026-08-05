#!/usr/bin/env node
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { extractWithCodex, listRegularBlobs } from "./codex-extractor.mjs";
import { processRepositoryTechnologies } from "./core.mjs";

const execFileAsync = promisify(execFile);

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function gitSha(repoDir) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoDir });
  return stdout.trim();
}

async function gitTrackedFiles(repoDir, commitSha) {
  return new Set((await listRegularBlobs(repoDir, commitSha)).map((entry) => entry.path));
}

const repoDir = path.resolve(option("--repo-dir", process.cwd()));
const repository = option("--repository", process.env.GITHUB_REPOSITORY);
const statePath = path.resolve(repoDir, option("--state", ".artifacts/repository-technologies/state.json"));
const outputPath = path.resolve(repoDir, option("--output", ".artifacts/repository-technologies/manifest.json"));

if (!repository) {
  console.error("Provide --repository owner/name or set GITHUB_REPOSITORY.");
  process.exit(2);
}

try {
  const result = await processRepositoryTechnologies({
    repoDir,
    repository,
    statePath,
    outputPath,
    getCurrentSha: gitSha,
    getTrackedFiles: gitTrackedFiles,
    extract: extractWithCodex,
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
