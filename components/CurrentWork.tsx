import Link from "next/link";
import { BranchTag } from "@/components/Branch";
import type { CareerContent } from "@/lib/cms/career-media";
import { formatCareerMonth, ongoingCareerEntries } from "@/lib/career-timeline";
import type { Locale } from "@/lib/i18n/config";
import { getCopy } from "@/lib/i18n/copy";
import { localizedPath } from "@/lib/i18n/routing";

const VISIBLE = 3;

/** Every ongoing career branch, newest first, so parallel activities all show. */
export function CurrentWork({ jobs, locale, now }: { jobs: NonNullable<CareerContent["jobs"]>; locale: Locale; now: number }) {
  const copy = getCopy(locale).current;
  const active = ongoingCareerEntries(jobs, now);
  if (!active.length) return null;
  return (
    <section aria-labelledby="current-work-heading" className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-bg)]">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--surface-border)] px-4 py-2">
        <h2 id="current-work-heading" className="text-xs font-semibold uppercase tracking-wider text-[var(--page-muted)]">{copy.title}</h2>
        <Link href={localizedPath(locale, "/about")} className="shrink-0 text-sm font-medium">{copy.background}</Link>
      </div>
      <ul>
        {active.slice(0, VISIBLE).map((job) => (
          <li key={job.id ?? job.branchName} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--surface-border)] px-4 py-3 text-sm last:border-b-0">
            <BranchTag name={job.branchName} color={job.color} />
            <span className="font-semibold">{job.company}</span>
            <span className="text-[var(--page-muted)]">{job.role}</span>
            <span className="font-mono text-xs text-[var(--page-muted)] sm:ml-auto">{copy.since(formatCareerMonth(job.startDate!, locale))}</span>
          </li>
        ))}
      </ul>
      {active.length > VISIBLE && <p className="border-t border-[var(--surface-border)] px-4 py-2 text-xs text-[var(--page-muted)]">{copy.more(active.length - VISIBLE)}</p>}
    </section>
  );
}
