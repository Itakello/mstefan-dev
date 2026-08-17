export interface TechnologyManifest {
  schemaVersion: 2;
  repository: string;
  commitSha: string;
  summary: {
    en: string;
    it: string;
  };
  technologies: Array<{
    name: string;
    category: string;
    evidence: Array<{ path: string; detail: string }>;
  }>;
}

export interface ExtractionInput {
  repoDir: string;
  repository: string;
  currentSha: string;
  currentManifest: TechnologyManifest | null;
}

export function validateManifest(
  manifest: unknown,
  options: {
    repoDir: string;
    repository: string;
    commitSha: string;
    trackedFiles: Set<string>;
    requireFilesPresent?: boolean;
  },
): Promise<TechnologyManifest>;

export function diffManifests(previous: TechnologyManifest | null, next: TechnologyManifest): {
  added: string[];
  removed: string[];
  changed: string[];
  summaryChanged: boolean;
  summary: {
    previous: TechnologyManifest["summary"] | null;
    next: TechnologyManifest["summary"];
  };
};

export function processRepositoryTechnologies(options: {
  repoDir: string;
  repository: string;
  statePath: string;
  outputPath: string;
  getCurrentSha: (repoDir: string) => string | Promise<string>;
  getTrackedFiles: (repoDir: string, commitSha: string) => Set<string> | Promise<Set<string>>;
  extract: (
    input: ExtractionInput,
  ) => TechnologyManifest | { manifest: TechnologyManifest; evidenceFiles?: Set<string> } | Promise<TechnologyManifest | { manifest: TechnologyManifest; evidenceFiles?: Set<string> }>;
}): Promise<
  | { status: "unchanged"; currentSha: string }
  | {
      status: "updated";
      currentSha: string;
      diff: ReturnType<typeof diffManifests>;
      manifest: TechnologyManifest;
    }
>;
