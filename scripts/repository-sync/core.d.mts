export interface RepositorySyncProposal {
  schemaVersion: 1;
  repository: {
    id: string;
    fullName: string;
    url: string;
    visibility: string;
    defaultBranch: string;
  };
  sourceCommitSha: string;
  summaryProposal: { value: string; status: "needs-approval" };
  detectedTechnologies: string[];
  selectedTechnologies: Array<{
    name: string;
    evidenceCategory: string;
    stackMatch:
      | { status: "matched"; name: string; category: string; websiteVisible: boolean }
      | { status: "missing" | "not-checked"; suggestedCategory: string };
    evidence: Array<{ path: string; detail: string }>;
  }>;
  publication: {
    status: "blocked-pending-approval";
    privateRepositoriesExcluded: true;
    generatedSummaryRequiresApproval: true;
  };
}

export function buildRepositorySyncProposal(input: {
  repository: unknown;
  evidenceManifest: unknown;
  publicTechnologyManifest: unknown;
  stackCatalog?: unknown[];
}): RepositorySyncProposal;
