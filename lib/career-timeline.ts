export type TimelineJob = { id?: string | null; startDate?: string | null; endDate?: string | null; branchName?: string | null; parentBranchName?: string | null };
export type TimelineEntry = { key: string; index: number; dated: boolean; start: number | null; end: number | null; x: number; forkY: number; headY: number; lane: number; parentKey: string | null; forkX: number; mergeX: number; forkRadius: number; mergeRadius: number; path: string };

function parseDate(value?: string | null): number | null {
  if (!value) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  const timestamp = Date.parse(value);
  if (!parts || !Number.isFinite(timestamp)) return null;
  const [year, month, day] = parts.slice(1).map(Number);
  const calendar = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T00:00:00Z`);
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day ? timestamp : null;
}

function monthPosition(timestamp: number): number {
  const date = new Date(timestamp);
  const days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return date.getUTCFullYear() * 12 + date.getUTCMonth() + (date.getUTCDate() - 1) / days;
}

function roundedElbow(from: number, to: number, y: number, radius: number): string {
  if (!radius) return `H${to}`;
  const direction = Math.sign(to - from);
  const sweep = direction > 0 ? 1 : 0;
  return `A${radius} ${radius} 0 0 ${sweep} ${from + direction * radius} ${y - radius} H${to - direction * radius} A${radius} ${radius} 0 0 ${1 - sweep} ${to} ${y - 2 * radius}`;
}

export function layoutCareerTimeline(jobs: TimelineJob[], now: number, spacing = 24) {
  if (!Number.isFinite(now)) throw new Error('A valid current date is required.');
  spacing = Number.isFinite(spacing) ? Math.max(18, Math.min(64, spacing)) : 24;
  const dates = jobs.map((job, index) => {
    const start = parseDate(job.startDate);
    const end = parseDate(job.endDate);
    const dated = start !== null && end !== null && end >= start;
    return { key: job.id ?? `entry-${index}`, index, dated, start: dated ? start : null, end: dated ? end : null };
  });
  const dated = dates.filter((entry) => entry.dated);
  const undated = dates.filter((entry) => !entry.dated);
  const newest = Math.ceil(Math.max(monthPosition(now), ...dated.map((entry) => monthPosition(entry.end!))));
  const oldest = dated.length ? Math.floor(Math.min(monthPosition(now), ...dated.map((entry) => monthPosition(entry.start!)))) : newest;
  const datedHeight = dated.length ? Math.max(160, (newest - oldest) * 32 + 80) : 0;
  const undatedTop = datedHeight;
  const height = datedHeight + (undated.length ? Math.max(320, 88 + undated.length * 84) : 0);
  const width = Math.max(160, 104 + jobs.length * spacing);
  const mainX = width - 24;
  const yAt = (timestamp: number) => 40 + (newest - monthPosition(timestamp)) * 32;
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
  const lanes = new Map<number, number>();
  const assignLane = (index: number): void => {
    if (lanes.has(index)) return;
    const parent = parents[index];
    if (parent !== null) assignLane(parent);
    lanes.set(index, lanes.size + 1);
  };
  dates.forEach((entry) => assignLane(entry.index));
  const entries: TimelineEntry[] = dates.map((entry) => ({
    ...entry,
    lane: lanes.get(entry.index)!,
    parentKey: parents[entry.index] === null ? null : dates[parents[entry.index]!].key,
    x: mainX - lanes.get(entry.index)! * spacing,
    headY: entry.dated ? yAt(entry.end!) : undatedTop + 76 + undated.indexOf(entry) * 84,
    forkY: entry.dated ? yAt(entry.start!) : height - 24,
    forkX: mainX, mergeX: mainX, forkRadius: 0, mergeRadius: 0, path: '',
  }));
  const anchorOwner = (index: number | null, timestamp: number): number | null => {
    if (index === null) return null;
    const entry = entries[index];
    return timestamp === entry.start || timestamp === entry.end ? anchorOwner(parents[index], timestamp) : index;
  };
  const attachmentLimits = entries.map(() => ({ fork: Infinity, merge: Infinity }));
  const groups = new Map<string, TimelineEntry[]>();
  const groupKey = (entry: TimelineEntry, action: 'fork' | 'merge') => `${action}:${action === 'fork' ? entry.forkX : entry.mergeX}:${action === 'fork' ? entry.start : entry.end}`;
  for (const entry of entries) {
    if (!entry.dated) continue;
    for (const action of ['fork', 'merge'] as const) {
      const timestamp = action === 'fork' ? entry.start! : entry.end!;
      const owner = anchorOwner(parents[entry.index], timestamp);
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
        const radius = Math.min(8, spacing / 3, ...groups.get(groupKey(entry, action))!.map((member) => Math.min(
          Math.abs(member.x - (action === 'fork' ? member.forkX : member.mergeX)) / 2,
          (member.forkY - member.headY) / 4,
          attachmentLimits[member.index][action],
        )));
        if (action === 'fork') entry.forkRadius = radius;
        else entry.mergeRadius = radius;
      }
      entry.path = `M${entry.forkX} ${entry.forkY} ${roundedElbow(entry.forkX, entry.x, entry.forkY, entry.forkRadius)} V${entry.headY + 2 * entry.mergeRadius} ${roundedElbow(entry.x, entry.mergeX, entry.headY + 2 * entry.mergeRadius, entry.mergeRadius)}`;
    } else {
      entry.forkRadius = Math.min(8, spacing / 3);
      entry.path = `M${mainX} ${entry.forkY} ${roundedElbow(mainX, entry.x, entry.forkY, entry.forkRadius)} V${entry.headY}`;
    }
  }
  const ticks: { timestamp: number; y: number; month: boolean }[] = [];
  for (let month = newest; dated.length && month >= oldest; month--) {
    if (newest - oldest > 24 && month % 12 !== 0) continue;
    const timestamp = Date.UTC(Math.floor(month / 12), month % 12, 1);
    ticks.push({ timestamp, y: yAt(timestamp), month: newest - oldest <= 24 });
  }
  return { entries, width, height: Math.max(height, 160), mainX, nowY: dated.length ? yAt(now) : 44, ticks, undatedTop, hasUndated: undated.length > 0 };
}
