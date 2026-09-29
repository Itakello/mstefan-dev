"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent } from "react";
import { useLivePreview } from "@payloadcms/live-preview-react";
import type { Career } from "@/payload-types";
import type { Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { layoutCareerTimeline, nearestCareerJunction } from "@/lib/career-timeline";
import styles from "./CareerGraph.module.css";

const labels = {
  en: { title: "Career", main: "Full-stack developer", details: "Explore my background", graph: "Graph", order: "Time moves upward", description: "Career mainline and job branches", role: "Experience", undated: "Dates not provided", incomplete: "Date range incomplete", present: "Present" },
  it: { title: "Percorso", main: "Sviluppatore full-stack", details: "Scopri il mio percorso", graph: "Grafo", order: "Il tempo scorre verso l’alto", description: "Percorso professionale e rami delle esperienze", role: "Esperienza", undated: "Date non indicate", incomplete: "Intervallo di date incompleto", present: "Presente" },
};

function BranchIcon() {
  return <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 5v6m0-3c0-3 8-1 8-5M4 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm0 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8-11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>;
}

export function CareerGraph({ career, locale, expanded = false }: { career: Career; locale: Locale; expanded?: boolean }) {
  const content = labels[locale];
  const jobs = career.jobs ?? [];
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const [hoveredID, setHoveredID] = useState<string | null>(null);
  const [focusedID, setFocusedID] = useState<string | null>(null);
  const [labelWidth, setLabelWidth] = useState(180);
  const [now] = useState(() => Date.now());
  const [graphViewport, setGraphViewport] = useState({ width: 0, compact: false });
  const timeline = layoutCareerTimeline(jobs, now, career.laneSpacing ?? 24, graphViewport.compact ? graphViewport.width - 40 : undefined);
  const selectedIndex = timeline.entries.findIndex((entry) => entry.key === selectedID);
  const activeIndex = selectedIndex < 0 ? 0 : selectedIndex;
  const selected = jobs[activeIndex];
  const activeKey = timeline.entries[activeIndex]?.key;
  const tree = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const titles = useRef(new Map<string, HTMLButtonElement>());
  const titleList = useRef<HTMLDivElement>(null);
  const graph = useRef<SVGSVGElement>(null);
  const graphOffset = graphViewport.compact ? 0 : labelWidth + 36;
  const graphWidth = timeline.width + graphOffset + 40;
  const highlighted = (key: string) => key === activeKey || key === hoveredID || key === focusedID;
  const paintOrder = [...timeline.entries].sort((a, b) => b.lane - a.lane);
  let previousLabelY = 0;
  const branchLabels = (graphViewport.compact ? [] : [...timeline.entries]).sort((a, b) => a.headY - b.headY || a.lane - b.lane).map((entry) => {
    const y = Math.max(entry.headY, previousLabelY + 30);
    previousLabelY = y;
    return { ...entry, labelY: y };
  });
  const graphHeight = Math.max(timeline.height, previousLabelY + 24);

  useEffect(() => {
    const widths = Array.from(graph.current?.querySelectorAll<SVGTextElement>("[data-career-ref-text]") ?? []).map((text) => text.getComputedTextLength());
    if (widths.length) setLabelWidth(Math.ceil(Math.max(...widths)) + 28);
  }, [career.jobs, graphViewport.compact]);

  function revealHead(key: string) {
    const viewport = tree.current;
    const entry = timeline.entries.find((entry) => entry.key === key);
    if (!viewport || !entry) return;
    const margin = 24;
    const headX = (entry.dated ? entry.mergeX : entry.x) + graphOffset;
    const left = headX < viewport.scrollLeft + margin ? headX - margin
      : headX > viewport.scrollLeft + viewport.clientWidth - margin ? headX - viewport.clientWidth + margin : viewport.scrollLeft;
    const top = entry.headY < viewport.scrollTop + margin ? entry.headY - margin
      : entry.headY > viewport.scrollTop + viewport.clientHeight - margin ? entry.headY - viewport.clientHeight + margin : viewport.scrollTop;
    viewport.scrollTo({ left, top });
  }

  useEffect(() => {
    const viewport = tree.current;
    if (!viewport) return;
    const measure = () => {
      const next = { width: viewport.clientWidth, compact: viewport.clientWidth < 320 };
      setGraphViewport((current) => current.width === next.width && current.compact === next.compact ? current : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [jobs.length]);
  useEffect(() => {
    const viewport = tree.current;
    if (!viewport) return;
    if (graphViewport.compact) viewport.scrollLeft = 0;
    else if (selectedID === null) viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth;
    if (activeKey) revealHead(activeKey);
  }, [career.jobs, activeKey, graphOffset]);
  useEffect(() => {
    const viewport = tree.current;
    if (!viewport) return;
    viewport.scrollLeft = graphViewport.compact ? 0 : viewport.scrollWidth - viewport.clientWidth;
    if (activeKey) revealHead(activeKey);
  }, [graphViewport.width, graphViewport.compact]);
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
    }
    revealHead(key);
    if (window.matchMedia("(max-width: 640px)").matches) tree.current?.scrollIntoView({ block: "nearest" });
  }

  function selectJunction(x: number, y: number) {
    const entries = timeline.entries.filter((entry) => (entry.forkX === x && entry.forkY === y) || ((entry.dated ? entry.mergeX : entry.x) === x && entry.headY === y));
    const current = entries.findIndex((entry) => entry.key === activeKey);
    select(entries[(current + 1) % entries.length].key, true);
  }

  const interaction = (key: string) => ({
    onMouseEnter: () => setHoveredID(key),
    onMouseLeave: () => setHoveredID(null),
    onFocus: (event: FocusEvent<SVGElement | HTMLButtonElement>) => {
      if (event.currentTarget.matches(":focus-visible")) setFocusedID(key);
    },
    onBlur: () => setFocusedID(null),
  });

  if (!jobs.length) return null;
  const dateFormat = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" });
  const period = (index: number) => {
    const entry = timeline.entries[index];
    return entry.dated ? `${dateFormat.format(entry.start!)} – ${entry.ongoing ? content.present : dateFormat.format(entry.end!)}` : (jobs[index].startDate || jobs[index].endDate ? content.incomplete : content.undated);
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
              return <button key={key} ref={(element) => { if (element) titles.current.set(key, element); else titles.current.delete(key); }} data-career-job data-highlighted={highlighted(key)} {...interaction(key)} type="button" onClick={() => select(key)} aria-pressed={activeKey === key} className={styles.row} style={{ "--branch-color": job.color } as CSSProperties}>
                <span className={styles.jobTitle}><span className={styles.badge}><BranchIcon /><span>{job.branchName}</span></span><span>{job.company}</span></span>
                <span className={styles.jobRole}>{job.role}</span>
                <span className={styles.period}>{period(index)}</span>
              </button>;
            })}
            </div>
            <div ref={detail} className={styles.detail} aria-live="polite" aria-atomic="true" style={{ "--branch-color": selected?.color } as CSSProperties}>
              <span className={styles.detailRef}><BranchIcon /><span>{selected?.branchName}</span></span>
              <h3 className={styles.detailCompany}>{selected?.company}</h3>
              <p className={styles.detailRole}>{selected?.role}</p>
              {selected?.summary && <p className={styles.summary}>{selected.summary}</p>}
            </div>
          </div>
          <div ref={tree} className={styles.tree} role="region" aria-label={`${content.graph}. ${content.order}.`} tabIndex={0}>
            <svg ref={graph} className={styles.graph} viewBox={`0 0 ${graphWidth} ${graphHeight}`} width={graphWidth} height={graphHeight} role="group" aria-label={content.description} onClickCapture={(event) => {
              if ((event.target as Element).closest("[data-career-label]")) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              if (!bounds.width || !bounds.height) return;
              const x = (event.clientX - bounds.left) * graphWidth / bounds.width - graphOffset;
              const y = (event.clientY - bounds.top) * graphHeight / bounds.height;
              const junction = nearestCareerJunction(timeline.entries, x, y);
              if (!junction) return;
              event.stopPropagation();
              selectJunction(junction.x, junction.y);
            }}>
              {timeline.ticks.map((tick) => <g key={tick.timestamp} className={styles.tick}>
                <line x1="8" x2={graphWidth} y1={tick.y} y2={tick.y} />
                <text x={graphOffset + timeline.mainX + 12} y={tick.y - 7}>{tick.month ? dateFormat.format(tick.timestamp) : new Date(tick.timestamp).getUTCFullYear()}</text>
              </g>)}
              {timeline.hasUndated && <g className={styles.undatedLabel}>
                {timeline.undatedTop > 0 && <line x1="0" x2={graphWidth} y1={timeline.undatedTop + 8} y2={timeline.undatedTop + 8} />}
                <text x="8" y={timeline.undatedTop + 28}>{content.undated}</text>
              </g>}
              <g transform={`translate(${graphOffset} 0)`}>
              <path d={`M${timeline.mainX} ${timeline.height} V${timeline.topY}`} className={styles.mainPath} />
              <g aria-hidden="true" className={styles.visualPaths}>
                {paintOrder.map((entry) => <path key={entry.key} data-career-path={entry.key} d={entry.path} stroke={jobs[entry.index].color} className={styles.branch} />)}
              </g>
              <g aria-hidden="true" className={styles.highlightPaths}>
                {paintOrder.filter((entry) => highlighted(entry.key)).map((entry) => <path key={entry.key} d={entry.path} stroke={jobs[entry.index].color} className={styles.branch} />)}
              </g>
              {paintOrder.map((entry) => {
                const job = jobs[entry.index];
                const headX = entry.dated ? entry.mergeX : entry.x;
                return <g key={entry.key} data-career-branch={entry.key} data-highlighted={highlighted(entry.key)} {...interaction(entry.key)} role="button" tabIndex={0} aria-label={`${job.branchName}: ${job.company}, ${job.role}. ${period(entry.index)}`} aria-pressed={activeKey === entry.key} className={styles.graphButton} onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) { setFocusedID(entry.key); revealHead(entry.key); } }} onClick={() => select(entry.key, true)} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(entry.key, true); }
                }}>
                  <path d={entry.path} className={styles.hitPath} />
                  <g onClick={(event) => { event.stopPropagation(); selectJunction(entry.forkX, entry.forkY); }}>
                    <circle cx={entry.forkX} cy={entry.forkY} r="12" className={styles.hitDot} />
                    <circle cx={entry.forkX} cy={entry.forkY} r="4.5" fill={job.color} className={styles.dot} />
                  </g>
                  <g onClick={(event) => { event.stopPropagation(); selectJunction(headX, entry.headY); }}>
                    <circle cx={headX} cy={entry.headY} r="12" className={styles.hitDot} />
                    <circle data-career-head cx={headX} cy={entry.headY} r="4.5" fill={job.color} className={styles.dot} />
                  </g>
                </g>;
              })}
              {paintOrder.filter((entry) => highlighted(entry.key)).map((entry) => <g key={entry.key} className={styles.highlightPaths} aria-hidden="true">
                <circle cx={entry.forkX} cy={entry.forkY} r="4.5" fill={jobs[entry.index].color} className={styles.highlightDot} />
                <circle cx={entry.dated ? entry.mergeX : entry.x} cy={entry.headY} r="4.5" fill={jobs[entry.index].color} className={styles.highlightDot} />
                <circle cx={entry.dated ? entry.mergeX : entry.x} cy={entry.headY} r="8.5" fill="none" stroke={jobs[entry.index].color} strokeWidth="1.5" />
              </g>)}
              </g>
              {branchLabels.map((entry) => <g key={entry.key} data-career-label={entry.key} data-highlighted={highlighted(entry.key)} {...interaction(entry.key)} className={styles.branchLabel} role="button" tabIndex={0} aria-label={`${jobs[entry.index].branchName}: ${jobs[entry.index].company}`} aria-pressed={activeKey === entry.key} style={{ "--branch-color": jobs[entry.index].color } as CSSProperties} onClick={() => select(entry.key, true)} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(entry.key, true); }
              }}>
                <rect x="82" y={entry.labelY - 13} width={labelWidth} height="26" rx="4" />
                <circle cx="94" cy={entry.labelY} r="3.5" fill={jobs[entry.index].color} />
                <text data-career-ref-text x="104" y={entry.labelY} dominantBaseline="middle">{jobs[entry.index].branchName}</text>
              </g>)}
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
