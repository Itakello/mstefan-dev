import assert from "node:assert/strict";
import test from "node:test";

import {
  canRenderWebsitePreview,
  personalPreviewOrigin,
  workItemsFromProjects,
  WEBSITE_PREVIEW_MAX_DEPTH,
  websitePreviewUrl,
} from "../lib/websiteShowcase";
import { loadPublicProjects } from "../lib/publicProjects";
import { parseNotionProjectPage } from "../lib/notion";

const project = { title: "Approved site", summary: "Canonical description.", url: "https://github.com/Itakello/site" };
const showcaseWebsites = workItemsFromProjects([
  { ...project, websiteUrl: "https://www.mstefan.dev" },
  { ...project, websiteUrl: "https://www.thekarakaltimes.com" },
]);

test("showcase websites use unique secure public URLs", () => {
  const urls = showcaseWebsites.map((website) => website.url);

  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.every((url) => url?.startsWith("https://")));
  assert.equal(showcaseWebsites[0].preview, true);
  assert.equal(showcaseWebsites[1].preview, false);
});

test("the personal website preview stays in the selected locale", () => {
  assert.equal(websitePreviewUrl(showcaseWebsites[0], "it"), "https://www.mstefan.dev/it");
  assert.equal(websitePreviewUrl(showcaseWebsites[0], "en", "http://127.0.0.1:3107"), "http://127.0.0.1:3107/en");
  assert.equal(websitePreviewUrl(showcaseWebsites[1], "it"), "https://www.thekarakaltimes.com/");
});

test("preview builds embed the live personal site instead of an unconfigured preview homepage", () => {
  assert.equal(personalPreviewOrigin("127.0.0.1", "http://127.0.0.1:3000"), "https://www.mstefan.dev");
  assert.equal(personalPreviewOrigin("mstefan-dev-preview.vercel.app", "https://mstefan-dev-preview.vercel.app"), "https://www.mstefan.dev");
  assert.equal(personalPreviewOrigin("www.mstefan.dev", "https://www.mstefan.dev"), "https://www.mstefan.dev");
});

test("recursive previews stop at the configured depth", () => {
  assert.equal(canRenderWebsitePreview(WEBSITE_PREVIEW_MAX_DEPTH - 1), true);
  assert.equal(canRenderWebsitePreview(WEBSITE_PREVIEW_MAX_DEPTH), false);
});

test("gallery membership and copy derive exclusively from approved publication records", () => {
  assert.deepEqual(workItemsFromProjects([]), []);
  assert.equal(workItemsFromProjects([project])[0].url, undefined);
  assert.equal(workItemsFromProjects([project])[0].sourceUrl, project.url);
  assert.equal(showcaseWebsites[0].name, project.title);
  assert.equal(showcaseWebsites[0].description, project.summary);
  assert.equal(workItemsFromProjects([{ ...project, shortSummary: "Localized short.", websiteUrl: "https://example.com" }])[0].shortDescription, "Localized short.");
});

test("only the permitted personal root origin can be embedded", () => {
  for (const url of ["https://www.thekarakaltimes.com", "https://mstefan.dev.evil.test", "https://www.mstefan.dev:8443", "https://www.mstefan.dev/admin", "https://www.mstefan.dev?preview=1"]) {
    assert.equal(workItemsFromProjects([{ ...project, websiteUrl: url }])[0].preview, false, url);
  }
  for (const url of ["javascript:alert(1)", "http://example.com", "https://user:password@example.com", "bad-url"]) {
    assert.throws(() => workItemsFromProjects([{ ...project, websiteUrl: url }]), /website URL/);
  }
  assert.throws(() => workItemsFromProjects([{ ...project, websiteUrl: "https://example.com" }, { ...project, websiteUrl: "https://example.com/" }]), /duplicate/);
});

test("website metadata preserves repository identity and selected Notion locale", async () => {
  const parsed = parseNotionProjectPage({ properties: {
    Name: { title: [{ plain_text: project.title }] }, Status: { status: { name: "Added" } },
    Summary: { rich_text: [{ plain_text: "English summary." }] }, "Summary IT": { rich_text: [{ plain_text: "Descrizione italiana." }] },
    URL: { url: project.url }, "Website URL": { type: "url", url: "https://example.com" },
  } });
  assert.ok(parsed);
  const loaded = await loadPublicProjects("it", { fetchProjects: async () => [parsed], fetchRepos: async () => [], vercelEnv: "production" });
  assert.equal(loaded.projects[0].url, project.url);
  assert.equal(workItemsFromProjects(loaded.projects)[0].description, "Descrizione italiana.");
  assert.deepEqual(workItemsFromProjects((await loadPublicProjects("en", { fetchProjects: async () => null, fetchRepos: async () => [] })).projects), []);
  await assert.rejects(loadPublicProjects("en", { fetchProjects: async () => null, fetchRepos: async () => [], vercelEnv: "production" }));
});


test("work entries cover website-only, repository-only and combined projects", () => {
  const [websiteOnly, repositoryOnly, combined] = workItemsFromProjects([
    { title: "Website", summary: "Website story.", websiteUrl: "https://example.com" },
    project,
    { ...project, websiteUrl: "https://www.mstefan.dev" },
  ]);
  assert.equal(websiteOnly.sourceUrl, undefined);
  assert.equal(websiteOnly.url, "https://example.com/");
  assert.equal(repositoryOnly.url, undefined);
  assert.equal(repositoryOnly.sourceUrl, project.url);
  assert.equal(combined.preview, true);
  assert.equal(combined.sourceUrl, project.url);
});
