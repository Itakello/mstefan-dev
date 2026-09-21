import assert from "node:assert/strict";
import test from "node:test";

import { parsePublicationProjectRows, parseNotionProjectInventoryPage, parseNotionProjectPage } from "../lib/notion";
import { findMissingInventoryRepositories } from "../lib/projectInventory";
import { projectPreviewSummary } from "../lib/projectPresentation";
import { loadPublicProjects, selectPublicProjectLocale } from "../lib/publicProjects";

function page(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    properties: {
      Name: { title: [{ plain_text: "Bilingual project" }] },
      Status: { status: { name: "Added" } },
      Summary: { rich_text: [{ plain_text: "English long summary." }] },
      "Summary IT": { rich_text: [{ plain_text: "Riepilogo lungo italiano." }] },
      "Short summary": { rich_text: [{ plain_text: "English short." }] },
      "Short summary IT": { rich_text: [{ plain_text: "Italiano breve." }] },
      URL: { url: "https://github.com/Itakello/bilingual-project" },
      Tags: { multi_select: [{ name: "TypeScript" }] },
    },
    ...overrides,
  };
}

test("parses only Added Notion projects with both nonblank long summaries", () => {
  const parsed = parseNotionProjectPage(page());
  const properties = page().properties;

  assert.deepEqual(parsed?.copy, {
    en: { summary: "English long summary.", shortSummary: "English short." },
    it: { summary: "Riepilogo lungo italiano.", shortSummary: "Italiano breve." },
  });
  assert.equal(parseNotionProjectPage(page({
    properties: { ...properties, Status: { status: { name: "To Add" } } },
  })), null);
  assert.equal(parseNotionProjectPage(page({
    properties: { ...properties, Status: { status: null } },
  })), null);
  assert.equal(parseNotionProjectPage(page({
    properties: { ...properties, Summary: { rich_text: [{ plain_text: "  " }] } },
  })), null);
  assert.equal(parseNotionProjectPage(page({
    properties: { ...properties, "Summary IT": { rich_text: [] } },
  })), null);
  assert.equal(parseNotionProjectPage(page({
    properties: { ...properties, Name: { title: [] } },
  })), null);
});

test("keeps short summaries optional without synthesizing either locale", () => {
  const parsed = parseNotionProjectPage(page({
    properties: {
      ...page().properties,
      "Short summary": { rich_text: [] },
      "Short summary IT": { rich_text: [{ plain_text: "   " }] },
    },
  }));

  assert.deepEqual(parsed?.copy, {
    en: { summary: "English long summary." },
    it: { summary: "Riepilogo lungo italiano." },
  });
});

test("projects are projected with only the requested locale and no cross-language fallback", () => {
  const project = parseNotionProjectPage(page({
    properties: {
      ...page().properties,
      "Short summary IT": { rich_text: [] },
    },
  }));
  assert.ok(project);

  assert.deepEqual(selectPublicProjectLocale(project, "en"), {
    title: "Bilingual project",
    summary: "English long summary.",
    shortSummary: "English short.",
    url: "https://github.com/Itakello/bilingual-project",
    tags: ["TypeScript"],
  });
  assert.deepEqual(selectPublicProjectLocale(project, "it"), {
    title: "Bilingual project",
    summary: "Riepilogo lungo italiano.",
    url: "https://github.com/Itakello/bilingual-project",
    tags: ["TypeScript"],
  });
});

test("preserves the Notion year for a project without GitHub enrichment", async () => {
  const notionProject = parseNotionProjectPage(page({
    properties: {
      ...page().properties,
      Year: { number: 2023 },
      URL: { url: "https://example.com/project" },
    },
  }));
  assert.ok(notionProject);

  const loaded = await loadPublicProjects("en", {
    fetchProjects: async () => [notionProject],
    fetchRepos: async () => [],
    vercelEnv: "production",
  });

  assert.deepEqual(loaded.orderedYears, ["2023"]);
  assert.equal(loaded.projects[0].year, "2023");
});

test("keeps incomplete existing rows in the discovery inventory but out of publication", () => {
  const incomplete = page({
    properties: {
      ...page().properties,
      "Summary IT": { rich_text: [] },
    },
  });

  assert.equal(parseNotionProjectPage(incomplete), null);
  assert.deepEqual(parseNotionProjectInventoryPage(incomplete), {
    title: "Bilingual project",
    url: "https://github.com/Itakello/bilingual-project",
    status: "Added",
  });
  assert.deepEqual(
    findMissingInventoryRepositories(
      [parseNotionProjectInventoryPage(incomplete)!],
      [{
        name: "bilingual-project",
        html_url: "https://github.com/Itakello/bilingual-project",
        description: "Existing incomplete Notion row.",
        language: "TypeScript",
        archived: false,
        fork: false,
        pushed_at: "2026-08-17T00:00:00Z",
      }],
      "Itakello",
    ),
    [],
  );
});

test("fails closed when an Added publication query contains an incomplete row", async () => {
  const incomplete = page({
    properties: {
      ...page().properties,
      "Summary IT": { rich_text: [] },
    },
  });

  assert.throws(
    () => parsePublicationProjectRows([page(), incomplete]),
    /Invalid public project publication record/,
  );

  const loaded = await loadPublicProjects("it", {
    fetchProjects: async () => parsePublicationProjectRows([page(), incomplete]),
    fetchRepos: async () => [],
  });
  assert.deepEqual(loaded.publication, {
    status: "error",
    projects: [],
    message: "error",
  });
});

test("keeps To Add rows in discovery inventory without making them public", () => {
  const toAdd = page({
    properties: {
      ...page().properties,
      Status: { status: { name: "To Add" } },
      Summary: { rich_text: [] },
      "Summary IT": { rich_text: [] },
    },
  });

  assert.equal(parseNotionProjectPage(toAdd), null);
  assert.equal(parseNotionProjectInventoryPage(toAdd)?.status, "To Add");
});

test("keeps URL identity in inventory even when the Notion title is malformed", () => {
  const inventory = parseNotionProjectInventoryPage(page({
    properties: {
      ...page().properties,
      Name: { title: [] },
      "Summary IT": { rich_text: [] },
    },
  }));

  assert.deepEqual(inventory, {
    url: "https://github.com/Itakello/bilingual-project",
    status: "Added",
  });
});

test("keeps Notion-approved publication when GitHub enrichment is unavailable", async () => {
  const loaded = await loadPublicProjects("it", {
    fetchProjects: async () => [parseNotionProjectPage(page())!],
    fetchRepos: async () => null,
  });

  assert.equal(loaded.publication.status, "ready");
  assert.deepEqual(loaded.projects.map((project) => project.title), ["Bilingual project"]);
  assert.equal(loaded.projects[0].summary, "Riepilogo lungo italiano.");
});

test("keeps Notion-approved publication when GitHub enrichment throws", async () => {
  const loaded = await loadPublicProjects("it", {
    fetchProjects: async () => [parseNotionProjectPage(page())!],
    fetchRepos: async () => { throw new Error("GitHub unavailable"); },
  });

  assert.equal(loaded.publication.status, "ready");
  assert.deepEqual(loaded.projects.map((project) => project.title), ["Bilingual project"]);
});

test("permits production publication without GitHub enrichment", async () => {
  const loaded = await loadPublicProjects("en", {
    fetchProjects: async () => [parseNotionProjectPage(page())!],
    fetchRepos: async () => null,
    vercelEnv: "production",
  });

  assert.equal(loaded.publication.status, "ready");
  assert.deepEqual(loaded.projects.map((project) => project.title), ["Bilingual project"]);
});

test("permits production publication with malformed GitHub enrichment", async () => {
  const loaded = await loadPublicProjects("en", {
    fetchProjects: async () => [parseNotionProjectPage(page())!],
    fetchRepos: async () => ({ message: "unexpected 200 body" }) as never,
    vercelEnv: "production",
  });

  assert.equal(loaded.publication.status, "ready");
  assert.deepEqual(loaded.projects.map((project) => project.title), ["Bilingual project"]);
});

test("does not wait indefinitely for stalled GitHub enrichment", { timeout: 5_000 }, async () => {
  const loaded = await loadPublicProjects("en", {
    fetchProjects: async () => [parseNotionProjectPage(page())!],
    fetchRepos: async () => new Promise<never>(() => {}),
    vercelEnv: "production",
  });

  assert.equal(loaded.publication.status, "ready");
  assert.deepEqual(loaded.projects.map((project) => project.title), ["Bilingual project"]);
});

test("blocks production regeneration when the Notion Projects source is unavailable", async () => {
  await assert.rejects(
    loadPublicProjects("en", {
      fetchProjects: async () => null,
      fetchRepos: async () => [],
      vercelEnv: "production",
    }),
    /Cannot publish without valid Notion Projects data/,
  );
});

test("uses an existing title-only inventory row to prevent a duplicate proposal", () => {
  assert.deepEqual(
    findMissingInventoryRepositories(
      [{ title: "bilingual-project", status: "To Add" }],
      [{
        name: "bilingual-project",
        html_url: "https://github.com/Itakello/bilingual-project",
        description: "Already queued.",
        language: "TypeScript",
        archived: false,
        fork: false,
        pushed_at: "2026-08-17T00:00:00Z",
      }],
      "Itakello",
    ),
    [],
  );
});

test("treats a harmless trailing slash as the same canonical repository URL", () => {
  assert.deepEqual(
    findMissingInventoryRepositories(
      [{ url: " https://github.com/Itakello/bilingual-project/ ", status: "Added" }],
      [{
        name: "bilingual-project",
        html_url: "https://github.com/itakello/bilingual-project",
        description: "Already tracked under the canonical URL.",
        language: "TypeScript",
        archived: false,
        fork: false,
        pushed_at: "2026-08-17T00:00:00Z",
      }],
      "Itakello",
    ),
    [],
  );
});

test("does not use a title fallback when inventory has a canonical URL for another repository", () => {
  const missing = findMissingInventoryRepositories(
    [{
      title: "bilingual-project",
      url: "https://github.com/Itakello/different-project",
      status: "Added",
    }],
    [{
      name: "bilingual-project",
      html_url: "https://github.com/Itakello/bilingual-project",
      description: "Not the canonical URL.",
      language: "TypeScript",
      archived: false,
      fork: false,
      pushed_at: "2026-08-17T00:00:00Z",
    }],
    "Itakello",
  );

  assert.deepEqual(missing.map((repo) => repo.url), ["https://github.com/Itakello/bilingual-project"]);
});

test("project previews use the selected locale's short summary or its own long summary", () => {
  const project = parseNotionProjectPage(page({
    properties: {
      ...page().properties,
      "Short summary IT": { rich_text: [] },
    },
  }));
  assert.ok(project);

  assert.equal(projectPreviewSummary(selectPublicProjectLocale(project, "en")), "English short.");
  assert.equal(projectPreviewSummary(selectPublicProjectLocale(project, "it")), "Riepilogo lungo italiano.");
});
