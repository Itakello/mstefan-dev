"use client";

import { useId, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { BranchTag } from "@/components/Branch";
import type { CareerContent } from "@/lib/cms/career-media";
import type { Locale } from "@/lib/i18n/config";
import { getCopy } from "@/lib/i18n/copy";
import { formatCareerPeriod, layoutCareerRows } from "@/lib/career-timeline";
import styles from "./CareerGraph.module.css";

export const MAIN_KEY = "__career_main__";
export const DEFAULT_MAINLINE_COLOR = "#25b8f3";
const TOP = 64;
const ROW = { desktop: 100, mobile: 108 };
const MAX_WIDTH = { desktop: 160, mobile: 56 };

type Job = NonNullable<CareerContent["jobs"]>[number];
type Layout = ReturnType<typeof layoutCareerRows>;

export function careerEntryKey(job: Job, index: number) {
  return job.id ?? `entry-${index}`;
}

type Accessible = { label: (index: number | null) => string; description: string };

/**
 * One drawing of the graph. Hovering or tapping a branch, or the band beside an entry, acts like that entry's row.
 * Only the desktop drawing is a keyboard and screen reader control; the rows carry selection on phones.
 */
function Graph({ layout, jobs, activeKey, highlighted, className, name, onSelect, onHover, accessible }: { layout: Layout; jobs: Job[]; activeKey: string; highlighted: (key: string) => boolean; className: string; name: "desktop" | "phone"; onSelect: (key: string) => void; onHover: (key: string | null) => void; accessible?: Accessible }) {
  const gapID = useId();
  const paintOrder = [...layout.entries].sort((a, b) => b.lane - a.lane);
  const rowHeight = (layout.height - TOP) / Math.max(1, layout.order.length);
  const head = (entry: Layout["entries"][number]) => entry.dated && !entry.ongoing ? entry.mergeX : entry.x;
  // Hit areas never reach a neighbouring lane, however tightly the lanes are fitted.
  const hitWidth = Math.min(14, layout.spacing);
  const hitRadius = Math.min(10, Math.max(4.5, layout.spacing / 2));
  // Several branches can share one junction dot; repeated clicks cycle through them.
  const selectJunction = (x: number, y: number) => {
    const sharing = layout.entries.filter((entry) => (entry.forkX === x && entry.forkY === y) || (head(entry) === x && entry.headY === y));
    const current = sharing.findIndex((entry) => entry.key === activeKey);
    onSelect(sharing[(current + 1) % sharing.length].key);
  };
  const control = (key: string, index: number | null) => ({
    onClick: () => onSelect(key), onMouseEnter: () => onHover(key),
    ...accessible && {
      role: "button", tabIndex: 0, "aria-label": accessible.label(index), "aria-pressed": activeKey === key,
      onKeyDown: (event: ReactKeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(key); } },
      onFocus: (event: FocusEvent<SVGGElement>) => { if (event.currentTarget.matches(":focus-visible")) onHover(key); }, onBlur: () => onHover(null),
    },
  });
  return (
    <svg data-career-graph={name} className={`${styles.graph} ${className}`} viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height}
      onMouseLeave={() => onHover(null)} {...accessible ? { role: "group", "aria-label": accessible.description } : { "aria-hidden": true }}>
      <g className={styles.rowBands}>
        <rect x="0" y="0" width={layout.width} height={TOP} onMouseEnter={() => onHover(MAIN_KEY)} onClick={() => onSelect(MAIN_KEY)} />
        {layout.order.map((index) => <rect key={layout.entries[index].key} x="0" y={layout.entries[index].headY - rowHeight / 2} width={layout.width} height={rowHeight}
          onMouseEnter={() => onHover(layout.entries[index].key)} onClick={() => onSelect(layout.entries[index].key)} />)}
      </g>
      <defs>
        {layout.entries.map((entry) => <mask key={entry.key} id={`${gapID}-${entry.index}`} maskUnits="userSpaceOnUse" x="0" y="0" width={layout.width} height={layout.height}>
          <rect width={layout.width} height={layout.height} fill="white" />
          <circle cx={entry.forkX} cy={entry.forkY} r="6" fill="black" />
          <circle cx={head(entry)} cy={entry.headY} r="6" fill="black" />
        </mask>)}
      </defs>
      <g data-career-main-branch data-highlighted={highlighted(MAIN_KEY)} className={styles.branchGroup} {...control(MAIN_KEY, null)}>
        <path d={`M${layout.mainX} ${layout.height} V${TOP / 2}`} className={styles.hitPath} strokeWidth={hitWidth} />
        <path d={`M${layout.mainX} ${layout.height} V${TOP / 2}`} className={styles.mainPath} />
        <circle cx={layout.mainX} cy={TOP / 2} r="4" className={styles.mainDot} />
      </g>
      {paintOrder.map((entry) => {
        const color = jobs[entry.index].color ?? undefined;
        return <g key={entry.key} data-career-branch={entry.key} data-highlighted={highlighted(entry.key)} className={styles.branchGroup} style={{ "--branch-color": color } as CSSProperties}
          {...control(entry.key, entry.index)}>
          <path d={entry.path} className={styles.hitPath} strokeWidth={hitWidth} />
          <path d={entry.path} mask={`url(#${gapID}-${entry.index})`} className={styles.branch} />
          {[{ x: entry.forkX, y: entry.forkY, head: false }, { x: head(entry), y: entry.headY, head: true }].map((dot) => (
            <g key={String(dot.head)} onClick={(event) => { event.stopPropagation(); selectJunction(dot.x, dot.y); }}>
              <circle cx={dot.x} cy={dot.y} r={hitRadius} className={styles.hitDot} />
              <circle data-career-head={dot.head || undefined} cx={dot.x} cy={dot.y} r="4.5" fill={color} className={styles.dot} />
            </g>
          ))}
        </g>;
      })}
    </svg>
  );
}

export function CareerGraph({ career, locale, now, selectedKey, onSelect }: { career: CareerContent; locale: Locale; now: number; selectedKey: string; onSelect: (key: string) => void }) {
  const copy = getCopy(locale).career;
  const jobs = useMemo(() => career.jobs ?? [], [career.jobs]);
  const [hovered, setHovered] = useState<string | null>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const spacing = career.laneSpacing ?? 24;
  const [desktop, mobile] = useMemo(() => [
    layoutCareerRows(jobs, now, { rowHeight: ROW.desktop, top: TOP, maxWidth: MAX_WIDTH.desktop, spacing }),
    layoutCareerRows(jobs, now, { rowHeight: ROW.mobile, top: TOP, maxWidth: MAX_WIDTH.mobile, spacing }),
  ], [jobs, now, spacing]);
  const keys = useMemo(() => jobs.map(careerEntryKey), [jobs]);
  const highlighted = (key: string) => key === selectedKey || key === hovered;

  if (!jobs.length) return null;
  const period = (index: number) => formatCareerPeriod(jobs[index], locale, now);
  const selectFromGraph = (key: string) => { onSelect(key); rowButtons.current.get(key)?.focus({ preventScroll: true }); };
  const rowRef = (key: string) => (element: HTMLButtonElement | null) => { if (element) rowButtons.current.set(key, element); else rowButtons.current.delete(key); };
  const rowEvents = (key: string) => ({ onClick: () => onSelect(key), onMouseEnter: () => setHovered(key), onMouseLeave: () => setHovered(null) });

  return (
    <section id="career" className={styles.section} aria-label={copy.title} style={{ "--career-main": career.mainlineColor || DEFAULT_MAINLINE_COLOR, "--row-desktop": `${ROW.desktop}px`, "--row-mobile": `${ROW.mobile}px`, "--row-top": `${TOP}px`, "--graph-desktop": `${desktop.width}px`, "--graph-mobile": `${mobile.width}px` } as CSSProperties}>
      <Graph name="desktop" layout={desktop} jobs={jobs} activeKey={selectedKey} highlighted={highlighted} onSelect={selectFromGraph} onHover={setHovered} className={styles.desktopGraph} accessible={{
        description: copy.intro,
        label: (index) => index === null ? `master: ${copy.main}` : `${jobs[index].branchName}: ${jobs[index].company}, ${jobs[index].role}. ${period(index)}`,
      }} />
      <Graph name="phone" layout={mobile} jobs={jobs} activeKey={selectedKey} highlighted={highlighted} onSelect={onSelect} onHover={setHovered} className={styles.mobileGraph} />
      <div className={styles.rows}>
        <button ref={rowRef(MAIN_KEY)} type="button" data-career-main-row data-highlighted={highlighted(MAIN_KEY)} aria-pressed={selectedKey === MAIN_KEY} className={styles.mainRow} {...rowEvents(MAIN_KEY)}>
          <BranchTag name="master" /><span className={styles.mainTitle}>{copy.main}</span>
        </button>
        {desktop.order.map((index) => {
          const job = jobs[index];
          const key = keys[index];
          return <button key={key} ref={rowRef(key)} type="button" data-career-job data-highlighted={highlighted(key)} aria-pressed={selectedKey === key} className={styles.row} {...rowEvents(key)}>
            <span className={styles.jobTitle}><BranchTag name={job.branchName} color={job.color} /><span className={styles.company}>{job.company}</span></span>
            <span className={styles.jobRole}>{job.role}</span>
            <span className={styles.period}>{period(index)}</span>
          </button>;
        })}
      </div>
    </section>
  );
}
