import { fetchStackFromNotion } from "@/lib/notion";
import { fallbackStack, type StackEntry } from "@/lib/stack";

type WebsiteStackOptions = {
  fetchStack?: () => Promise<StackEntry[] | null>;
  vercelEnv?: string;
  fallback?: readonly StackEntry[];
  validateStack?: (entries: readonly StackEntry[]) => Promise<void>;
};

export async function loadWebsiteStack({
  fetchStack = fetchStackFromNotion,
  vercelEnv = process.env.VERCEL_ENV,
  fallback = fallbackStack,
  validateStack = validateIconifyIcons
}: WebsiteStackOptions = {}): Promise<readonly StackEntry[]> {
  try {
    const stack = await fetchStack();
    if (!stack || stack.length === 0) throw new Error("Stack database returned no records");
    if (vercelEnv === "production") await validateStack(stack);
    return stack;
  } catch (error) {
    if (vercelEnv === "production") {
      throw new Error("Cannot publish without valid Notion Stack data", { cause: error });
    }
    return fallback;
  }
}

export async function validateIconifyIcons(
  entries: readonly StackEntry[],
  fetchIcon: typeof fetch = fetch
) {
  await Promise.all(entries.map(async (entry) => {
    const [collection, icon] = entry.iconKey.split(":");
    const response = await fetchIcon(`https://api.iconify.design/${collection}/${icon}.svg`, {
      method: "HEAD"
    });
    if (!response.ok) {
      throw new Error(`Invalid Stack data: Iconify icon not found for ${entry.name}`);
    }
  }));
}
