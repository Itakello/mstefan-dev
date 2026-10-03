import { unstable_cache } from "next/cache";

import { publicationEnvironment } from "@/lib/publicationEnvironment";
import { fetchStackFromNotion } from "@/lib/notion";
import { PUBLICATION_CACHE_TAG, PUBLICATION_REVALIDATE_SECONDS } from "@/lib/publicationCache";
import { isTrustedExternalIcon, stackIconUrl, type StackEntry } from "@/lib/stack";

const MAX_STACK_ICON_WIDTH_RATIO = 2.5;
const ICON_REQUEST_ATTEMPTS = 3;
const MAX_ICON_RETRY_WAIT_MS = 2_000;
const iconChecksInFlight = new WeakMap<typeof fetch, Map<string, Promise<void>>>();
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

function iconRetryWait(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const wait = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(wait)) return wait <= MAX_ICON_RETRY_WAIT_MS ? Math.max(0, wait) : null;
  }
  return 250 * 2 ** attempt;
}

type WebsiteStackOptions = {
  fetchStack?: () => Promise<StackEntry[] | null>;
  vercelEnv?: string;
  validateStack?: (entries: readonly StackEntry[]) => Promise<void>;
};

export type WebsiteStackState = {
  status: "ready" | "empty" | "unconfigured" | "error";
  entries: readonly StackEntry[];
  message: "empty" | "unconfigured" | "error" | null;
};

type CacheIconValidation = (source: string, rules: string, validate: () => Promise<void>) => Promise<void>;

const taggedIconValidation: CacheIconValidation = async (source, rules, validate) => {
  const day = Math.floor(Date.now() / (PUBLICATION_REVALIDATE_SECONDS * 1_000));
  await unstable_cache(async () => {
    await validate();
    return true;
  }, ["stack-icon-validation", source, String(day), rules], {
    revalidate: false,
    tags: [PUBLICATION_CACHE_TAG],
  })();
};

export async function loadWebsiteStack({
  fetchStack = fetchStackFromNotion,
  vercelEnv = publicationEnvironment(),
  validateStack = validateStackIcons
}: WebsiteStackOptions = {}): Promise<WebsiteStackState> {
  try {
    const stack = await fetchStack();
    if (!stack) {
      if (vercelEnv === "production") throw new Error("Stack source is not configured");
      return {
        status: "unconfigured",
        entries: [],
        message: "unconfigured",
      };
    }
    if (stack.length === 0) {
      if (vercelEnv === "production") throw new Error("Stack database returned no records");
      return {
        status: "empty",
        entries: [],
        message: "empty",
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
      message: "error",
    };
  }
}

export async function validateStackIcons(
  entries: readonly StackEntry[],
  fetchIcon: typeof fetch = fetch,
  cacheValidation: CacheIconValidation = fetchIcon === fetch
    ? taggedIconValidation
    : async (_source, _rules, validate) => validate(),
) {
  let nextEntry = 0;
  let failed = false;
  async function requestIcon(entry: StackEntry, externalIcon: boolean) {
    for (let attempt = 0; attempt < ICON_REQUEST_ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await fetchIcon(stackIconUrl(entry.iconKey), {
          method: externalIcon ? "HEAD" : "GET",
          cache: "no-store",
        });
      } catch (error) {
        if (attempt === ICON_REQUEST_ATTEMPTS - 1) {
          throw new Error(`Invalid Stack data: icon unavailable for ${entry.name} (network)`, { cause: error });
        }
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
        continue;
      }
      if (response.ok) return response;
      await response.body?.cancel();
      if (response.status === 404) throw new Error(`Invalid Stack data: icon not found for ${entry.name} (HTTP 404)`);

      const temporary = response.status === 429 || response.status >= 500;
      if (!temporary) throw new Error(`Invalid Stack data: icon not found for ${entry.name} (HTTP ${response.status})`);
      const wait = iconRetryWait(response, attempt);
      if (attempt === ICON_REQUEST_ATTEMPTS - 1 || wait === null) {
        throw new Error(`Invalid Stack data: icon unavailable for ${entry.name} (HTTP ${response.status})`);
      }
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    throw new Error(`Invalid Stack data: icon unavailable for ${entry.name}`);
  }
  async function validateEntry(entry: StackEntry) {
    if (entry.iconKey.startsWith("skill-icons:")) {
      throw new Error(`Invalid Stack data: unsupported icon collection for ${entry.name}`);
    }

    const externalIcon = isTrustedExternalIcon(entry.iconKey);
    const response = await requestIcon(entry, externalIcon);

    if (!externalIcon) {
      const svg = await response.text();
      if (!/^\s*(?:<\?xml[^>]*\?>\s*)?<svg\b[\s\S]*<\/svg>\s*$/i.test(svg)) {
        throw new Error(`Invalid Stack data: icon is not SVG for ${entry.name}`);
      }
      const widthRatio = svgWidthRatio(svg);
      if (widthRatio !== null && widthRatio > MAX_STACK_ICON_WIDTH_RATIO) {
        throw new Error(`Invalid Stack data: icon is too wide for ${entry.name}`);
      }
      if (hasFixedSingleTonePaint(svg)) {
        throw new Error(`Invalid Stack data: icon cannot adapt across themes for ${entry.name}`);
      }
    }
  }
  const validationRules = [
    validateEntry.toString(),
    requestIcon.toString(),
    iconRetryWait.toString(),
    svgWidthRatio.toString(),
    hasFixedSingleTonePaint.toString(),
    isTrustedExternalIcon.toString(),
    stackIconUrl.toString(),
    String(MAX_STACK_ICON_WIDTH_RATIO),
    String(ICON_REQUEST_ATTEMPTS),
    String(MAX_ICON_RETRY_WAIT_MS),
    [...SOLID_BLACK_OR_WHITE].join(","),
  ].join("|");
  function checkEntry(entry: StackEntry) {
    const pending = iconChecksInFlight.get(fetchIcon) ?? new Map();
    iconChecksInFlight.set(fetchIcon, pending);
    const source = stackIconUrl(entry.iconKey);
    const existing = pending.get(source);
    if (existing) return existing;

    const check = cacheValidation(source, validationRules, () => validateEntry(entry)).finally(() => {
      if (pending.get(source) === check) pending.delete(source);
    });
    pending.set(source, check);
    return check;
  }
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (!failed && nextEntry < entries.length) {
      const entry = entries[nextEntry++];
      try {
        await checkEntry(entry);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }));
}
