import { StackBadge } from "@/components/StackBadge";
import type { StackEntry } from "@/lib/stack";

export function StackCatalog({ entries }: { entries: readonly StackEntry[] }) {
  const groups = entries.reduce((result, entry) => {
    const items = result.get(entry.category) ?? [];
    items.push(entry);
    result.set(entry.category, items);
    return result;
  }, new Map<string, StackEntry[]>());

  return (
    <div className="not-prose grid gap-3 sm:grid-cols-2">
      {[...groups.entries()].map(([category, items]) => (
        <section
          key={category}
          className="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <h3 className="text-sm font-medium">{category}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {items.map((item) => (
              <StackBadge key={item.name} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
