import { fetchStackFromNotion } from "@/lib/notion";
import { isTrustedExternalIcon, stackIconUrl, type StackEntry } from "@/lib/stack";

const MAX_STACK_ICON_WIDTH_RATIO = 2.5;
const SOLID_BLACK_OR_WHITE = new Set([
  "#000",
  "#000000",
  "black",
  "rgb(0,0,0)",
  "#fff",
  "#ffffff",
  "white",
  "rgb(255,255,255)",
]);

function svgWidthRatio(svg: string) {
  const viewBox = svg.match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (!viewBox) return null;

  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return null;

  return width / height;
}

function hasFixedSingleTonePaint(svg: string) {
  if (/currentColor/i.test(svg)) return false;

  const paints = [...svg.matchAll(/(?:fill|stroke)=["']([^"']+)["']/gi)]
    .map((match) => match[1].toLowerCase().replace(/\s+/g, ""))
    .filter((paint) => paint !== "none");

  if (paints.length === 0) {
    return /<(?:path|circle|ellipse|polygon|polyline|rect|line)\b/i.test(svg);
  }

  const uniquePaints = new Set(paints);
  return uniquePaints.size === 1 && SOLID_BLACK_OR_WHITE.has([...uniquePaints][0]);
}

type WebsiteStackOptions = {
  fetchStack?: () => Promise<StackEntry[] | null>;
  vercelEnv?: string;
  validateStack?: (entries: readonly StackEntry[]) => Promise<void>;
};

export type WebsiteStackState = {
  status: "ready" | "empty" | "unconfigured" | "error";
  entries: readonly StackEntry[];
  message: string | null;
};

export async function loadWebsiteStack({
  fetchStack = fetchStackFromNotion,
  vercelEnv = process.env.VERCEL_ENV,
  validateStack = validateStackIcons
}: WebsiteStackOptions = {}): Promise<WebsiteStackState> {
  try {
    const stack = await fetchStack();
    if (!stack) {
      if (vercelEnv === "production") throw new Error("Stack source is not configured");
      return {
        status: "unconfigured",
        entries: [],
        message: "Stack is unavailable because the publication source is not configured.",
      };
    }
    if (stack.length === 0) {
      if (vercelEnv === "production") throw new Error("Stack database returned no records");
      return {
        status: "empty",
        entries: [],
        message: "No Stack items are currently available for publication.",
      };
    }
    if (vercelEnv === "production") await validateStack(stack);
    return { status: "ready", entries: stack, message: null };
  } catch (error) {
    if (vercelEnv === "production") {
      throw new Error("Cannot publish without valid Notion Stack data", { cause: error });
    }
    return {
      status: "error",
      entries: [],
      message: "Stack is temporarily unavailable because the publication source could not be loaded.",
    };
  }
}

export async function validateStackIcons(
  entries: readonly StackEntry[],
  fetchIcon: typeof fetch = fetch
) {
  await Promise.all(entries.map(async (entry) => {
    const externalIcon = isTrustedExternalIcon(entry.iconKey);
    const response = await fetchIcon(stackIconUrl(entry.iconKey), {
      method: externalIcon ? "HEAD" : "GET"
    });
    if (!response.ok) {
      throw new Error(`Invalid Stack data: icon not found for ${entry.name}`);
    }

    if (!externalIcon) {
      const svg = await response.text();
      const widthRatio = svgWidthRatio(svg);
      if (widthRatio !== null && widthRatio > MAX_STACK_ICON_WIDTH_RATIO) {
        throw new Error(`Invalid Stack data: icon is too wide for ${entry.name}`);
      }
      if (hasFixedSingleTonePaint(svg)) {
        throw new Error(`Invalid Stack data: icon cannot adapt across themes for ${entry.name}`);
      }
    }
  }));
}
