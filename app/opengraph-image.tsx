import { ImageResponse } from "next/og";

export const alt = "Massimo Stefan — Software engineer building AI systems for real work";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#050505",
          color: "#ffffff",
          padding: "72px 80px",
          fontFamily: "sans-serif"
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 24,
            background: "hsl(270, 89%, 56%)",
            color: "#000000",
            fontSize: 28,
            fontWeight: 700
          }}
        >
          MS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ color: "#a3a3a3", fontSize: 28 }}>mstefan.dev</div>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>
            Massimo Stefan
          </div>
          <div style={{ maxWidth: 900, color: "#d4d4d4", fontSize: 34, lineHeight: 1.3 }}>
            Software engineer building AI systems for real work.
          </div>
        </div>
      </div>
    ),
    size
  );
}
