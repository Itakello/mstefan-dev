"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLivePreview } from "@payloadcms/live-preview-react";
import type { Career } from "@/payload-types";
import type { Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { layoutCareerTimeline } from "@/lib/career-timeline";
import styles from "./CareerGraph.module.css";

const labels = {
  en: { title: "Career", main: "Full-stack developer", details: "Explore my background", graph: "Graph", order: "Time moves upward", description: "Career mainline and job branches", role: "Experience", undated: "Dates not provided", incomplete: "Date range incomplete" },
  it: { title: "Percorso", main: "Sviluppatore full-stack", details: "Scopri il mio percorso", graph: "Grafo", order: "Il tempo scorre verso l’alto", description: "Percorso professionale e rami delle esperienze", role: "Esperienza", undated: "Date non indicate", incomplete: "Intervallo di date incompleto" },
};

function BranchIcon() {
  return <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 5v6m0-3c0-3 8-1 8-5M4 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm0 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8-11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>;
}

export function CareerGraph({ career, locale, expanded = false }: { career: Career; locale: Locale; expanded?: boolean }) {
  const content = labels[locale];
  const jobs = career.jobs ?? [];
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const timeline = layoutCareerTimeline(jobs, now);
  const selectedIndex = timeline.entries.findIndex((entry) => entry.key === selectedID);
  const activeIndex = selectedIndex < 0 ? 0 : selectedIndex;
  const selected = jobs[activeIndex];
  const activeKey = timeline.entries[activeIndex]?.key;
  const tree = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const titles = useRef(new Map<string, HTMLButtonElement>());
  const titleList = useRef<HTMLDivElement>(null);

  function revealHead(key: string) {
    const viewport = tree.current;
    const entry = timeline.entries.find((entry) => entry.key === key);
    if (!viewport || !entry) return;
    const margin = 24;
    const left = entry.x < viewport.scrollLeft + margin ? entry.x - margin
      : entry.x > viewport.scrollLeft + viewport.clientWidth - margin ? entry.x - viewport.clientWidth + margin : viewport.scrollLeft;
    const top = entry.headY < viewport.scrollTop + margin ? entry.headY - margin
      : entry.headY > viewport.scrollTop + viewport.clientHeight - margin ? entry.headY - viewport.clientHeight + margin : viewport.scrollTop;
    viewport.scrollTo({ left, top });
  }

  useEffect(() => {
    if (tree.current && selectedID === null) tree.current.scrollLeft = tree.current.scrollWidth - tree.current.clientWidth;
    if (activeKey) revealHead(activeKey);
  }, [career.jobs, activeKey]);
  useEffect(() => { if (detail.current) detail.current.scrollTop = 0; }, [activeKey]);

  function select(key: string, fromTree = false) {
    setSelectedID(key);
    if (fromTree) {
      const title = titles.current.get(key);
      title?.focus({ preventScroll: true });
      if (title && titleList.current) {
        const row = title.getBoundingClientRect();
        const viewport = titleList.current.getBoundingClientRect();
        if (row.top < viewport.top) titleList.current.scrollTop += row.top - viewport.top;
        else if (row.bottom > viewport.bottom) titleList.current.scrollTop += row.bottom - viewport.bottom;
      }
    } else revealHead(key);
  }

  if (!jobs.length) return null;
  const dateFormat = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" });
  const period = (index: number) => {
    const entry = timeline.entries[index];
    return entry.dated ? `${dateFormat.format(entry.start!)} – ${dateFormat.format(entry.end!)}` : (jobs[index].startDate || jobs[index].endDate ? content.incomplete : content.undated);
  };

  return (
    <section className={styles.section} aria-label={content.title} style={{ "--career-main": career.mainlineColor || "#25b8f3" } as CSSProperties}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{content.title}</h2>
        {!expanded && <Link href={`${localizedPath(locale, "/about")}#career`} className="text-sm font-medium">{content.details}</Link>}
      </div>
      <div className={styles.browser} id={expanded ? "career" : undefined}>
        <div className={styles.toolbar}><BranchIcon /><span>mstefan <span className={styles.separator}>/</span> career</span><span className={styles.direction}>↑ {content.order}</span></div>
        <div className={styles.header}><span>{content.role}</span><span>{content.graph} ↑</span></div>
        <div className={styles.body}>
          <div className={styles.list}>
            <div className={styles.mainRow}><span className={styles.mainBadge}><BranchIcon />main</span><span>{content.main}</span></div>
            <div ref={titleList} className={styles.titleList}>
            {jobs.map((job, index) => {
              const key = timeline.entries[index].key;
              return <button key={key} ref={(element) => { if (element) titles.current.set(key, element); else titles.current.delete(key); }} data-career-job type="button" onClick={() => select(key)} aria-pressed={activeKey === key} className={styles.row} style={{ "--branch-color": job.color } as CSSProperties}>
                <span className={styles.jobTitle}><span className={styles.badge}><BranchIcon />{job.branchName}</span><span>{job.company}</span></span>
                <span className={styles.jobRole}>{job.role}</span>
                <span className={styles.period}>{period(index)}</span>
              </button>;
            })}
            </div>
            <div ref={detail} className={styles.detail} aria-live="polite" aria-atomic="true" style={{ "--branch-color": selected?.color } as CSSProperties}>
              <span className={styles.detailRef}><BranchIcon />{selected?.branchName}</span>
              <h3 className={styles.detailCompany}>{selected?.company}</h3>
              <p className={styles.detailRole}>{selected?.role}</p>
              {selected?.summary && <p className={styles.summary}>{selected.summary}</p>}
            </div>
          </div>
          <div ref={tree} className={styles.tree} role="region" aria-label={`${content.graph}. ${content.order}.`} tabIndex={0}>
            <svg className={styles.graph} viewBox={`0 0 ${timeline.width} ${timeline.height}`} width={timeline.width} height={timeline.height} role="group" aria-label={content.description}>
              {timeline.ticks.map((tick) => <g key={tick.timestamp} className={styles.tick}>
                <line x1="8" x2={timeline.width} y1={tick.y} y2={tick.y} />
                <text x="8" y={tick.y - 7}>{tick.month ? dateFormat.format(tick.timestamp) : new Date(tick.timestamp).getUTCFullYear()}</text>
              </g>)}
              {timeline.hasUndated && <g className={styles.undatedLabel}>
                {timeline.undatedTop > 0 && <line x1="0" x2={timeline.width} y1={timeline.undatedTop + 8} y2={timeline.undatedTop + 8} />}
                <text x="8" y={timeline.undatedTop + 28}>{content.undated}</text>
              </g>}
              <path d={`M${timeline.mainX} ${timeline.height} V14 M${timeline.mainX - 4} 19 L${timeline.mainX} 14 L${timeline.mainX + 4} 19`} className={styles.mainPath} />
              <circle cx={timeline.mainX} cy={timeline.nowY} r="4.5" className={styles.mainDot} />
              {timeline.entries.map((entry) => {
                const job = jobs[entry.index];
                const bend = Math.min(24, (entry.forkY - entry.headY) / 2);
                const path = `M${timeline.mainX} ${entry.forkY} C${timeline.mainX} ${entry.forkY - bend} ${entry.x} ${entry.forkY} ${entry.x} ${entry.forkY - bend} V${entry.headY}`;
                return <g key={entry.key} data-career-branch={entry.key} role="button" tabIndex={0} aria-label={`${job.branchName}: ${job.company}, ${job.role}. ${period(entry.index)}`} aria-pressed={activeKey === entry.key} className={styles.graphButton} onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) revealHead(entry.key); }} onClick={() => select(entry.key, true)} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(entry.key, true); }
                }}>
                  <path d={path} stroke={job.color} className={styles.branch} />
                  <path d={path} className={styles.hitPath} />
                  <circle cx={entry.x} cy={entry.headY} r="12" className={styles.hitDot} />
                  <circle data-career-head cx={entry.x} cy={entry.headY} r="4.5" fill={job.color} className={styles.dot} />
                  {activeKey === entry.key && <circle cx={entry.x} cy={entry.headY} r="8.5" fill="none" stroke={job.color} strokeWidth="1.5" />}
                </g>;
              })}
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CareerLivePreview(props: Parameters<typeof CareerGraph>[0]) {
  const { data } = useLivePreview<Career>({ initialData: props.career, serverURL: typeof window === "undefined" ? "" : window.location.origin, depth: 0 });
  return <CareerGraph {...props} career={data} />;
}
