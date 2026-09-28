export type TimelineJob = { id?: string | null; startDate?: string | null; endDate?: string | null };
export type TimelineEntry = { key: string; index: number; dated: boolean; start: number | null; end: number | null; x: number; forkY: number; headY: number };

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

export function layoutCareerTimeline(jobs: TimelineJob[], now: number) {
  if (!Number.isFinite(now)) throw new Error('A valid current date is required.');
  const dates = jobs.map((job, index) => {
    const start = parseDate(job.startDate);
    const end = parseDate(job.endDate);
    const dated = start !== null && end !== null && end >= start;
    return { key: job.id ?? `entry-${index}`, index, dated, start: dated ? start : null, end: dated ? end : null };
  });
  const dated = dates.filter((entry) => entry.dated);
  const undated = dates.filter((entry) => !entry.dated);
  const newest = Math.ceil(Math.max(monthPosition(now), ...dated.map((entry) => monthPosition(entry.end!))));
  const oldest = dated.length ? Math.floor(Math.min(...dated.map((entry) => monthPosition(entry.start!)))) : newest;
  const datedHeight = dated.length ? Math.max(160, (newest - oldest) * 32 + 80) : 0;
  const undatedTop = datedHeight;
  const height = datedHeight + (undated.length ? Math.max(320, 88 + undated.length * 84) : 0);
  const width = Math.max(160, 104 + jobs.length * 36);
  const mainX = width - 24;
  const yAt = (timestamp: number) => 40 + (newest - monthPosition(timestamp)) * 32;
  const entries: TimelineEntry[] = dates.map((entry) => ({
    ...entry,
    x: mainX - (entry.index + 1) * 36,
    headY: entry.dated ? yAt(entry.end!) : undatedTop + 76 + undated.indexOf(entry) * 84,
    forkY: entry.dated ? yAt(entry.start!) : height - 24,
  }));
  const ticks: { timestamp: number; y: number; month: boolean }[] = [];
  for (let month = newest; dated.length && month >= oldest; month--) {
    if (newest - oldest > 24 && month % 12 !== 0) continue;
    const timestamp = Date.UTC(Math.floor(month / 12), month % 12, 1);
    ticks.push({ timestamp, y: yAt(timestamp), month: newest - oldest <= 24 });
  }
  return { entries, width, height: Math.max(height, 160), mainX, nowY: dated.length ? yAt(now) : 44, ticks, undatedTop, hasUndated: undated.length > 0 };
}
