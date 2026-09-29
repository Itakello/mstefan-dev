import path from "node:path";
import { fileURLToPath } from "node:url";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { buildConfig, type Access, type Field, type GlobalConfig } from "payload";

import { getCopy } from "./lib/i18n/copy";
import { supportedLocales } from "./lib/i18n/config";

if (process.env.VERCEL) throw new Error("Payload requires a persistent self-hosted runtime.");
if (process.env.NODE_ENV === "production" && !process.env.PAYLOAD_DATA_DIR) {
  throw new Error("PAYLOAD_DATA_DIR must point to persistent storage in production.");
}
if (!process.env.PAYLOAD_SECRET || process.env.PAYLOAD_SECRET.length < 32) {
  throw new Error("PAYLOAD_SECRET must contain at least 32 characters.");
}

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.PAYLOAD_DATA_DIR ? path.resolve(process.env.PAYLOAD_DATA_DIR) : dirname;
const authenticated: Access = ({ req }) => Boolean(req.user);
const mediaID = (value: number | { id: number } | null | undefined): number | null =>
  typeof value === "number" ? value : value?.id ?? null;
const publishedMedia: Access = async ({ req }) => {
  if (req.user) return true;
  const [about, ...careers] = await Promise.all([
    req.payload.findGlobal({ slug: "about", draft: false, depth: 0, overrideAccess: true }),
    ...supportedLocales.map((locale) => req.payload.findGlobal({
      slug: "career", locale, fallbackLocale: false, draft: false, depth: 0, overrideAccess: true,
    })),
  ]);
  const ids = new Set<number>();
  if (about._status === "published") {
    const id = mediaID(about.photo);
    if (id !== null) ids.add(id);
  }
  for (const career of careers) {
    if (career._status !== "published") continue;
    for (const job of career.jobs ?? []) {
      if (!job.summary?.trim()) continue;
      const id = mediaID(job.photo);
      if (id !== null) ids.add(id);
    }
  }
  return ids.size ? { id: { in: [...ids] } } : false;
};

const publishedDocuments: Access = async ({ req }) => {
  if (req.user) return true;
  const careers = await Promise.all(supportedLocales.map((locale) => req.payload.findGlobal({
    slug: "career", locale, fallbackLocale: false, draft: false, depth: 0, overrideAccess: true,
  })));
  const ids = new Set<number>();
  for (const career of careers) {
    if (career._status !== "published") continue;
    for (const job of career.jobs ?? []) {
      for (const document of job.documents ?? []) {
        const id = mediaID(document.file);
        if (id !== null) ids.add(id);
      }
    }
  }
  return ids.size ? { id: { in: [...ids] } } : false;
};

function pageGlobal(slug: "home" | "about"): GlobalConfig {
  return {
    slug,
    label: slug === "home" ? "Homepage" : "About",
    access: { read: authenticated, update: authenticated, readVersions: authenticated },
    versions: { drafts: true, max: 20 },
    admin: {
      components: { elements: { beforeDocumentControls: ["./components/cms/PreviewLocaleSync#PreviewLocaleSync"] } },
      description: "Bilingual page text and About photo. Project and Stack data remain in Notion.",
      livePreview: {
        url: ({ locale }) => `/${locale?.code === "it" ? "it" : "en"}${slug === "about" ? "/about" : ""}?preview=1`,
      },
    },
    fields: [...Object.keys(getCopy("en")[slug]).map((name): Field => {
      const field = {
        name, localized: true, required: true,
        admin: { components: { Label: "./components/cms/LocalizedFieldLabel#LocalizedFieldLabel" } },
      };
      return /Paragraph|introduction|Description/.test(name)
        ? { ...field, type: "textarea" }
        : { ...field, type: "text" };
    }), ...(slug === "about" ? [{
      name: "photo", type: "upload" as const, relationTo: "media" as const,
      admin: { components: { Label: "./components/cms/LocalizedFieldLabel#LocalizedFieldLabel" } },
    }] : [])],
  };
}

const validateHexColor = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
  ? true : "Use a six-digit hex color, for example #c77835.";

function validateCareerBranches(value: unknown) {
  if (!Array.isArray(value)) return true;
  const jobs = value as { branchName?: string; parentBranchName?: string; startDate?: string; endDate?: string; ongoing?: boolean }[];
  const named = new Map(jobs.map((job) => [job.branchName, job]));
  const now = Date.now();
  const end = (job: typeof jobs[number]) => job.ongoing ? now : (job.endDate ? Date.parse(job.endDate) : null);
  if (named.size !== jobs.length) return "Each experience must have a unique branch name.";
  for (const job of jobs) {
    const seen = new Set([job.branchName]);
    let parentName = job.parentBranchName;
    while (parentName && parentName !== "main") {
      if (seen.has(parentName)) return "Parent branches cannot form a cycle.";
      const parent = named.get(parentName);
      if (!parent) return `Parent branch ${parentName} must name another experience.`;
      seen.add(parentName);
      parentName = parent.parentBranchName;
    }
    const parent = named.get(job.parentBranchName);
    if (parent?.startDate && job.startDate && end(parent) !== null && end(job) !== null &&
      (Date.parse(job.startDate) < Date.parse(parent.startDate) || end(job)! > end(parent)!)) {
      return `The dates of ${job.branchName} must fall within its parent branch.`;
    }
  }
  return true;
}

const careerGlobal: GlobalConfig = {
  slug: "career",
  label: "Career",
  access: { read: authenticated, update: authenticated, readVersions: authenticated },
  versions: { drafts: true, max: 20 },
  admin: {
    components: { elements: { beforeDocumentControls: ["./components/cms/PreviewLocaleSync#PreviewLocaleSync"] } },
    description: "Personal career history. Arrange experiences newest first; dates are optional.",
    livePreview: {
      url: ({ locale }) => `/${locale?.code === "it" ? "it" : "en"}/about?preview=1&previewSource=career`,
    },
  },
  fields: [{ name: "mainlineColor", type: "text", localized: true, required: true, defaultValue: "#25b8f3", validate: validateHexColor }, {
    name: "laneSpacing", label: "Branch spacing (px)", type: "number", localized: true, defaultValue: 24, min: 18, max: 64,
    validate: (value: unknown) => value == null || (typeof value === "number" && Number.isInteger(value) && value >= 18 && value <= 64)
      ? true : "Use a whole number between 18 and 64.",
  }, {
    name: "jobs", type: "array", label: "Experiences", localized: true,
    validate: validateCareerBranches,
    admin: { description: "Drag entries into display order, with the newest at the top." },
    fields: [
      {
        name: "branchName", type: "text", required: true,
        admin: { description: "Choose a branch path, for example work/amazon or education/university." },
        validate: (value: unknown) => typeof value === "string" && /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)+$/i.test(value)
          ? true : "Use a branch path such as work/amazon or education/university.",
      },
      {
        name: "parentBranchName", label: "Parent branch", type: "text",
        admin: { description: "Leave empty for main. For a related experience, use its parent’s branch name, such as education/university." },
      },
      { name: "company", label: "Organization", type: "text", required: true },
      { name: "role", label: "Role or qualification", type: "text", required: true },
      { name: "summary", type: "textarea", admin: { description: "Write this experience's story to show it in About when selected." } },
      { name: "photo", type: "upload", relationTo: "media", admin: { description: "Shown with this experience in About only when its summary has content." } },
      { name: "documents", type: "array", fields: [
        { name: "title", type: "text", required: true },
        { name: "file", type: "upload", relationTo: "documents", required: true },
      ] },
      { name: "startDate", type: "date" },
      { name: "ongoing", label: "Currently ongoing", type: "checkbox", defaultValue: false,
        admin: { description: "Keep this experience open through today. Any stored end date is ignored while enabled." } },
      { name: "endDate", type: "date", admin: { condition: (_, siblingData) => !siblingData?.ongoing } },
      {
        name: "color", type: "text", required: true, defaultValue: "#c77835",
        admin: { description: "Branch color as a six-digit hex value, for example #c77835." },
        validate: validateHexColor,
      },
    ],
  }],
};

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET,
  telemetry: false,
  email: () => ({
    name: "disabled",
    defaultFromAddress: "me@mstefan.dev",
    defaultFromName: "mstefan",
    // Payload's default adapter logs reset links; fail closed until delivery is configured.
    sendEmail: async () => { throw new Error("Email delivery is not configured."); },
  }),
  admin: {
    user: "users",
    importMap: { baseDir: dirname, importMapFile: path.resolve(dirname, "app/(payload)/admin/importMap.ts") },
  },
  db: sqliteAdapter({
    client: { url: `file:${path.resolve(dataDir, ".payload-local.db")}` },
    migrationDir: path.resolve(dirname, "migrations"),
    transactionOptions: {},
  }),
  localization: { locales: [...supportedLocales], defaultLocale: "en", fallback: false, defaultLocalePublishOption: "active" },
  collections: [{
    slug: "users",
    auth: true,
    admin: { useAsTitle: "email" },
    access: { create: authenticated, read: authenticated, update: authenticated, delete: authenticated },
    fields: [],
  }, {
    slug: "media",
    labels: { singular: "Image", plural: "Images" },
    upload: {
      staticDir: path.resolve(dataDir, ".payload-media"),
      mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    },
    access: { read: publishedMedia, create: authenticated, update: authenticated, delete: authenticated },
    fields: [{ name: "alt", type: "text" }],
  }, {
    slug: "documents",
    labels: { singular: "Document", plural: "Documents" },
    upload: {
      staticDir: path.resolve(dataDir, ".payload-documents"),
      mimeTypes: ["application/pdf"],
    },
    access: { read: publishedDocuments, create: authenticated, update: authenticated, delete: authenticated },
    fields: [],
  }],
  globals: [pageGlobal("home"), pageGlobal("about"), careerGlobal],
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  onInit: async (payload) => {
    const career = await payload.findGlobal({ slug: "career", draft: true, overrideAccess: true });
    if (!career.id) {
      const jobs = [{ branchName: "work/amazon", company: "Amazon", role: "Software Development Engineer I", color: "#d568fc" }];
      const transactionID = await payload.db.beginTransaction();
      if (!transactionID) throw new Error("Career initialization requires a database transaction.");
      try {
        for (const locale of supportedLocales) {
          await payload.updateGlobal({
            slug: "career", locale, publishSpecificLocale: locale, overrideAccess: true,
            req: { transactionID }, data: { jobs, _status: "published" },
          });
        }
        await payload.db.commitTransaction(transactionID);
      } catch (error) {
        await payload.db.rollbackTransaction(transactionID);
        throw error;
      }
    }
    for (const slug of ["home", "about"] as const) {
      for (const locale of supportedLocales) {
        const existing = await payload.findGlobal({ slug, locale, draft: true, fallbackLocale: false, overrideAccess: true });
        const copy = getCopy(locale)[slug];
        // Preserve every existing locale, including unpublished edits, after restarts.
        if (Object.keys(copy).some((field) => (existing as unknown as Record<string, unknown>)[field] != null)) continue;
        await payload.updateGlobal({
          slug, locale, publishSpecificLocale: locale, overrideAccess: true,
          data: { ...copy, _status: "published" },
        });
      }
    }
  },
});
