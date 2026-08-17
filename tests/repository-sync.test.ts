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
  schemaVersion: 2,
  repository: "Itakello/mstefan-dev",
  commitSha: "a".repeat(40),
  summary: {
    en: "A portfolio website backed by committed repository evidence.",
    it: "Un sito portfolio basato su evidenze del repository versionato.",
  },
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
  assert.deepEqual(proposal.summaryProposal.value, evidenceManifest.summary);
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

test("rejects malformed detected technologies before building a proposal", () => {
  for (const [technology, message] of [
    [{ ...evidenceManifest.technologies[0], category: "unknown" }, /Invalid category for TypeScript/],
    [{ ...evidenceManifest.technologies[0], evidence: [] }, /TypeScript must have between 1 and 5 evidence entries/],
    [{ ...evidenceManifest.technologies[0], evidence: [{ path: "", detail: "Configured in package.json." }] }, /TypeScript has an invalid evidence path/],
  ] as const) {
    assert.throws(
      () => buildRepositorySyncProposal({
        repository,
        evidenceManifest: { ...evidenceManifest, technologies: [technology, evidenceManifest.technologies[1]] },
        publicTechnologyManifest,
      }),
      message,
    );
  }
});

test("rejects partial and legacy evidence summaries before creating an approval proposal", () => {
  for (const evidence of [
    { ...evidenceManifest, summary: { en: evidenceManifest.summary.en } },
    { ...evidenceManifest, summary: { en: evidenceManifest.summary.en, it: " " } },
    { ...evidenceManifest, summary: { ...evidenceManifest.summary, fr: "Francais" } },
    { ...evidenceManifest, schemaVersion: 1, summary: evidenceManifest.summary.en },
  ]) {
    assert.throws(
      () => buildRepositorySyncProposal({ repository, evidenceManifest: evidence, publicTechnologyManifest }),
      /schemaVersion 2|manifest\.summary(\.en|\.it| must contain exactly)/,
    );
  }
});
