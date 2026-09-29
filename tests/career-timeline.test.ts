import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutCareerTimeline } from '../lib/career-timeline';

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
  assert.equal(newer.forkY - newer.headY, 24 * 32);
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
    assert.equal(entry.forkY - entry.headY, (end - start) * 32, relation);
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
