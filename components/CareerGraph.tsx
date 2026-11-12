"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent, type TouchEvent } from "react";
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
const MAX_WIDTH = { desktop: 160, mobile: 28, expanded: 56 };

type Job = NonNullable<CareerContent["jobs"]>[number];
type Layout = ReturnType<typeof layoutCareerRows>;

export function careerEntryKey(job: Job, index: number) {
  return job.id ?? `entry-${index}`;
}

type Interaction = { activeKey: string; label: (index: number | null) => string; description: string; onHover: (key: string | null) => void };

/** One drawing of the graph. Only the desktop one is a keyboard and screen reader control; the rows carry selection everywhere. */
function Graph({ layout, jobs, highlighted, className, onSelect, interaction }: { layout: Layout; jobs: Job[]; highlighted: (key: string) => boolean; className: string; onSelect?: (key: string) => void; interaction?: Interaction }) {
  const gapID = useId();
  const paintOrder = [...layout.entries].sort((a, b) => b.lane - a.lane);
  const head = (entry: Layout["entries"][number]) => entry.dated && !entry.ongoing ? entry.mergeX : entry.x;
  // Several branches can share one junction dot; repeated clicks cycle through them.
  const selectJunction = (x: number, y: number) => {
    const sharing = layout.entries.filter((entry) => (entry.forkX === x && entry.forkY === y) || (head(entry) === x && entry.headY === y));
    const current = sharing.findIndex((entry) => entry.key === interaction?.activeKey);
    onSelect?.(sharing[(current + 1) % sharing.length].key);
  };
  const control = (key: string, index: number | null) => interaction ? {
    role: "button", tabIndex: 0, "aria-label": interaction.label(index), "aria-pressed": interaction.activeKey === key,
    onKeyDown: (event: ReactKeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(key); } },
    onMouseEnter: () => interaction.onHover(key), onMouseLeave: () => interaction.onHover(null),
    onFocus: (event: FocusEvent<SVGGElement>) => { if (event.currentTarget.matches(":focus-visible")) interaction.onHover(key); }, onBlur: () => interaction.onHover(null),
  } : {};
  return (
    <svg className={`${styles.graph} ${className}`} viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height}
      {...interaction ? { role: "group", "aria-label": interaction.description } : { "aria-hidden": true }}>
      <defs>
        {layout.entries.map((entry) => <mask key={entry.key} id={`${gapID}-${entry.index}`} maskUnits="userSpaceOnUse" x="0" y="0" width={layout.width} height={layout.height}>
          <rect width={layout.width} height={layout.height} fill="white" />
          <circle cx={entry.forkX} cy={entry.forkY} r="6" fill="black" />
          <circle cx={head(entry)} cy={entry.headY} r="6" fill="black" />
        </mask>)}
      </defs>
      <g data-career-main-branch data-highlighted={highlighted(MAIN_KEY)} className={styles.branchGroup} onClick={onSelect && (() => onSelect(MAIN_KEY))} {...control(MAIN_KEY, null)}>
        {onSelect && <path d={`M${layout.mainX} ${layout.height} V${TOP / 2}`} className={styles.hitPath} />}
        <path d={`M${layout.mainX} ${layout.height} V${TOP / 2}`} className={styles.mainPath} />
        <circle cx={layout.mainX} cy={TOP / 2} r="4" className={styles.mainDot} />
      </g>
      {paintOrder.map((entry) => {
        const color = jobs[entry.index].color ?? undefined;
        return <g key={entry.key} data-career-branch={entry.key} data-highlighted={highlighted(entry.key)} className={styles.branchGroup} style={{ "--branch-color": color } as CSSProperties}
          onClick={onSelect && (() => onSelect(entry.key))} {...control(entry.key, entry.index)}>
          {onSelect && <path d={entry.path} className={styles.hitPath} />}
          <path d={entry.path} mask={`url(#${gapID}-${entry.index})`} className={styles.branch} />
          {[{ x: entry.forkX, y: entry.forkY, head: false }, { x: head(entry), y: entry.headY, head: true }].map((dot) => (
            <g key={String(dot.head)} onClick={onSelect && ((event) => { event.stopPropagation(); selectJunction(dot.x, dot.y); })}>
              {onSelect && <circle cx={dot.x} cy={dot.y} r="10" className={styles.hitDot} />}
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
  const [expanded, setExpanded] = useState(false);
  const swipeStart = useRef<number | null>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const spacing = career.laneSpacing ?? 24;
  const [desktop, mobile, open] = useMemo(() => [
    layoutCareerRows(jobs, now, { rowHeight: ROW.desktop, top: TOP, maxWidth: MAX_WIDTH.desktop, spacing }),
    layoutCareerRows(jobs, now, { rowHeight: ROW.mobile, top: TOP, maxWidth: MAX_WIDTH.mobile, spacing }),
    layoutCareerRows(jobs, now, { rowHeight: ROW.mobile, top: TOP, maxWidth: MAX_WIDTH.expanded, spacing }),
  ], [jobs, now, spacing]);
  const keys = useMemo(() => jobs.map(careerEntryKey), [jobs]);
  const highlighted = (key: string) => key === selectedKey || key === hovered;

  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);

  if (!jobs.length) return null;
  const period = (index: number) => formatCareerPeriod(jobs[index], locale, now);
  const selectFromGraph = (key: string) => { onSelect(key); rowButtons.current.get(key)?.focus({ preventScroll: true }); };
  const choose = (key: string) => { setExpanded(false); onSelect(key); };
  const rowRef = (key: string) => (element: HTMLButtonElement | null) => { if (element) rowButtons.current.set(key, element); else rowButtons.current.delete(key); };
  const rowEvents = (key: string) => ({ onClick: () => onSelect(key), onMouseEnter: () => setHovered(key), onMouseLeave: () => setHovered(null) });
  const endSwipe = (event: TouchEvent) => {
    if (swipeStart.current !== null && event.changedTouches[0].clientX - swipeStart.current < -40) setExpanded(false);
    swipeStart.current = null;
  };

  return (
    <section id="career" className={styles.section} aria-label={copy.title} style={{ "--career-main": career.mainlineColor || DEFAULT_MAINLINE_COLOR, "--row-desktop": `${ROW.desktop}px`, "--row-mobile": `${ROW.mobile}px`, "--row-top": `${TOP}px`, "--graph-desktop": `${desktop.width}px` } as CSSProperties}>
      <Graph layout={desktop} jobs={jobs} highlighted={highlighted} onSelect={selectFromGraph} className={styles.desktopGraph} interaction={{
        activeKey: selectedKey, description: copy.intro, onHover: setHovered,
        label: (index) => index === null ? `master: ${copy.main}` : `${jobs[index].branchName}: ${jobs[index].company}, ${jobs[index].role}. ${period(index)}`,
      }} />
      <Graph layout={mobile} jobs={jobs} highlighted={highlighted} className={styles.mobileGraph} />
      <button type="button" className={styles.railToggle} aria-expanded={expanded} aria-label={expanded ? copy.collapse : copy.expand} onClick={() => setExpanded((value) => !value)} />
      {expanded && <>
        <div className={styles.scrim} aria-hidden="true" onClick={() => setExpanded(false)} />
        <div className={styles.overlay} role="group" aria-label={copy.graph} onTouchStart={(event) => { swipeStart.current = event.touches[0].clientX; }} onTouchEnd={endSwipe}>
          <Graph layout={open} jobs={jobs} highlighted={highlighted} onSelect={choose} className={styles.openGraph} />
          <button type="button" autoFocus={selectedKey === MAIN_KEY} className={styles.overlayLabel} style={{ top: TOP / 2, "--branch-color": "var(--career-main)" } as CSSProperties} aria-pressed={selectedKey === MAIN_KEY} onClick={() => choose(MAIN_KEY)}>master</button>
          {open.order.map((index) => <button key={keys[index]} type="button" autoFocus={selectedKey === keys[index]} className={styles.overlayLabel} style={{ top: open.entries[index].headY, "--branch-color": jobs[index].color } as CSSProperties} aria-pressed={selectedKey === keys[index]} onClick={() => choose(keys[index])}>
            {jobs[index].branchName?.replace(/^[^/]+\//, "")}
          </button>)}
        </div>
      </>}
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
