import path from "node:path";
import { fileURLToPath } from "node:url";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { buildConfig, type Field, type GlobalConfig } from "payload";

import { getCopy } from "./lib/i18n/copy";
import { supportedLocales } from "./lib/i18n/config";

if (process.env.PAYLOAD_LOCAL_PROTOTYPE !== "1" || process.env.NODE_ENV === "production" || process.env.VERCEL) {
  throw new Error("This Payload prototype is local-development only. Set PAYLOAD_LOCAL_PROTOTYPE=1 and run the private development preview.");
}
if (!process.env.PAYLOAD_SECRET) throw new Error("PAYLOAD_SECRET is required for the local CMS.");

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.PAYLOAD_DATA_DIR ? path.resolve(process.env.PAYLOAD_DATA_DIR) : dirname;
const authenticated = ({ req }: { req: { user?: unknown } }) => Boolean(req.user);

function pageGlobal(slug: "home" | "about"): GlobalConfig {
  return {
    slug,
    label: slug === "home" ? "Homepage" : "About",
    access: { read: authenticated, update: authenticated, readVersions: authenticated },
    versions: { drafts: true, max: 20 },
    admin: {
      components: { elements: { beforeDocumentControls: ["./components/cms/PreviewLocaleSync#PreviewLocaleSync"] } },
      description: "Local prototype: bilingual page text and About photo. Project and Stack data remain in Notion.",
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
      name: "photo", type: "upload" as const, relationTo: "media",
      admin: { components: { Label: "./components/cms/LocalizedFieldLabel#LocalizedFieldLabel" } },
    }] : [])],
  };
}

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET,
  admin: {
    user: "users",
    importMap: { baseDir: dirname, importMapFile: path.resolve(dirname, "app/(payload)/admin/importMap.ts") },
  },
  db: sqliteAdapter({ client: { url: `file:${path.resolve(dataDir, ".payload-local.db")}` } }),
  localization: { locales: [...supportedLocales], defaultLocale: "en", fallback: false },
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
    access: { read: () => true, create: authenticated, update: authenticated, delete: authenticated },
    fields: [],
  }],
  globals: [pageGlobal("home"), pageGlobal("about")],
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  onInit: async (payload) => {
    for (const slug of ["home", "about"] as const) {
      const existing = await payload.findGlobal({ slug, locale: "en", fallbackLocale: false, overrideAccess: true });
      // Seed only an absent global; restarting must never overwrite an editor's changes.
      if (existing.id) continue;
      for (const locale of supportedLocales) {
        await payload.updateGlobal({
          slug, locale, overrideAccess: true,
          data: { ...getCopy(locale)[slug], _status: "published" },
        });
      }
    }
  },
});
