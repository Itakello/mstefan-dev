import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { diffManifests, processRepositoryTechnologies, validateManifest } from "../scripts/repository-technologies/core.mjs";
import { buildRepositoryEvidence } from "../scripts/repository-technologies/codex-extractor.mjs";

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

test("prepares exact-commit evidence without history, untracked files, or symlinks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "repository-snapshot-"));
  const repoDir = path.join(root, "source");
  const evidenceDir = path.join(root, "evidence");
  await mkdir(repoDir);
  await mkdir(evidenceDir);
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

  const evidence = await buildRepositoryEvidence(repoDir, stdout.trim(), evidenceDir);

  assert.equal(evidence.analyzedFiles.includes("package.json"), true);
  assert.equal(evidence.contents.find((file) => file.path === "package.json")?.content, "{}\n");
  assert.equal(JSON.stringify(evidence).includes("OLD_SECRET"), false);
  assert.equal(JSON.stringify(evidence).includes("UNTRACKED_SECRET"), false);
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
