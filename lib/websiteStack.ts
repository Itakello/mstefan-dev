import { fetchStackFromNotion } from "@/lib/notion";
import { stackIconUrl, type StackEntry } from "@/lib/stack";

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
    const response = await fetchIcon(stackIconUrl(entry.iconKey), {
      method: "HEAD"
    });
    if (!response.ok) {
      throw new Error(`Invalid Stack data: icon not found for ${entry.name}`);
    }
  }));
}
