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

function BranchIcon() {
  return <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 5v6m0-3c0-3 8-1 8-5M4 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm0 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8-11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>;
}

export function CareerGraph({ career, locale, expanded = false }: { career: Career; locale: Locale; expanded?: boolean }) {
  const content = labels[locale];
  const jobs = career.jobs ?? [];
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const selected = jobs.find((job) => job.id === selectedID) ?? jobs[0];
  const rows = useRef<HTMLDivElement>(null);
  const rail = useRef<SVGSVGElement>(null);
  const [geometry, setGeometry] = useState({ width: 160, height: (jobs.length + 1) * 72 + 160, mainCenter: 36, centers: jobs.map((_, i) => (i + 1) * 72 + 36) });

  useEffect(() => {
    const container = rows.current;
    if (!container) return;
    const measure = () => {
      const top = container.getBoundingClientRect().top;
      setGeometry({
        width: rail.current?.getBoundingClientRect().width ?? 160,
        height: container.getBoundingClientRect().height,
        mainCenter: (container.firstElementChild?.getBoundingClientRect().height ?? 72) / 2,
        centers: Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-career-job]")).map((row) => {
          const box = row.getBoundingClientRect();
          return box.top - top + box.height / 2;
        }),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    return () => observer.disconnect();
  }, [career.jobs, selected?.id]);

  if (!jobs.length) return null;
  const period = (job: NonNullable<Career["jobs"]>[number]) => [job.startDate, job.endDate].filter(Boolean).map((date) => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(date!))).join(" – ");

  return (
    <section className={styles.section} aria-label={content.title} style={{ "--career-main": career.mainlineColor || "#25b8f3" } as CSSProperties}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{content.title}</h2>
        {!expanded && <Link href={`${localizedPath(locale, "/about")}#career`} className="text-sm font-medium">{content.details}</Link>}
      </div>
      <div className={styles.browser} id={expanded ? "career" : undefined}>
        <div className={styles.toolbar}><BranchIcon /><span>mstefan <span className={styles.separator}>/</span> career</span><span className={styles.direction}>↑ {content.order}</span></div>
        <div className={styles.header}><span>{content.role}</span><span>{content.graph} ↑</span></div>
        <div className={styles.rows} ref={rows}>
          <div className={styles.mainRow}><span className={styles.mainBadge}><BranchIcon />main</span><span>{content.main}</span></div>
          {jobs.map((job) => (
            <button key={job.id} data-career-job type="button" onClick={() => setSelectedID(job.id!)} aria-pressed={selected?.id === job.id} className={styles.row} style={{ "--branch-color": job.color } as CSSProperties}>
              <span className={styles.jobTitle}><span className={styles.badge}><BranchIcon />{job.branchName}</span><span>{job.company}</span></span>
              <span className={styles.jobRole}>{job.role}</span>
              {period(job) && <span className={styles.period}>{period(job)}</span>}
            </button>
          ))}
          <div className={styles.detail} aria-live="polite" aria-atomic="true" style={{ "--branch-color": selected?.color } as CSSProperties}>
            <span className={styles.detailRef}><BranchIcon />{selected?.branchName}</span>
            <h3 className={styles.detailCompany}>{selected?.company}</h3>
            <p className={styles.detailRole}>{selected?.role}</p>
            {selected?.summary && <p className={styles.summary}>{selected.summary}</p>}
          </div>
          <svg ref={rail} className={styles.graph} viewBox={`0 0 ${geometry.width} ${geometry.height}`} style={{ height: geometry.height }} role="img" aria-label={`${content.description}. ${content.order}.`}>
            <path d={`M${geometry.width - 22} ${geometry.height} V14 M${geometry.width - 26} 19 L${geometry.width - 22} 14 L${geometry.width - 18} 19`} className={styles.mainPath} />
            <circle cx={geometry.width - 22} cy={geometry.mainCenter} r="4.5" className={styles.mainDot} />
            {jobs.map((job, i) => {
              const y = geometry.centers[i] ?? (i + 1) * 72 + 36;
              const mainX = geometry.width - 22;
              const spacing = Math.min(36, (geometry.width - 44) / jobs.length);
              const x = mainX - (i + 1) * spacing;
              const forkY = geometry.height - 22 - i * Math.min(18, 100 / jobs.length);
              const bend = Math.min(32, (forkY - y) / 2);
              return <g key={job.id}>
                <path d={`M${mainX} ${forkY} C${mainX} ${forkY - bend} ${x} ${forkY} ${x} ${forkY - bend} V${y}`} stroke={job.color} className={styles.branch} />
                <circle cx={x} cy={y} r="4.5" fill={job.color} className={styles.dot} />
                {selected?.id === job.id && <circle cx={x} cy={y} r="8.5" fill="none" stroke={job.color} strokeWidth="1.5" />}
              </g>;
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}

export function CareerLivePreview(props: Parameters<typeof CareerGraph>[0]) {
  const { data } = useLivePreview<Career>({ initialData: props.career, serverURL: typeof window === "undefined" ? "" : window.location.origin, depth: 0 });
  return <CareerGraph {...props} career={data} />;
}
