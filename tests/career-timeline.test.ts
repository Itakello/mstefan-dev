import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutCareerTimeline, nearestCareerJunction } from '../lib/career-timeline';

const now = Date.parse('2026-09-29T00:00:00Z');

test('career dates position forks at starts and heads at ends, newest above oldest regardless of title order', () => {
  const layout = layoutCareerTimeline([
    { id: 'older', startDate: '2020-01-01', endDate: '2022-01-01' },
    { id: 'newer', startDate: '2024-01-01', endDate: '2026-01-01' },
  ], now);
  const [older, newer] = layout.entries;
  assert.ok(newer.headY < older.headY);
  assert.ok(newer.forkY < older.forkY);
  assert.ok(older.headY < older.forkY);
  assert.ok(newer.headY < newer.forkY);
  assert.equal(newer.forkY - newer.headY, 24 * 12);
  assert.ok(layout.ticks.some((tick) => new Date(tick.timestamp).getUTCFullYear() === 2024));
  assert.deepEqual(layout, layoutCareerTimeline([
    { id: 'older', startDate: '2020-01-01', endDate: '2022-01-01' },
    { id: 'newer', startDate: '2024-01-01', endDate: '2026-01-01' },
  ], now));
});

test('missing end dates remain undated and complete dates preserve order within the same UTC month', () => {
  const layout = layoutCareerTimeline([
    { id: 'missing-end', startDate: '2026-09-02' },
    { id: 'later', startDate: '2026-09-02', endDate: '2026-09-20' },
    { id: 'earlier', startDate: '2026-09-01', endDate: '2026-09-10' },
  ], now);
  assert.equal(layout.entries[0].dated, false);
  assert.equal(layout.entries[0].end, null);
  assert.ok(layout.entries[1].headY < layout.entries[2].headY);
  assert.ok(layout.entries[1].forkY < layout.entries[2].forkY);
  assert.ok(layout.ticks.every((tick) => tick.month));
});

test('missing, malformed, impossible, future incomplete, and backwards dates remain in a separate undated area', () => {
  const layout = layoutCareerTimeline([
    { id: 'valid', startDate: '2024-01-01', endDate: '2025-01-01' },
    { id: 'missing' },
    { id: 'bad', startDate: 'not-a-date' },
    { id: 'calendar', startDate: '2025-02-30' },
    { id: 'backwards', startDate: '2025-01-01', endDate: '2024-01-01' },
    { id: 'future', startDate: '2030-01-01' },
    { id: 'missing-start', endDate: '2024-01-01' },
    { id: 'bad-end', startDate: '2024-01-01', endDate: 'invalid' },
  ], now);
  assert.equal(layout.entries[0].dated, true);
  for (const entry of layout.entries.slice(1)) {
    assert.equal(entry.dated, false);
    assert.equal(entry.start, null);
    assert.equal(entry.end, null);
    assert.ok(entry.headY > layout.undatedTop);
  }
  assert.ok(layout.ticks.every((tick) => tick.y < layout.undatedTop));
});

test('undated Amazon uses a visible continuous branch without invented axis dates or dates', () => {
  const layout = layoutCareerTimeline([{ id: 'amazon' }], now);
  assert.equal(layout.ticks.length, 0);
  assert.equal(layout.hasUndated, true);
  assert.equal(layout.undatedTop, 0);
  assert.equal(layout.width, 160);
  assert.ok(layout.entries[0].forkY - layout.entries[0].headY >= 220);
});

test('scheduled experiences keep the present inside the dated timeline and above undated entries', () => {
  const layout = layoutCareerTimeline([
    { id: 'scheduled', startDate: '2029-01-01', endDate: '2030-01-01' },
    { id: 'undated' },
  ], now);
  assert.ok(layout.nowY > layout.entries[0].forkY);
  assert.ok(layout.nowY > 0 && layout.nowY < layout.undatedTop);
  assert.ok(layout.entries[1].headY > layout.undatedTop);
});

test('dense histories get unique spaced lanes and a wider canvas rather than overlapping lanes', () => {
  const layout = layoutCareerTimeline(Array.from({ length: 20 }, (_, index) => ({ id: `entry-${index}` })), now);
  assert.equal(new Set(layout.entries.map((entry) => entry.x)).size, 20);
  assert.equal(layout.width, 584);
  assert.ok(layout.entries.every((entry) => entry.x >= 60 && entry.x < layout.mainX));
  assert.ok(layout.entries.every((entry) => Number.isFinite(entry.forkY) && Number.isFinite(entry.headY)));
});

const date = (month: number) => `2024-${String(month).padStart(2, '0')}-01`;
const job = (id: string, start: number, end: number, parentBranchName?: string) => ({ id, branchName: id, startDate: date(start), endDate: date(end), parentBranchName });

test('all thirteen interval relations retain their date positions and return to main', () => {
  const relations = [
    ['before', 1, 3], ['meets', 1, 4], ['overlaps', 2, 6], ['starts', 4, 6],
    ['during', 5, 7], ['finishes', 6, 8], ['equal', 4, 8], ['finished by', 2, 8],
    ['contains', 2, 10], ['started by', 4, 10], ['overlapped by', 6, 10],
    ['met by', 8, 10], ['after', 9, 11],
  ] as const;
  for (const [relation, start, end] of relations) {
    const layout = layoutCareerTimeline([job('reference', 4, 8), job(relation, start, end)], now);
    const [reference, entry] = layout.entries;
    assert.equal(Math.sign(entry.forkY - reference.forkY), Math.sign(4 - start), relation);
    assert.equal(Math.sign(entry.headY - reference.headY), Math.sign(8 - end), relation);
    assert.equal(entry.forkY - entry.headY, (end - start) * 12, relation);
    assert.equal(entry.forkX, layout.mainX, relation);
    assert.equal(entry.mergeX, layout.mainX, relation);
    assert.match(entry.path, /^M[\d.]+ [\d.]+ A/, relation);
    assert.ok(entry.path.endsWith(`${layout.mainX} ${entry.headY}`), relation);
    assert.equal((entry.path.match(/A/g) ?? []).length, 4, relation);
    assert.ok(entry.forkRadius * 2 + entry.mergeRadius * 2 <= entry.forkY - entry.headY, relation);
  }
});

test('nested branches resolve names regardless of CMS order and put ancestors in nearer lanes', () => {
  const parent = job('parent', 1, 10);
  const child = job('child', 2, 9, 'parent');
  const grandchild = job('grandchild', 3, 8, 'child');
  for (const jobs of [[parent, child, grandchild], [grandchild, child, parent]]) {
    const layout = layoutCareerTimeline(jobs, now);
    const entries = Object.fromEntries(layout.entries.map((entry) => [entry.key, entry]));
    assert.equal(entries.child.parentKey, 'parent');
    assert.equal(entries.grandchild.parentKey, 'child');
    assert.ok(entries.parent.lane < entries.child.lane);
    assert.ok(entries.child.lane < entries.grandchild.lane);
    assert.equal(entries.child.forkX, entries.parent.x);
    assert.equal(entries.child.mergeX, entries.parent.x);
    assert.equal(entries.grandchild.forkX, entries.child.x);
    assert.equal(entries.grandchild.mergeX, entries.child.x);
  }
});

test('chronological lanes keep the earliest experience nearest the mainline regardless of CMS order', () => {
  const jobs = [
    { id: 'recent', startDate: '2022-01-01', endDate: '2024-01-01' },
    { id: 'segato', startDate: '2014-09-01', endDate: '2015-06-01' },
    { id: 'middle', startDate: '2018-01-01', endDate: '2020-01-01' },
  ];
  for (const order of [jobs, [...jobs].reverse()]) {
    const layout = layoutCareerTimeline(order, now);
    const entries = Object.fromEntries(layout.entries.map((entry) => [entry.key, entry]));
    assert.equal(entries.segato.lane, 1);
    assert.equal(entries.middle.lane, 1);
    assert.equal(entries.recent.lane, 1);
    assert.equal(entries.segato.x, layout.mainX - 24);
  }
});

test('overlapping experiences occupy separate lanes and later jobs reuse the smallest free lane', () => {
  const layout = layoutCareerTimeline([
    job('later', 8, 10), job('long', 1, 7), job('overlap', 2, 5), job('after', 6, 9),
  ], now);
  const entries = Object.fromEntries(layout.entries.map((entry) => [entry.key, entry]));
  assert.equal(entries.long.lane, 1);
  assert.equal(entries.overlap.lane, 2);
  assert.equal(entries.after.lane, 2);
  assert.equal(entries.later.lane, 1);
});

test('reused lanes keep their configured spacing and do not reserve empty canvas', () => {
  const jobs = Array.from({ length: 12 }, (_, index) => ({
    id: `year-${index}`,
    startDate: `${2014 + index}-01-01`,
    endDate: `${2014 + index}-12-31`,
  }));
  for (const availableWidth of [undefined, 180, 240]) {
    const layout = layoutCareerTimeline(jobs, now, 24, availableWidth);
    assert.ok(layout.entries.every((entry) => entry.lane === 1));
    assert.ok(layout.entries.every((entry) => layout.mainX - entry.x === 24));
    assert.equal(layout.width, availableWidth ?? 160);
  }
});

test('nested children stay farther from the mainline even when their dates and display order match a parent', () => {
  const jobs = [job('grandchild', 1, 10, 'child'), job('child', 1, 10, 'parent'), job('parent', 1, 10)];
  for (const order of [jobs, [...jobs].reverse()]) {
    const entries = Object.fromEntries(layoutCareerTimeline(order, now).entries.map((entry) => [entry.key, entry]));
    assert.equal(entries.parent.lane, 1);
    assert.equal(entries.child.lane, 2);
    assert.equal(entries.grandchild.lane, 3);
  }
});

test('undated entries have deterministic distinct lanes without changing dated chronology', () => {
  const jobs = [{ id: 'z-undated' }, job('segato', 1, 3), { id: 'a-undated' }, job('later', 5, 7)];
  for (const order of [jobs, [...jobs].reverse()]) {
    const layout = layoutCareerTimeline(order, now);
    const entries = Object.fromEntries(layout.entries.map((entry) => [entry.key, entry]));
    assert.equal(entries.segato.lane, 1);
    assert.equal(entries.later.lane, 1);
    assert.equal(entries['a-undated'].lane, 1);
    assert.equal(entries['z-undated'].lane, 2);
    assert.ok(entries['a-undated'].headY > layout.undatedTop);
  }
});

test('nested shared endpoints connect to the actual ancestor junction', () => {
  const layout = layoutCareerTimeline([
    job('parent', 2, 9), job('same', 2, 9, 'parent'), job('deep', 2, 9, 'same'),
    job('same-start', 2, 7, 'parent'), job('same-end', 4, 9, 'parent'),
  ], now);
  const [parent, same, deep, start, end] = layout.entries;
  for (const entry of [same, deep]) {
    assert.equal(entry.forkX, layout.mainX);
    assert.equal(entry.mergeX, layout.mainX);
    assert.equal(entry.forkRadius, parent.forkRadius);
    assert.equal(entry.mergeRadius, parent.mergeRadius);
  }
  assert.equal(start.forkX, layout.mainX);
  assert.equal(start.mergeX, parent.x);
  assert.equal(end.forkX, parent.x);
  assert.equal(end.mergeX, layout.mainX);
});

test('boundary-day children attach to a straight parent lane while shared junctions stay identical', () => {
  const layout = layoutCareerTimeline([
    { id: 'parent', branchName: 'parent', startDate: '2024-01-01', endDate: '2024-12-31' },
    { id: 'child', branchName: 'child', parentBranchName: 'parent', startDate: '2024-01-02', endDate: '2024-12-30' },
    { id: 'deep', parentBranchName: 'child', startDate: '2024-01-02', endDate: '2024-12-30' },
    { id: 'sibling', startDate: '2024-01-01', endDate: '2024-12-31' },
    { id: 'unrelated-first', startDate: '2023-01-01', endDate: '2023-12-31' },
    { id: 'unrelated-second', startDate: '2023-01-01', endDate: '2023-12-31' },
  ], now);
  const [parent, child, deep, sibling, first, second] = layout.entries;
  assert.equal(child.forkX, parent.x);
  assert.equal(child.mergeX, parent.x);
  assert.equal(deep.forkX, parent.x);
  assert.equal(deep.mergeX, parent.x);
  for (const entry of [child, deep]) {
    assert.ok(entry.forkY <= parent.forkY - 2 * parent.forkRadius, 'parent reaches its lane before the child forks');
    assert.ok(entry.headY >= parent.headY + 2 * parent.mergeRadius, 'child returns before the parent leaves its lane');
  }
  assert.ok(parent.forkRadius > 0 && parent.forkRadius < 1);
  assert.ok(parent.mergeRadius > 0 && parent.mergeRadius < 1);
  assert.equal(parent.forkRadius, sibling.forkRadius);
  assert.equal(parent.mergeRadius, sibling.mergeRadius);
  assert.equal(parent.path.split(' H')[0], sibling.path.split(' H')[0]);
  assert.equal(parent.path.slice(parent.path.lastIndexOf(' A')), sibling.path.slice(sibling.path.lastIndexOf(' A')));
  assert.equal(first.forkRadius, 8);
  assert.equal(first.mergeRadius, 8);
  assert.equal(first.forkRadius, second.forkRadius);
  assert.equal(first.mergeRadius, second.mergeRadius);
});

test('missing, ambiguous, self-referencing, cyclic and out-of-range parents fall back to main', () => {
  const layout = layoutCareerTimeline([
    job('missing', 2, 8, 'absent'), job('self', 2, 8, 'self'),
    job('cycle-a', 2, 8, 'cycle-b'), job('cycle-b', 2, 8, 'cycle-a'),
    job('parent', 3, 7), job('outside', 2, 8, 'parent'),
    job('duplicate', 1, 9), { ...job('other', 1, 9), branchName: 'duplicate' },
    job('ambiguous', 2, 8, 'duplicate'), { id: 'undated-parent', branchName: 'undated-parent' },
    job('dated-child', 2, 8, 'undated-parent'),
  ], now);
  for (const key of ['missing', 'self', 'cycle-a', 'cycle-b', 'outside', 'ambiguous', 'dated-child']) {
    const entry = layout.entries.find((entry) => entry.key === key)!;
    assert.equal(entry.parentKey, null, key);
    assert.equal(entry.forkX, layout.mainX, key);
    assert.equal(entry.mergeX, layout.mainX, key);
    assert.doesNotMatch(entry.path, /NaN|Infinity/, key);
  }
});

test('shared starts and ends use the shortest group duration and identical circular trunk arcs', () => {
  const layout = layoutCareerTimeline([
    { id: 'long', startDate: '2024-01-01', endDate: '2024-03-01' },
    { id: 'short-start', startDate: '2024-01-01', endDate: '2024-01-02' },
    { id: 'short-end', startDate: '2024-02-29', endDate: '2024-03-01' },
  ], now);
  const [long, start, end] = layout.entries;
  assert.ok(long.forkRadius < 1);
  assert.ok(long.mergeRadius < 1);
  assert.equal(long.forkRadius, start.forkRadius);
  assert.equal(long.mergeRadius, end.mergeRadius);
  assert.equal(long.path.split(' H')[0], start.path.split(' H')[0]);
  assert.equal(long.path.slice(long.path.lastIndexOf(' A')), end.path.slice(end.path.lastIndexOf(' A')));
  for (const entry of layout.entries) assert.ok(2 * entry.forkRadius + 2 * entry.mergeRadius <= entry.forkY - entry.headY);
});

test('equal dates produce a finite zero-height branch and undated jobs keep an open branch', () => {
  const layout = layoutCareerTimeline([job('instant', 4, 4), { id: 'open', startDate: '2024-04-01' }], now);
  const [instant, open] = layout.entries;
  assert.equal(instant.forkY, instant.headY);
  assert.equal(instant.forkRadius, 0);
  assert.equal(instant.mergeRadius, 0);
  assert.doesNotMatch(instant.path, /NaN|Infinity|A0/);
  assert.ok(instant.path.endsWith(`H${layout.mainX}`));
  assert.equal(open.dated, false);
  assert.equal(open.start, null);
  assert.equal(open.end, null);
  assert.ok(open.path.endsWith(`V${open.headY}`));
  assert.equal((open.path.match(/A/g) ?? []).length, 2);
});

test('compact lanes support the full spacing range and safely clamp invalid values', () => {
  const jobs = [job('parent', 1, 10), job('child', 2, 9, 'parent'), job('sibling', 3, 8)];
  for (const spacing of [18, 24, 64]) {
    const layout = layoutCareerTimeline(jobs, now, spacing);
    assert.equal(layout.mainX - layout.entries[0].x, spacing);
    assert.equal(layout.entries[0].x - layout.entries[1].x, spacing);
    assert.equal(layout.width, Math.max(160, 104 + 3 * spacing));
    assert.ok(layout.entries.every((entry) => entry.x >= 80));
    assert.ok(layout.entries.every((entry) => entry.forkRadius <= Math.abs(entry.forkX - entry.x) / 2));
  }
  assert.deepEqual(layoutCareerTimeline(jobs, now, 0), layoutCareerTimeline(jobs, now, 18));
  assert.deepEqual(layoutCareerTimeline(jobs, now, 100), layoutCareerTimeline(jobs, now, 64));
  assert.deepEqual(layoutCareerTimeline(jobs, now, NaN), layoutCareerTimeline(jobs, now));
});


test('explicit ongoing experiences end at today on their own selectable lane with dated ticks', () => {
  const layout = layoutCareerTimeline([
    { id: 'current', startDate: '2024-01-01', ongoing: true, endDate: '2025-01-01' },
    { id: 'missing-end', startDate: '2024-01-01' },
    { id: 'future-current', startDate: '2030-01-01', ongoing: true },
    { id: 'missing-start', ongoing: true },
  ], now);
  const [current, missing, future, incomplete] = layout.entries;
  assert.equal(current.dated, true);
  assert.equal(current.end, now);
  assert.equal(current.headY, layout.nowY);
  assert.equal(current.mergeX, current.x);
  assert.equal(current.mergeRadius, 0);
  assert.ok(current.path.endsWith(`V${layout.nowY}`));
  assert.equal((current.path.match(/A/g) ?? []).length, 2);
  assert.ok(layout.ticks.length > 0);
  assert.ok(layout.ticks.some((tick) => new Date(tick.timestamp).getUTCFullYear() === 2024));
  for (const entry of [missing, future, incomplete]) {
    assert.equal(entry.dated, false);
    assert.equal(entry.end, null);
  }
});

test('ongoing nested experiences remain open and completed children can return to their current parent lane', () => {
  const layout = layoutCareerTimeline([
    { id: 'child', branchName: 'child', parentBranchName: 'parent', startDate: '2025-01-01', ongoing: true },
    { id: 'parent', branchName: 'parent', startDate: '2024-01-01', ongoing: true },
    { id: 'completed', parentBranchName: 'child', startDate: '2025-02-01', endDate: '2026-09-29' },
    { id: 'closed-parent', branchName: 'closed-parent', startDate: '2024-01-01', endDate: '2025-01-01' },
    { id: 'outside', parentBranchName: 'closed-parent', startDate: '2024-02-01', ongoing: true },
  ], now);
  const [child, parent, completed, , outside] = layout.entries;
  assert.equal(child.parentKey, parent.key);
  assert.ok(parent.lane < child.lane);
  assert.equal(child.forkX, parent.x);
  assert.equal(child.mergeX, child.x);
  assert.equal(child.headY, parent.headY);
  assert.equal(completed.parentKey, child.key);
  assert.equal(completed.mergeX, child.x);
  assert.ok(completed.path.endsWith(`${child.x} ${child.headY}`));
  assert.equal(outside.parentKey, null);
  assert.equal(outside.forkX, layout.mainX);
  assert.equal(outside.mergeX, outside.x);
  for (const entry of layout.entries) assert.doesNotMatch(entry.path, /NaN|Infinity/);
});


test('annual date ticks start at the current year and span complete past calendar years', () => {
  for (const startDate of ['2014-09-01', '2014-09-15', '2014-01-01']) {
    const layout = layoutCareerTimeline([{ id: 'first', startDate, ongoing: true }], now);
    const years = layout.ticks.map((tick) => new Date(tick.timestamp).getUTCFullYear());
    assert.deepEqual(years, Array.from({ length: 13 }, (_, index) => 2026 - index));
    assert.ok(layout.ticks.every((tick) => !tick.month));
    assert.equal(layout.ticks.at(-1)!.timestamp, Date.parse('2014-01-01T00:00:00Z'));
    assert.ok(layout.ticks.at(-1)!.y >= layout.entries[0].forkY);
    for (let index = 1; index < layout.ticks.length; index++) {
      assert.ok(layout.ticks[index].timestamp < layout.ticks[index - 1].timestamp);
      assert.equal(layout.ticks[index].y - layout.ticks[index - 1].y, 144);
    }
  }
});

test('the mainline stops at the latest dated point without a future-year tail', () => {
  const current = layoutCareerTimeline([
    { id: 'amazon', startDate: '2025-10-01', ongoing: true },
    { id: 'segato', startDate: '2014-09-01', endDate: '2019-07-01' },
  ], now);
  assert.equal(current.topY, current.entries[0].headY);
  assert.equal(current.ticks[0].timestamp, Date.parse('2026-01-01T00:00:00Z'));
  assert.ok(current.topY < current.ticks[0].y);
  const scheduled = layoutCareerTimeline([{ id: 'scheduled', startDate: '2027-01-01', endDate: '2027-03-01' }], now);
  assert.equal(scheduled.topY, scheduled.entries[0].headY);
});


test('fitted mobile lanes retain parents and circular paths within the available width', () => {
  const jobs = [job('parent', 1, 10), job('child', 2, 9, 'parent'), ...Array.from({ length: 18 }, (_, index) => job(`other-${index}`, 3, 8))];
  for (const width of [180, 246, 350, 560]) {
    const layout = layoutCareerTimeline(jobs, now, 64, width);
    assert.equal(layout.width, width);
    assert.equal(new Set(layout.entries.map((entry) => entry.x)).size, jobs.length);
    assert.ok(layout.entries.every((entry) => entry.x >= 16 && entry.x < layout.mainX));
    assert.equal(layout.entries[1].parentKey, 'parent');
    assert.equal(layout.entries[1].forkX, layout.entries[0].x);
    assert.equal(layout.entries[1].mergeX, layout.entries[0].x);
    for (const entry of layout.entries) {
      assert.doesNotMatch(entry.path, /NaN|Infinity/);
      assert.ok(entry.forkRadius <= Math.abs(entry.forkX - entry.x) / 2);
      assert.ok(entry.mergeRadius <= Math.abs(entry.mergeX - entry.x) / 2);
    }
  }
});


test('nearest junction resolves overlapping endpoint hit areas independently of SVG paint order', () => {
  const closeDates = layoutCareerTimeline([
    { id: 'early', startDate: '2024-01-01', endDate: '2024-03-01' },
    { id: 'late', startDate: '2024-01-01', endDate: '2024-03-16' },
  ], now);
  const [early, late] = closeDates.entries;
  assert.ok(early.headY - late.headY > 0 && early.headY - late.headY < 12);
  assert.deepEqual(nearestCareerJunction(closeDates.entries, early.mergeX, early.headY), { x: early.mergeX, y: early.headY });
  assert.deepEqual(nearestCareerJunction([...closeDates.entries].reverse(), late.mergeX, late.headY), { x: late.mergeX, y: late.headY });
  assert.equal(nearestCareerJunction(closeDates.entries, -100, -100), null);

  const mobile = layoutCareerTimeline(Array.from({ length: 20 }, (_, index) => ({
    id: `current-${index}`, startDate: '2024-01-01', ongoing: true,
  })), now, 24, 180);
  const [first, second] = mobile.entries;
  assert.ok(first.x - second.x > 0 && first.x - second.x < 12);
  assert.deepEqual(nearestCareerJunction(mobile.entries, first.x, first.headY), { x: first.x, y: first.headY });
  assert.deepEqual(nearestCareerJunction([...mobile.entries].reverse(), second.x, second.headY), { x: second.x, y: second.headY });
  assert.deepEqual(nearestCareerJunction(mobile.entries, mobile.mainX, first.forkY), { x: mobile.mainX, y: first.forkY });
});
