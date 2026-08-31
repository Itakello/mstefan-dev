import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

function findFiles(root, extension) {
  const matches = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) matches.push(...findFiles(path, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) matches.push(path);
  }
  return matches;
}

const resultsDirectory = resolve(process.argv[2] ?? ".artifacts/playwright/test-results");
const evidenceDirectory = resolve(process.argv[3] ?? ".artifacts/playwright/evidence");
mkdirSync(evidenceDirectory, { recursive: true });

const metadata = {
  schemaVersion: 1,
  repository: process.env.GITHUB_REPOSITORY ?? null,
  pullRequest: process.env.VISUAL_REVIEW_PR_NUMBER ?? null,
  headSha: process.env.VISUAL_REVIEW_HEAD_SHA ?? null,
  previewUrl: process.env.PLAYWRIGHT_BASE_URL ?? null,
  plan: "specs/mstefan-site-review.md",
  workflowRun: process.env.GITHUB_RUN_ID
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
};
writeFileSync(join(evidenceDirectory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

const videos = findFiles(resultsDirectory, ".webm");
if (videos.length !== 1) {
  throw new Error(`Expected exactly one Playwright video, found ${videos.length}: ${videos.map(basename).join(", ")}`);
}
if (statSync(videos[0]).size === 0) throw new Error("Playwright produced an empty video.");

const reviewVideo = join(evidenceDirectory, "mstefan-site-review.mp4");
execFileSync("ffmpeg", [
  "-y",
  "-i", videos[0],
  "-an",
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  reviewVideo,
], { stdio: "inherit" });

if (statSync(reviewVideo).size === 0) throw new Error("Evidence packaging produced an empty MP4.");
