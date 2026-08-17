import assert from "node:assert/strict";
import test from "node:test";

import { parseNotionProjectPage } from "../lib/notion";
import { projectPreviewSummary } from "../lib/projectPresentation";
import { selectPublicProjectLocale } from "../lib/publicProjects";

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
