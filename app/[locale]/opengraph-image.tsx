import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";
import path from "node:path";

import { getCopy } from "@/lib/i18n/copy";
import { isSupportedLocale } from "@/lib/i18n/routing";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const photo = await readFile(path.join(process.cwd(), "public", "profile-photo.jpg"));
  const photoUrl = `data:image/jpeg;base64,${photo.toString("base64")}`;
  const description = getCopy(locale).og.description;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#050505", color: "#ffffff", padding: "72px 80px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
          <div style={{ color: "#a3a3a3", fontSize: 28 }}>mstefan.dev</div>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>Massimo Stefan</div>
          <div style={{ maxWidth: 900, color: "#d4d4d4", fontSize: 34, lineHeight: 1.3 }}>{description}</div>
        </div>
        <img src={photoUrl} alt="" width={320} height={486} style={{ width: 320, height: 486, borderRadius: 36, objectFit: "cover", objectPosition: "center" }} />
      </div>
    ),
    size,
  );
}
