import assert from "node:assert/strict";
import test from "node:test";

import { buildRepositorySyncProposal } from "../scripts/repository-sync/core.mjs";

const repository = {
  id: 1036248352,
  full_name: "Itakello/mstefan-dev",
  html_url: "https://github.com/Itakello/mstefan-dev",
  visibility: "public",
  default_branch: "master",
  private: false,
  archived: false,
  fork: false,
};

const evidenceManifest = {
  schemaVersion: 1,
  repository: "Itakello/mstefan-dev",
  commitSha: "a".repeat(40),
  summary: "A portfolio website backed by committed repository evidence.",
  technologies: [
    {
      name: "TypeScript",
      category: "language",
      evidence: [{ path: "tsconfig.json", detail: "Configures TypeScript." }],
    },
    {
      name: "Notion",
      category: "service",
      evidence: [{ path: "lib/notion.ts", detail: "Uses the Notion client." }],
    },
  ],
};

const publicTechnologyManifest = {
  schemaVersion: 1,
  technologies: ["TypeScript", "Notion"],
};

test("creates an approval-gated proposal from detected and curated evidence", () => {
  const proposal = buildRepositorySyncProposal({
    repository,
    evidenceManifest,
    publicTechnologyManifest,
    stackCatalog: [
      { name: "TypeScript", category: "Language", websiteVisible: true },
      { name: "Notion", category: "SaaS", websiteVisible: false },
    ],
  });

  assert.equal(proposal.repository.id, "1036248352");
  assert.equal(proposal.sourceCommitSha, "a".repeat(40));
  assert.deepEqual(proposal.detectedTechnologies, ["Notion", "TypeScript"]);
  assert.deepEqual(
    proposal.selectedTechnologies.map(({ name, stackMatch }) => ({ name, stackMatch })),
    [
      {
        name: "TypeScript",
        stackMatch: { status: "matched", name: "TypeScript", category: "Language", websiteVisible: true },
      },
      {
        name: "Notion",
        stackMatch: { status: "matched", name: "Notion", category: "SaaS", websiteVisible: false },
      },
    ],
  );
  assert.equal(proposal.summaryProposal.status, "needs-approval");
  assert.equal(proposal.publication.status, "blocked-pending-approval");
});

test("does not treat inferred evidence categories as curated Stack authority", () => {
  const proposal = buildRepositorySyncProposal({ repository, evidenceManifest, publicTechnologyManifest });
  assert.deepEqual(proposal.selectedTechnologies[1].stackMatch, {
    status: "not-checked",
    suggestedCategory: "SaaS",
  });
});

test("rejects private, archived, and forked repositories", () => {
  for (const override of [{ private: true }, { visibility: "internal" }, { archived: true }, { fork: true }]) {
    assert.throws(
      () => buildRepositorySyncProposal({
        repository: { ...repository, ...override },
        evidenceManifest,
        publicTechnologyManifest,
      }),
      /excluded from repository sync v1/,
    );
  }
});

test("requires an immutable numeric GitHub repository ID", () => {
  for (const id of [undefined, "", "not-an-id"]) {
    assert.throws(
      () => buildRepositorySyncProposal({
        repository: { ...repository, id },
        evidenceManifest,
        publicTechnologyManifest,
      }),
      /numeric GitHub repository ID/,
    );
  }
});

test("rejects curated public technologies without committed-file evidence", () => {
  assert.throws(
    () => buildRepositorySyncProposal({
      repository,
      evidenceManifest,
      publicTechnologyManifest: { schemaVersion: 1, technologies: ["TypeScript", "Terraform"] },
    }),
    /lacks committed-file evidence: Terraform/,
  );
});
