import assert from "node:assert/strict";
import test from "node:test";

import {
  workItemsFromProjects,
  websitePreviewUrl,
  websitePreviewTargets,
} from "../lib/websiteShowcase";
import { websiteScreenshotPaths } from "../lib/websiteScreenshots";
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
  assert.equal(showcaseWebsites[1].preview, true);
});

test("the personal website preview stays in the selected locale", () => {
  assert.equal(websitePreviewUrl(showcaseWebsites[0], "it"), "https://www.mstefan.dev/it");
  assert.equal(websitePreviewUrl(showcaseWebsites[1], "it"), "https://www.thekarakaltimes.com/");
});

test("gallery membership and copy derive exclusively from approved publication records", () => {
  assert.deepEqual(workItemsFromProjects([]), []);
  assert.equal(workItemsFromProjects([project])[0].url, undefined);
  assert.equal(workItemsFromProjects([project])[0].sourceUrl, project.url);
  assert.equal(showcaseWebsites[0].name, project.title);
  assert.equal(showcaseWebsites[0].description, project.summary);
  assert.equal(workItemsFromProjects([{ ...project, shortSummary: "Localized short.", websiteUrl: "https://example.com" }])[0].shortDescription, "Localized short.");
});

test("secure website URLs enable screenshots without embedding", () => {
  assert.equal(showcaseWebsites[1].preview, true);
  for (const url of ["https://www.thekarakaltimes.com.evil.test", "https://www.thekarakaltimes.com/about", "https://mstefan.dev.evil.test", "https://www.mstefan.dev:8443", "https://www.mstefan.dev/admin", "https://www.mstefan.dev?preview=1"]) {
    assert.equal(workItemsFromProjects([{ ...project, websiteUrl: url }])[0].preview, true, url);
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

test("invalid approved website URLs fail the whole publication source", async () => {
  for (const [caseName, websiteUrls] of [
    ["malformed", ["bad-url"]],
    ["non-HTTPS", ["http://example.com"]],
    ["credentialed", ["https://user:password@example.com"]],
    ["duplicate normalized URL", ["https://example.com", "https://example.com/"]],
  ] as const) {
    const fetchProjects = async () => websiteUrls.map((websiteUrl) => parseNotionProjectPage({ properties: {
      Name: { title: [{ plain_text: project.title }] }, Status: { status: { name: "Added" } },
      Summary: { rich_text: [{ plain_text: project.summary }] },
      "Summary IT": { rich_text: [{ plain_text: project.summary }] },
      "Website URL": { type: "url", url: websiteUrl },
    } })!);
    const local = await loadPublicProjects("en", { fetchProjects, fetchRepos: async () => [], vercelEnv: "development" });
    assert.equal(local.publication.status, "error", caseName);
    assert.deepEqual(local.projects, [], caseName);
    assert.deepEqual(workItemsFromProjects(local.projects), [], caseName);
    await assert.rejects(
      loadPublicProjects("en", { fetchProjects, fetchRepos: async () => [], vercelEnv: "production" }),
      /Cannot publish without valid Notion Projects data/,
      caseName,
    );
  }
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

test("legacy non-GitHub project URLs remain visit links without enabling embedding", () => {
  for (const url of ["https://example.com/project", "https://www.mstefan.dev", "http://example.com/project"]) {
    const item = workItemsFromProjects([{ ...project, url }])[0];
    assert.equal(websitePreviewUrl(item, "en"), url);
    assert.equal(item.sourceUrl, undefined);
    assert.equal(item.preview, false);
  }
  const item = workItemsFromProjects([{ ...project, url: "https://legacy.example.com", websiteUrl: "https://current.example.com" }])[0];
  assert.equal(item.url, "https://current.example.com/");
});

test("screenshot assets normalize URL identity and separate locale and viewport", () => {
  const english = websiteScreenshotPaths("https://example.com", "en");
  assert.deepEqual(english, websiteScreenshotPaths("https://example.com/", "en"));
  assert.notEqual(english.desktop, english.mobile);
  assert.notEqual(english.desktop, websiteScreenshotPaths("https://example.com", "it").desktop);
  assert.notEqual(english.desktop, websiteScreenshotPaths("https://example.com/other", "en").desktop);
  assert.match(english.desktop, /^\/website-previews\/[a-f0-9]{64}\/en-desktop\.png$/);
  assert.deepEqual(websiteScreenshotPaths("https://example.com", "en", "https://previews.mstefan.dev"), {
    desktop: `https://previews.mstefan.dev${english.desktop}`,
    mobile: `https://previews.mstefan.dev${english.mobile}`,
  });
});


test("additional preview targets transfer from canonical Notion into work entries", async () => {
  const parsed = parseNotionProjectPage({ properties: {
    Name: { title: [{ plain_text: project.title }] }, Status: { status: { name: "Added" } },
    Summary: { rich_text: [{ plain_text: "English." }] }, "Summary IT": { rich_text: [{ plain_text: "Italiano." }] },
    "Website URL": { type: "url", url: "https://example.com" },
    "Preview URLs": { type: "rich_text", rich_text: [{ plain_text: " https://example.com/about\n\nhttps://example.com/work?sort=year " }] },
  } });
  assert.ok(parsed);
  const loaded = await loadPublicProjects("it", { fetchProjects: async () => [parsed], fetchRepos: async () => [], vercelEnv: "production" });
  const item = workItemsFromProjects(loaded.projects)[0];
  assert.deepEqual(item.previewUrls, ["https://example.com/about", "https://example.com/work?sort=year"]);
  assert.deepEqual(websitePreviewTargets({ websiteUrl: item.url, previewUrls: item.previewUrls }), ["https://example.com/", ...item.previewUrls!]);
});

test("additional targets are bounded, unique, secure, and fail publication closed", async () => {
  const properties = {
    Name: { title: [{ plain_text: project.title }] }, Status: { status: { name: "Added" } },
    Summary: { rich_text: [{ plain_text: "English." }] }, "Summary IT": { rich_text: [{ plain_text: "Italiano." }] },
    "Website URL": { type: "url", url: "https://example.com" },
  };
  assert.ok(parseNotionProjectPage({ properties: { ...properties, "Preview URLs": { type: "rich_text", rich_text: [] } } }));
  for (const value of ["https://other.example/about", "https://example.com/", "http://example.com/about", "https://user@example.com/about", "https://example.com/about#part", "not-a-url", "https:example.com/about", "https://example.com/about#", "https://example.com/about\nhttps://example.com/about", Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`).join("\n")]) {
    assert.equal(parseNotionProjectPage({ properties: { ...properties, "Preview URLs": { type: "rich_text", rich_text: [{ plain_text: value }] } } }), null, value);
  }
  assert.equal(parseNotionProjectPage({ properties: { ...properties, "Preview URLs": { type: "url", url: null } } }), null);
  assert.throws(() => websitePreviewTargets({ previewUrls: ["https://example.com/about"] }), /require/);
  await assert.rejects(loadPublicProjects("en", { fetchProjects: async () => [{ title: "Invalid", status: "Added", copy: { en: { summary: "English." }, it: { summary: "Italiano." } }, websiteUrl: "https://example.com", previewUrls: ["https://other.example/about"] }], fetchRepos: async () => [], vercelEnv: "production" }), /Cannot publish/);
  assert.equal(websitePreviewTargets({ websiteUrl: "https://example.com", previewUrls: Array.from({ length: 9 }, (_, i) => `https://example.com/${i}`) }).length, 10);
});

test("personal capture pages follow requested locale without changing page or query", () => {
  for (const [url, expected] of [
    ["https://www.mstefan.dev/en", "https://www.mstefan.dev/it"],
    ["https://mstefan.dev/it/about", "https://mstefan.dev/it/about"],
    ["https://www.mstefan.dev/en/projects?project=site", "https://www.mstefan.dev/it/projects?project=site"],
    ["https://www.mstefan.dev/about", "https://www.mstefan.dev/it/about"],
    ["https://example.com/en/about", "https://example.com/en/about"],
  ]) assert.equal(websitePreviewUrl({ id: url, url, preview: true, name: "Site", description: "Site" }, "it"), expected);
});


test("Karakal capture pages follow its English-prefix and Italian-root routes", () => {
  for (const path of ["/", "/karakal", "/about", "/en", "/en/karakal", "/en/about"]) {
    const website = { id: path, url: `https://www.thekarakaltimes.com${path}`, preview: true, name: "Karakal", description: "Site" };
    const unprefixed = path.replace(/^\/en(?=\/|$)/, "");
    assert.equal(websitePreviewUrl(website, "en"), `https://www.thekarakaltimes.com/en${unprefixed === "/" ? "" : unprefixed}`);
    assert.equal(websitePreviewUrl(website, "it"), `https://www.thekarakaltimes.com${unprefixed || "/"}`);
  }
});
