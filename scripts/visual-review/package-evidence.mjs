import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

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
  source: process.env.VISUAL_REVIEW_SOURCE ?? "unspecified",
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

const videos = findFiles(resultsDirectory, ".webm").sort();
const expectedRecordings = 5;
if (videos.length !== expectedRecordings) {
  throw new Error(`Expected ${expectedRecordings} review videos, received ${videos.length}.`);
}
metadata.recordings = videos.map((video, index) => ({
  test: basename(dirname(video)),
  file: `mstefan-site-review-${index + 1}.mp4`,
}));
writeFileSync(join(evidenceDirectory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
for (const [index, video] of videos.entries()) {
  if (statSync(video).size === 0) throw new Error(`Playwright produced an empty video: ${video}`);
  const reviewVideo = join(evidenceDirectory, metadata.recordings[index].file);
  execFileSync("ffmpeg", [
    "-y", "-i", video, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", reviewVideo,
  ], { stdio: "inherit" });
  if (statSync(reviewVideo).size === 0) throw new Error("Evidence packaging produced an empty MP4.");
}
