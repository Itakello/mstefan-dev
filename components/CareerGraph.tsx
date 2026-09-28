"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLivePreview } from "@payloadcms/live-preview-react";
import type { Career } from "@/payload-types";
import type { Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import styles from "./CareerGraph.module.css";

const labels = {
  en: { title: "Career", main: "Full-stack developer", details: "Explore my background", graph: "Graph", order: "Time moves upward", description: "Career mainline and job branches", role: "Experience" },
  it: { title: "Percorso", main: "Sviluppatore full-stack", details: "Scopri il mio percorso", graph: "Grafo", order: "Il tempo scorre verso l’alto", description: "Percorso professionale e rami delle esperienze", role: "Esperienza" },
};

export function CareerGraph({ career, locale, expanded = false }: { career: Career; locale: Locale; expanded?: boolean }) {
  const content = labels[locale];
  const jobs = career.jobs ?? [];
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const selected = jobs.find((job) => job.id === selectedID) ?? jobs[0];
  const rows = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ height: (jobs.length + 1) * 72, mainCenter: 36, centers: jobs.map((_, i) => (i + 1) * 72 + 36) });

  useEffect(() => {
    const container = rows.current;
    if (!container) return;
    const measure = () => {
      const top = container.getBoundingClientRect().top;
      setGeometry({
        height: container.getBoundingClientRect().height,
        mainCenter: (container.firstElementChild?.getBoundingClientRect().height ?? 72) / 2,
        centers: Array.from(container.querySelectorAll<HTMLButtonElement>("button")).map((row) => {
          const box = row.getBoundingClientRect();
          return box.top - top + box.height / 2;
        }),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    return () => observer.disconnect();
  }, [career.jobs]);

  if (!jobs.length) return null;
  const period = (job: NonNullable<Career["jobs"]>[number]) => [job.startDate, job.endDate].filter(Boolean).map((date) => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(date!))).join(" – ");

  return (
    <section className={styles.section} aria-label={content.title} style={{ "--career-main": career.mainlineColor || "#25b8f3" } as CSSProperties}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{content.title}</h2>
        {!expanded && <Link href={`${localizedPath(locale, "/about")}#career`} className="text-sm font-medium">{content.details}</Link>}
      </div>
      <div className={styles.browser} id={expanded ? "career" : undefined}>
        <div className={styles.header}><span>{content.role}</span><span>{content.graph} ↑</span></div>
        <div className={styles.rows} ref={rows}>
          <div className={styles.mainRow}><span className={styles.mainBadge}>main</span><span>{content.main}</span></div>
          {jobs.map((job) => (
            <button key={job.id} type="button" onClick={() => setSelectedID(job.id!)} aria-pressed={selected?.id === job.id} className={styles.row}>
              <span className={styles.jobTitle}><span className={styles.badge} style={{ color: job.color }}>{job.branchName}</span><span>{job.company}</span></span>
              <span className={styles.jobRole}>{job.role}</span>
              {period(job) && <span className={styles.period}>{period(job)}</span>}
            </button>
          ))}
          <svg className={styles.graph} viewBox={`0 0 128 ${geometry.height}`} preserveAspectRatio="none" style={{ height: geometry.height }} role="img" aria-label={`${content.description}. ${content.order}.`}>
            <path d={`M112 ${geometry.height - 8} V12 M108 17 L112 12 L116 17`} className={styles.mainPath} />
            <circle cx="112" cy={geometry.mainCenter} r="4" className={styles.mainDot} />
            {jobs.map((job, i) => {
              const y = geometry.centers[i] ?? (i + 1) * 72 + 36;
              const x = 22 + (i % 3) * 26;
              return <g key={job.id}>
                <path d={`M112 ${y + 27} C112 ${y + 16} ${x} ${y + 22} ${x} ${y + 10} V${y - 18}`} stroke={job.color} className={styles.branch} />
                <circle cx={x} cy={y} r="4" fill={job.color} />
                {selected?.id === job.id && <circle cx={x} cy={y} r="8" fill="none" stroke={job.color} />}
              </g>;
            })}
          </svg>
        </div>
        <div className={styles.detail} aria-live="polite" aria-atomic="true">
          <span className={styles.detailCompany} style={{ color: selected?.color }}>{selected?.company}</span>
          <p className="mt-1 text-sm">{selected?.role}</p>
          {selected?.summary && <p className="mt-3 whitespace-pre-line text-sm leading-6">{selected.summary}</p>}
        </div>
      </div>
    </section>
  );
}

export function CareerLivePreview(props: Parameters<typeof CareerGraph>[0]) {
  const { data } = useLivePreview<Career>({ initialData: props.career, serverURL: typeof window === "undefined" ? "" : window.location.origin, depth: 0 });
  return <CareerGraph {...props} career={data} />;
}
