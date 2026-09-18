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
const publishedMedia: Access = async ({ req }) => {
  if (req.user) return true;
  const about = await req.payload.findGlobal({
    slug: "about", draft: false, depth: 0, overrideAccess: true,
  });
  return about._status === "published" && about.photo
    ? { id: { equals: about.photo } }
    : false;
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
    fields: [],
  }],
  globals: [pageGlobal("home"), pageGlobal("about")],
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  onInit: async (payload) => {
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
