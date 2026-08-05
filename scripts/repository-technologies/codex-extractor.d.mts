import type { ExtractionInput, TechnologyManifest } from "./core.mjs";

export interface RepositoryEvidence {
  trackedFiles: string[];
  analyzedFiles: string[];
  contents: Array<{ path: string; content: string }>;
  serializedContents: string;
  limits: {
    maxEvidenceBytes: number;
    maxFileBytes: number;
    maxAnalyzedFiles: number;
    maxSerializedEvidenceBytes: number;
    usedBytes: number;
  };
}

export function listRegularBlobs(repoDir: string, commitSha: string): Promise<Array<{
  path: string;
  objectId: string;
  size: number;
}>>;

export function buildRepositoryEvidence(repoDir: string, commitSha: string): Promise<RepositoryEvidence>;

export function codexExecArguments(options: {
  responsePath: string;
  temporaryDir: string;
  model?: string;
}): string[];

export function extractWithCodex(input: ExtractionInput): Promise<{
  manifest: TechnologyManifest;
  evidenceFiles: Set<string>;
}>;
