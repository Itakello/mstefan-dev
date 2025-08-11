import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx}",
    "./content/**/*.{ts,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // Accent uses HSL via CSS var for easy tweaking
        accent: "hsl(var(--accent))"
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Inter", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      },
      boxShadow: {
        soft: "0 10px 30px -15px rgba(0,0,0,0.35)",
        // Subtle light glow to be visible on dark backgrounds
        softDark: "0 10px 30px -15px rgba(255,255,255,0.18)"
      }
    }
  },
  plugins: [typography]
} satisfies Config;
