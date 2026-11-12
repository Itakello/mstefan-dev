export type TimelineJob = { id?: string | null; startDate?: string | null; endDate?: string | null; ongoing?: boolean | null; branchName?: string | null; parentBranchName?: string | null };
export type TimelineEntry = { key: string; index: number; dated: boolean; ongoing: boolean; start: number | null; end: number | null; x: number; forkY: number; headY: number; lane: number; parentKey: string | null; forkX: number; mergeX: number; forkRadius: number; mergeRadius: number; path: string };

function parseDate(value?: string | null): number | null {
  if (!value) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  const timestamp = Date.parse(value);
  if (!parts || !Number.isFinite(timestamp)) return null;
  const [year, month, day] = parts.slice(1).map(Number);
  const calendar = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T00:00:00Z`);
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day ? timestamp : null;
}

function careerSpan(job: TimelineJob, now: number) {
  const start = parseDate(job.startDate);
  const ongoing = job.ongoing === true;
  const end = ongoing ? now : parseDate(job.endDate);
  const dated = start !== null && end !== null && end >= start;
  return { ongoing, dated, start: dated ? start : null, end: dated ? end : null };
}

export function formatCareerMonth(value: string | number, locale: "en" | "it") {
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(typeof value === "number" ? value : Date.parse(value));
}

export function formatCareerPeriod(job: TimelineJob, locale: "en" | "it", now: number): string {
  const { dated, start, end, ongoing } = careerSpan(job, now);
  if (!dated) {
    return job.startDate || job.endDate
      ? (locale === "it" ? "Intervallo di date incompleto" : "Date range incomplete")
      : (locale === "it" ? "Date non indicate" : "Dates not provided");
  }
  return `${formatCareerMonth(start!, locale)} – ${ongoing ? (locale === "it" ? "Presente" : "Present") : formatCareerMonth(end!, locale)}`;
}

/** Ongoing career entries, newest first. */
export function ongoingCareerEntries<T extends TimelineJob>(jobs: T[], now: number): T[] {
  return careerRowOrder(jobs, now).map((index) => jobs[index]).filter((job) => job.ongoing === true);
}

function roundedElbow(from: number, to: number, y: number, radius: number): string {
  if (!radius) return `H${to}`;
  const direction = Math.sign(to - from);
  const sweep = direction > 0 ? 1 : 0;
  return `A${radius} ${radius} 0 0 ${sweep} ${from + direction * radius} ${y - radius} H${to - direction * radius} A${radius} ${radius} 0 0 ${1 - sweep} ${to} ${y - 2 * radius}`;
}

/** Orders career entries newest first: ongoing ones, then by end date, then by start date; undated ones last. */
function careerRowOrder(jobs: TimelineJob[], now: number): number[] {
  return jobs.map((job, index) => ({ index, ...careerSpan(job, now) }))
    .sort((a, b) => Number(b.dated) - Number(a.dated) || (b.end ?? 0) - (a.end ?? 0) || (b.start ?? 0) - (a.start ?? 0) || a.index - b.index)
    .map((row) => row.index);
}

/**
 * Lays the graph out against a list of equal-height rows, like `git log --graph`:
 * each entry's head sits level with its own row, its fork sits where its start date falls between rows,
 * and the mainline is the first lane on the left.
 */
export function layoutCareerRows(jobs: TimelineJob[], now: number, { rowHeight, top, maxWidth, spacing = 24 }: { rowHeight: number; top: number; maxWidth: number; spacing?: number }) {
  if (!Number.isFinite(now)) throw new Error('A valid current date is required.');
  spacing = Number.isFinite(spacing) ? Math.max(18, Math.min(64, spacing)) : 24;
  const spans = jobs.map((job) => careerSpan(job, now));
  const order = careerRowOrder(jobs, now);
  const height = top + order.length * rowHeight;
  const headY: number[] = [];
  order.forEach((index, row) => { headY[index] = top + row * rowHeight + rowHeight / 2; });

  const floor = height - rowHeight / 4;
  const anchors = order.filter((index) => spans[index].dated).map((index) => ({ time: spans[index].end!, y: headY[index] }))
    .filter((anchor, position, all) => position === 0 || anchor.time < all[position - 1].time);
  const oldest = Math.min(...spans.flatMap((span) => span.dated ? [span.start!] : []), ...anchors.map((anchor) => anchor.time));
  const yAt = (time: number) => {
    if (!anchors.length) return floor;
    if (time >= anchors[0].time) return anchors[0].y;
    for (let i = 1; i < anchors.length; i++) {
      const [newer, older] = [anchors[i - 1], anchors[i]];
      if (time >= older.time) return older.y - (older.y - newer.y) * (time - older.time) / (newer.time - older.time);
    }
    const last = anchors[anchors.length - 1];
    return last.time === oldest ? floor : last.y + (floor - last.y) * (last.time - time) / (last.time - oldest);
  };
  const forkY = spans.map((span, index) => Math.min(height - 4, Math.max(span.dated ? yAt(span.start!) : floor, headY[index] + rowHeight / 2)));

  const dates = spans.map((span, index) => ({ key: jobs[index].id ?? `entry-${index}`, index, ...span }));
  const names = new Map<string, number[]>();
  jobs.forEach((job, index) => {
    if (job.branchName) names.set(job.branchName, [...(names.get(job.branchName) ?? []), index]);
  });
  const parents = dates.map((entry, index) => {
    const matches = names.get(jobs[index].parentBranchName ?? '');
    if (!entry.dated || matches?.length !== 1) return null;
    const parent = dates[matches[0]];
    return parent.dated && parent.start! <= entry.start! && parent.end! >= entry.end! ? parent.index : null;
  });
  const cyclic = new Set<number>();
  for (const entry of dates) {
    const chain: number[] = [];
    let index: number | null = entry.index;
    while (index !== null) {
      const seen = chain.indexOf(index);
      if (seen !== -1) {
        chain.slice(seen).forEach((member) => cyclic.add(member));
        break;
      }
      chain.push(index);
      index = parents[index];
    }
  }
  cyclic.forEach((index) => { parents[index] = null; });
  // A child whose row sits above its parent's row (both still ongoing) forks just below the parent's head, where the parent lane is drawn.
  parents.forEach((parent, index) => {
    if (parent !== null && forkY[index] < headY[parent] && headY[parent] + rowHeight / 4 < forkY[parent]) forkY[index] = headY[parent] + rowHeight / 4;
  });

  const lanes = new Map<number, number>();
  const depth = (index: number): number => parents[index] === null ? 0 : 1 + depth(parents[index]!);
  const occupiedUntil: number[] = [];
  const dated = dates.filter((entry) => entry.dated)
    .sort((a, b) => a.start! - b.start! || depth(a.index) - depth(b.index) || b.end! - a.end! || a.key.localeCompare(b.key) || a.index - b.index);
  for (const entry of dated) {
    let lane = parents[entry.index] === null ? 1 : lanes.get(parents[entry.index]!)! + 1;
    while (occupiedUntil[lane] !== undefined && occupiedUntil[lane] <= forkY[entry.index]) lane++;
    lanes.set(entry.index, lane);
    occupiedUntil[lane] = headY[entry.index];
  }
  dates.filter((entry) => !entry.dated).sort((a, b) => a.key.localeCompare(b.key) || a.index - b.index)
    .forEach((entry, index) => lanes.set(entry.index, index + 1));
  const laneCount = Math.max(1, ...lanes.values());

  const width = Math.min(maxWidth, 24 + laneCount * spacing);
  const mainX = Math.min(12, width / 2);
  spacing = Math.min(spacing, (width - mainX - 6) / laneCount);
  const entries: TimelineEntry[] = dates.map((entry) => ({
    ...entry,
    lane: lanes.get(entry.index)!,
    parentKey: parents[entry.index] === null ? null : dates[parents[entry.index]!].key,
    x: mainX + lanes.get(entry.index)! * spacing,
    headY: headY[entry.index],
    forkY: forkY[entry.index],
    forkX: mainX, mergeX: mainX, forkRadius: 0, mergeRadius: 0, path: '',
  }));

  const anchorOwner = (index: number | null, timestamp: number): number | null => {
    if (index === null) return null;
    const entry = entries[index];
    return timestamp === entry.start || (!entry.ongoing && timestamp === entry.end) ? anchorOwner(parents[index], timestamp) : index;
  };
  const attachmentLimits = entries.map(() => ({ fork: Infinity, merge: Infinity }));
  const groups = new Map<string, TimelineEntry[]>();
  const groupKey = (entry: TimelineEntry, action: 'fork' | 'merge') => `${action}:${action === 'fork' ? entry.forkX : entry.mergeX}:${action === 'fork' ? entry.start : entry.end}`;
  for (const entry of entries) {
    if (!entry.dated) continue;
    if (entry.ongoing) entry.mergeX = entry.x;
    for (const action of ['fork', 'merge'] as const) {
      if (action === 'merge' && entry.ongoing) continue;
      const owner = anchorOwner(parents[entry.index], action === 'fork' ? entry.start! : entry.end!);
      const x = owner === null ? mainX : entries[owner].x;
      if (action === 'fork') entry.forkX = x;
      else entry.mergeX = x;
      if (owner !== null) {
        const y = action === 'fork' ? entry.forkY : entry.headY;
        const parent = entries[owner];
        attachmentLimits[owner].fork = Math.min(attachmentLimits[owner].fork, (parent.forkY - y) / 2);
        attachmentLimits[owner].merge = Math.min(attachmentLimits[owner].merge, (y - parent.headY) / 2);
      }
      const key = groupKey(entry, action);
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
  }
  for (const entry of entries) {
    if (entry.dated) {
      for (const action of ['fork', 'merge'] as const) {
        if (action === 'merge' && entry.ongoing) continue;
        const radius = Math.max(0, Math.min(8, spacing / 3, ...groups.get(groupKey(entry, action))!.map((member) => Math.min(
          Math.abs(member.x - (action === 'fork' ? member.forkX : member.mergeX)) / 2,
          (member.forkY - member.headY) / 4,
          attachmentLimits[member.index][action],
        ))));
        if (action === 'fork') entry.forkRadius = radius;
        else entry.mergeRadius = radius;
      }
      const fork = `M${entry.forkX} ${entry.forkY} ${roundedElbow(entry.forkX, entry.x, entry.forkY, entry.forkRadius)}`;
      entry.path = entry.ongoing ? `${fork} V${entry.headY}`
        : `${fork} V${entry.headY + 2 * entry.mergeRadius} ${roundedElbow(entry.x, entry.mergeX, entry.headY + 2 * entry.mergeRadius, entry.mergeRadius)}`;
    } else {
      entry.forkRadius = Math.min(8, spacing / 3);
      entry.path = `M${mainX} ${entry.forkY} ${roundedElbow(mainX, entry.x, entry.forkY, entry.forkRadius)} V${entry.headY}`;
    }
  }
  return { entries, width, height, mainX, order };
}
