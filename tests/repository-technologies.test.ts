import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { diffManifests, processRepositoryTechnologies, validateManifest } from "../scripts/repository-technologies/core.mjs";
import { buildRepositoryEvidence, codexExecArguments, extractWithCodex } from "../scripts/repository-technologies/codex-extractor.mjs";

const execFileAsync = promisify(execFile);

const firstManifest = {
  schemaVersion: 1,
  repository: "Itakello/example",
  commitSha: "a".repeat(40),
  summary: "An example service.",
  technologies: [{
    name: "TypeScript",
    category: "language",
    evidence: [{ path: "package.json", detail: "tsx is used for tests" }],
  }],
};

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "repository-technologies-"));
  const repoDir = path.join(root, "repo");
  const statePath = path.join(root, "state.json");
  const outputPath = path.join(root, "manifest.json");
  await mkdir(repoDir);
  await writeFile(path.join(repoDir, "package.json"), "{}\n");
  return { repoDir, statePath, outputPath, getTrackedFiles: async () => new Set(["package.json"]) };
}

test("skips extraction when the current SHA was already processed successfully", async () => {
  const paths = await fixture();
  const sha = "a".repeat(40);
  await writeFile(paths.statePath, JSON.stringify({
    schemaVersion: 1,
    lastSeenSha: sha,
    lastAttemptedSha: sha,
    lastSuccessfulProcessedSha: sha,
    status: "succeeded",
  }));
  await writeFile(paths.outputPath, JSON.stringify(firstManifest));
  let calls = 0;

  const result = await processRepositoryTechnologies({
    ...paths,
    repository: "Itakello/example",
    getCurrentSha: async () => sha,
    extract: async () => {
      calls += 1;
      return firstManifest;
    },
  });

  assert.equal(result.status, "unchanged");
  assert.equal(calls, 0);
});

test("reprocesses a successful SHA when its manifest is missing", async () => {
  const paths = await fixture();
  const sha = "a".repeat(40);
  await writeFile(paths.statePath, JSON.stringify({
    schemaVersion: 1,
    lastSeenSha: sha,
    lastAttemptedSha: sha,
    lastSuccessfulProcessedSha: sha,
    status: "succeeded",
  }));
  let calls = 0;

  const result = await processRepositoryTechnologies({
    ...paths,
    repository: "Itakello/example",
    getCurrentSha: async () => sha,
    extract: async () => {
      calls += 1;
      return firstManifest;
    },
  });

  assert.equal(result.status, "updated");
  assert.equal(calls, 1);
});

test("reprocesses a successful SHA when its manifest JSON is malformed", async () => {
  const paths = await fixture();
  const sha = "a".repeat(40);
  await writeFile(paths.statePath, JSON.stringify({
    schemaVersion: 1,
    lastSeenSha: sha,
    lastAttemptedSha: sha,
    lastSuccessfulProcessedSha: sha,
    status: "succeeded",
  }));
  await writeFile(paths.outputPath, "{invalid");
  let calls = 0;

  const result = await processRepositoryTechnologies({
    ...paths,
    repository: "Itakello/example",
    getCurrentSha: async () => sha,
    extract: async () => {
      calls += 1;
      return firstManifest;
    },
  });

  assert.equal(result.status, "updated");
  assert.equal(calls, 1);
});

test("passes current state to the extractor and publishes a validated complete manifest", async () => {
  const paths = await fixture();
  const oldSha = "a".repeat(40);
  const newSha = "b".repeat(40);
  await writeFile(paths.outputPath, JSON.stringify(firstManifest));
  await writeFile(paths.statePath, JSON.stringify({
    schemaVersion: 1,
    lastSeenSha: oldSha,
    lastAttemptedSha: oldSha,
    lastSuccessfulProcessedSha: oldSha,
    status: "succeeded",
  }));
  let receivedCurrent: unknown;
  const nextManifest = {
    ...firstManifest,
    commitSha: newSha,
    technologies: [...firstManifest.technologies, {
      name: "Node.js",
      category: "runtime",
      evidence: [{ path: "package.json", detail: "Node executes the service" }],
    }],
  };

  const result = await processRepositoryTechnologies({
    ...paths,
    repository: "Itakello/example",
    getCurrentSha: async () => newSha,
    extract: async (input) => {
      receivedCurrent = input.currentManifest;
      return nextManifest;
    },
  });

  assert.deepEqual(receivedCurrent, firstManifest);
  assert.equal(result.status, "updated");
  if (result.status !== "updated") assert.fail("expected an updated manifest");
  assert.deepEqual(result.diff.added, ["Node.js"]);
  assert.deepEqual(JSON.parse(await readFile(paths.outputPath, "utf8")), nextManifest);
  const state = JSON.parse(await readFile(paths.statePath, "utf8"));
  assert.equal(state.lastSuccessfulProcessedSha, newSha);
  assert.equal(state.status, "succeeded");
});

test("keeps a failed SHA retryable and preserves the last successful manifest", async () => {
  const paths = await fixture();
  const oldSha = "a".repeat(40);
  const newSha = "b".repeat(40);
  await writeFile(paths.outputPath, JSON.stringify(firstManifest));
  await writeFile(paths.statePath, JSON.stringify({
    schemaVersion: 1,
    lastSeenSha: oldSha,
    lastAttemptedSha: oldSha,
    lastSuccessfulProcessedSha: oldSha,
    status: "succeeded",
  }));

  await assert.rejects(processRepositoryTechnologies({
    ...paths,
    repository: "Itakello/example",
    getCurrentSha: async () => newSha,
    extract: async () => { throw new Error("extractor unavailable"); },
  }), /extractor unavailable/);

  assert.deepEqual(JSON.parse(await readFile(paths.outputPath, "utf8")), firstManifest);
  const failedState = JSON.parse(await readFile(paths.statePath, "utf8"));
  assert.equal(failedState.lastAttemptedSha, newSha);
  assert.equal(failedState.lastSuccessfulProcessedSha, oldSha);
  assert.equal(failedState.status, "failed");

  const result = await processRepositoryTechnologies({
    ...paths,
    repository: "Itakello/example",
    getCurrentSha: async () => newSha,
    extract: async () => ({ ...firstManifest, commitSha: newSha }),
  });
  assert.equal(result.status, "updated");
});

test("rejects extractor identity drift before checking evidence", async () => {
  const paths = await fixture();
  const sha = "c".repeat(40);
  await assert.rejects(validateManifest({
    ...firstManifest,
    repository: "someone/else",
    commitSha: sha,
    technologies: [{
      name: "Rust",
      category: "language",
      evidence: [{ path: "Cargo.toml", detail: "declares the crate" }],
    }],
  }, { repoDir: paths.repoDir, repository: "Itakello/example", commitSha: sha, trackedFiles: await paths.getTrackedFiles() }), /repository must equal Itakello\/example/);
});

test("discards an invalid persisted manifest before extraction and diffing", async () => {
  const paths = await fixture();
  const oldSha = "a".repeat(40);
  const newSha = "b".repeat(40);
  await writeFile(paths.statePath, JSON.stringify({
    schemaVersion: 1,
    lastSeenSha: oldSha,
    lastAttemptedSha: oldSha,
    lastSuccessfulProcessedSha: oldSha,
    status: "succeeded",
  }));
  await writeFile(paths.outputPath, JSON.stringify({ ...firstManifest, repository: "other/repo" }));
  let receivedCurrent: unknown = "not-called";

  const result = await processRepositoryTechnologies({
    ...paths,
    repository: "Itakello/example",
    getCurrentSha: async () => newSha,
    extract: async (input) => {
      receivedCurrent = input.currentManifest;
      return { ...firstManifest, commitSha: newSha };
    },
  });

  assert.equal(receivedCurrent, null);
  if (result.status !== "updated") assert.fail("expected an updated manifest");
  assert.deepEqual(result.diff.removed, []);
});

test("discards a persisted manifest when no successful SHA anchors it", async () => {
  const paths = await fixture();
  const sha = "a".repeat(40);
  await writeFile(paths.outputPath, JSON.stringify({ ...firstManifest, technologies: {} }));
  let receivedCurrent: unknown = "not-called";

  const result = await processRepositoryTechnologies({
    ...paths,
    repository: "Itakello/example",
    getCurrentSha: async () => sha,
    extract: async (input) => {
      receivedCurrent = input.currentManifest;
      return firstManifest;
    },
  });

  assert.equal(receivedCurrent, null);
  assert.equal(result.status, "updated");
  if (result.status !== "updated") assert.fail("expected an updated manifest");
  assert.deepEqual(result.diff.removed, []);
});

test("retains a valid previous manifest when its evidence file was deleted", async () => {
  const paths = await fixture();
  const oldSha = "a".repeat(40);
  const newSha = "b".repeat(40);
  await writeFile(paths.statePath, JSON.stringify({
    schemaVersion: 1,
    lastSeenSha: oldSha,
    lastAttemptedSha: oldSha,
    lastSuccessfulProcessedSha: oldSha,
    status: "succeeded",
  }));
  await writeFile(paths.outputPath, JSON.stringify(firstManifest));

  const result = await processRepositoryTechnologies({
    ...paths,
    repository: "Itakello/example",
    getCurrentSha: async () => newSha,
    getTrackedFiles: async (_repoDir, sha) => sha === oldSha ? new Set(["package.json"]) : new Set(),
    extract: async () => ({
      schemaVersion: 1,
      repository: "Itakello/example",
      commitSha: newSha,
      summary: "The project no longer has an implementation.",
      technologies: [],
    }),
  });

  if (result.status !== "updated") assert.fail("expected an updated manifest");
  assert.deepEqual(result.diff.removed, ["TypeScript"]);
});

test("rejects untracked and symlink evidence paths", async () => {
  const paths = await fixture();
  const sha = "a".repeat(40);
  await writeFile(path.join(paths.repoDir, "untracked.env"), "SECRET=value\n");
  await symlink(path.join(paths.repoDir, "package.json"), path.join(paths.repoDir, "linked.json"));

  for (const [evidencePath, trackedFiles, message] of [
    ["untracked.env", new Set(["package.json"]), /not tracked/],
    ["linked.json", new Set(["package.json", "linked.json"]), /does not exist/],
  ] as const) {
    await assert.rejects(validateManifest({
      ...firstManifest,
      technologies: [{
        ...firstManifest.technologies[0],
        evidence: [{ path: evidencePath, detail: "candidate evidence" }],
      }],
    }, { repoDir: paths.repoDir, repository: "Itakello/example", commitSha: sha, trackedFiles }), message);
  }
});

test("rejects whitespace-padded technology names", async () => {
  const paths = await fixture();
  await assert.rejects(validateManifest({
    ...firstManifest,
    technologies: [{ ...firstManifest.technologies[0], name: " TypeScript " }],
  }, {
    repoDir: paths.repoDir,
    repository: "Itakello/example",
    commitSha: firstManifest.commitSha,
    trackedFiles: await paths.getTrackedFiles(),
  }), /technologies\[0\]\.name is invalid/);
});

test("prepares exact-commit evidence without history, untracked files, or symlinks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "repository-snapshot-"));
  const repoDir = path.join(root, "source");
  await mkdir(repoDir);
  await execFileAsync("git", ["init", "--quiet"], { cwd: repoDir });
  await writeFile(path.join(repoDir, "package.json"), "{}\n");
  await writeFile(path.join(repoDir, "deleted-secret"), "OLD_SECRET=value\n");
  await execFileAsync("git", ["add", "package.json", "deleted-secret"], { cwd: repoDir });
  await execFileAsync("git", ["-c", "user.name=Codex Test", "-c", "user.email=codex@example.test", "commit", "--quiet", "-m", "first"], { cwd: repoDir });
  await rm(path.join(repoDir, "deleted-secret"));
  await writeFile(path.join(repoDir, ".gitattributes"), "package.json export-ignore\n");
  await symlink("package.json", path.join(repoDir, "linked.json"));
  await execFileAsync("git", ["add", "--all"], { cwd: repoDir });
  await execFileAsync("git", ["-c", "user.name=Codex Test", "-c", "user.email=codex@example.test", "commit", "--quiet", "-m", "second"], { cwd: repoDir });
  await writeFile(path.join(repoDir, ".env"), "UNTRACKED_SECRET=value\n");
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoDir });

  const evidence = await buildRepositoryEvidence(repoDir, stdout.trim());

  assert.equal(evidence.analyzedFiles.includes("package.json"), true);
  assert.equal(evidence.contents.find((file) => file.path === "package.json")?.content, "{}\n");
  assert.equal(JSON.stringify(evidence).includes("OLD_SECRET"), false);
  assert.equal(JSON.stringify(evidence).includes("UNTRACKED_SECRET"), false);
});

test("classifies target blobs independently of mutable Git attributes and accepts valid U+FFFD", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "repository-attributes-"));
  const repoDir = path.join(root, "source");
  await mkdir(repoDir);
  await execFileAsync("git", ["init", "--quiet"], { cwd: repoDir });
  await writeFile(path.join(repoDir, "package.json"), "{}\n");
  await writeFile(path.join(repoDir, "replacement.txt"), "valid replacement: \uFFFD\n");
  await execFileAsync("git", ["add", "package.json", "replacement.txt"], { cwd: repoDir });
  await execFileAsync("git", ["-c", "user.name=Codex Test", "-c", "user.email=codex@example.test", "commit", "--quiet", "-m", "fixture"], { cwd: repoDir });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoDir });
  await writeFile(path.join(repoDir, ".git", "info", "attributes"), "package.json binary\nreplacement.txt binary\n");

  const evidence = await buildRepositoryEvidence(repoDir, stdout.trim());

  assert.equal(evidence.analyzedFiles.includes("package.json"), true);
  assert.equal(evidence.contents.find((file) => file.path === "replacement.txt")?.content, "valid replacement: \uFFFD\n");
});

test("reads target blobs without mutable Git replacement refs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "repository-replacement-ref-"));
  const repoDir = path.join(root, "source");
  await mkdir(repoDir);
  await execFileAsync("git", ["init", "--quiet"], { cwd: repoDir });
  await writeFile(path.join(repoDir, "package.json"), "ORIGINAL\n");
  await execFileAsync("git", ["add", "package.json"], { cwd: repoDir });
  await execFileAsync("git", ["-c", "user.name=Codex Test", "-c", "user.email=codex@example.test", "commit", "--quiet", "-m", "fixture"], { cwd: repoDir });
  const { stdout: commitSha } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoDir });
  const { stdout: originalBlob } = await execFileAsync("git", ["rev-parse", "HEAD:package.json"], { cwd: repoDir });
  await writeFile(path.join(repoDir, "replacement-source"), "REPLACED\n");
  const { stdout: replacementBlob } = await execFileAsync("git", ["hash-object", "-w", "replacement-source"], { cwd: repoDir });
  await execFileAsync("git", ["replace", originalBlob.trim(), replacementBlob.trim()], { cwd: repoDir });

  const evidence = await buildRepositoryEvidence(repoDir, commitSha.trim());

  assert.equal(evidence.contents.find((file) => file.path === "package.json")?.content, "ORIGINAL\n");
  assert.equal(evidence.analyzedFiles.includes("replacement-source"), false);
});

test("rejects malformed UTF-8 target blobs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "repository-invalid-utf8-"));
  const repoDir = path.join(root, "source");
  await mkdir(repoDir);
  await execFileAsync("git", ["init", "--quiet"], { cwd: repoDir });
  await writeFile(path.join(repoDir, "invalid.txt"), Buffer.from([0x66, 0x6f, 0x80]));
  await execFileAsync("git", ["add", "invalid.txt"], { cwd: repoDir });
  await execFileAsync("git", ["-c", "user.name=Codex Test", "-c", "user.email=codex@example.test", "commit", "--quiet", "-m", "fixture"], { cwd: repoDir });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoDir });

  await assert.rejects(buildRepositoryEvidence(repoDir, stdout.trim()), /invalid\.txt is not valid UTF-8/);
});

test("rejects target text blobs above the 128 KiB per-file bound", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "repository-oversized-text-"));
  const repoDir = path.join(root, "source");
  await mkdir(repoDir);
  await execFileAsync("git", ["init", "--quiet"], { cwd: repoDir });
  await writeFile(path.join(repoDir, "oversized.txt"), "x".repeat(128 * 1024 + 1));
  await execFileAsync("git", ["add", "oversized.txt"], { cwd: repoDir });
  await execFileAsync("git", ["-c", "user.name=Codex Test", "-c", "user.email=codex@example.test", "commit", "--quiet", "-m", "fixture"], { cwd: repoDir });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoDir });

  await assert.rejects(buildRepositoryEvidence(repoDir, stdout.trim()), /bounded v1 limits at oversized\.txt/);
});

test("disables web search through the supported top-level Codex config", () => {
  const args = codexExecArguments({ responsePath: "/tmp/response.json", temporaryDir: "/tmp/extractor", model: "test-model" });

  assert.equal(args.includes('web_search="disabled"'), true);
  assert.equal(args.some((argument, index) => argument === "--disable" && args[index + 1] === "web_search"), false);
});

test("requires direct, audience-grounded project summaries and concrete technology usage", async () => {
  const instructions = await readFile(new URL("../scripts/repository-technologies/codex-extractor.mjs", import.meta.url), "utf8");

  assert.match(instructions, /describes the project directly/);
  assert.match(instructions, /Do not default to 'I built'/);
  assert.match(instructions, /unless the evidence explicitly says so/);
  assert.match(instructions, /incidental details such as the interface language/);
  assert.match(instructions, /Avoid corporate portfolio language/);
  assert.match(instructions, /external artifact link/);
  assert.match(instructions, /unused declaration is not sufficient usage evidence/);
});

test("records an immediate Codex child failure as retryable instead of crashing on EPIPE", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "repository-codex-epipe-"));
  const repoDir = path.join(root, "source");
  const binDir = path.join(root, "bin");
  const statePath = path.join(root, "state.json");
  const outputPath = path.join(root, "manifest.json");
  await mkdir(repoDir);
  await mkdir(binDir);
  await execFileAsync("git", ["init", "--quiet"], { cwd: repoDir });
  await writeFile(path.join(repoDir, "large.txt"), "x".repeat(120 * 1024));
  await execFileAsync("git", ["add", "large.txt"], { cwd: repoDir });
  await execFileAsync("git", ["-c", "user.name=Codex Test", "-c", "user.email=codex@example.test", "commit", "--quiet", "-m", "fixture"], { cwd: repoDir });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoDir });
  const currentSha = stdout.trim();
  const fakeCodex = path.join(binDir, "codex");
  await writeFile(fakeCodex, "#!/bin/sh\nexit 2\n");
  await chmod(fakeCodex, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;

  try {
    await assert.rejects(processRepositoryTechnologies({
      repoDir,
      repository: "Itakello/example",
      statePath,
      outputPath,
      getCurrentSha: async () => currentSha,
      getTrackedFiles: async () => new Set(["large.txt"]),
      extract: extractWithCodex,
    }), /codex exec exited with code 2/);
  } finally {
    process.env.PATH = originalPath;
  }

  const failedState = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(failedState.status, "failed");
  assert.equal(failedState.lastAttemptedSha, currentSha);
  assert.equal(failedState.lastSuccessfulProcessedSha, null);

  const result = await processRepositoryTechnologies({
    repoDir,
    repository: "Itakello/example",
    statePath,
    outputPath,
    getCurrentSha: async () => currentSha,
    getTrackedFiles: async () => new Set(["large.txt"]),
    extract: async () => ({
      schemaVersion: 1,
      repository: "Itakello/example",
      commitSha: currentSha,
      summary: "A retryable example.",
      technologies: [{
        name: "Text",
        category: "tool",
        evidence: [{ path: "large.txt", detail: "Provides bounded text evidence." }],
      }],
    }),
  });
  assert.equal(result.status, "updated");
});

test("computes added and changed technologies deterministically", () => {
  const next = {
    ...firstManifest,
    summary: "A changed summary.",
    technologies: [{
      name: "TypeScript",
      category: "language",
      evidence: [{ path: "package.json", detail: "TypeScript compiles the app" }],
    }, {
      name: "React",
      category: "framework",
      evidence: [{ path: "package.json", detail: "React is a dependency" }],
    }],
  };
  assert.deepEqual(diffManifests(firstManifest, next), {
    added: ["React"],
    removed: [],
    changed: ["TypeScript"],
    summaryChanged: true,
  });
});

test("declares explicit types for every structured-output property", async () => {
  const schema = JSON.parse(await readFile(new URL("../scripts/repository-technologies/manifest.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.properties.schemaVersion.type, "integer");
  for (const property of Object.values(schema.properties) as Array<Record<string, unknown>>) {
    assert.equal(typeof property.type, "string");
  }
});
