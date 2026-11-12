import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCareerPeriod, layoutCareerRows, ongoingCareerEntries } from '../lib/career-timeline';

const now = Date.parse('2026-09-29T00:00:00Z');
const date = (month: number) => `2024-${String(month).padStart(2, '0')}-01`;
const job = (id: string, start: number, end: number, parentBranchName?: string) => ({ id, branchName: id, startDate: date(start), endDate: date(end), parentBranchName });
const layout = (jobs: Parameters<typeof layoutCareerRows>[0], options: Partial<Parameters<typeof layoutCareerRows>[2]> = {}) =>
  layoutCareerRows(jobs, now, { rowHeight: 100, top: 60, maxWidth: 400, ...options });
const byKey = (result: ReturnType<typeof layoutCareerRows>, key: string) => result.entries.find((entry) => entry.key === key)!;

test('each head sits level with its own row, newest and ongoing first, with the mainline on the left', () => {
  const result = layout([
    { id: 'bachelor', branchName: 'bachelor', startDate: '2019-09-01', endDate: '2022-09-01' },
    { id: 'job', branchName: 'job', startDate: '2025-10-01', ongoing: true },
    { id: 'master', branchName: 'master-degree', startDate: '2022-09-01', endDate: '2025-03-01' },
    { id: 'thesis', branchName: 'thesis', parentBranchName: 'master-degree', startDate: '2024-09-01', endDate: '2024-12-01' },
    { id: 'undated', branchName: 'undated' },
  ]);
  assert.deepEqual(result.order, [1, 2, 3, 0, 4]);
  assert.equal(result.height, 60 + 5 * 100);
  result.order.forEach((index, row) => assert.equal(result.entries[index].headY, 60 + row * 100 + 50));
  for (const entry of result.entries) {
    assert.ok(entry.forkY > entry.headY, `${entry.key} forks below its head`);
    assert.ok(entry.forkY <= result.height);
    assert.ok(entry.x > result.mainX && entry.x <= result.width, `${entry.key} lane sits right of the mainline`);
    assert.doesNotMatch(entry.path, /NaN|Infinity/, entry.key);
  }
  assert.equal(byKey(result, 'thesis').parentKey, 'master');
  assert.ok(byKey(result, 'thesis').x > byKey(result, 'master').x, 'a nested branch takes a lane beside its parent');
  assert.deepEqual(result, layout([
    { id: 'bachelor', branchName: 'bachelor', startDate: '2019-09-01', endDate: '2022-09-01' },
    { id: 'job', branchName: 'job', startDate: '2025-10-01', ongoing: true },
    { id: 'master', branchName: 'master-degree', startDate: '2022-09-01', endDate: '2025-03-01' },
    { id: 'thesis', branchName: 'thesis', parentBranchName: 'master-degree', startDate: '2024-09-01', endDate: '2024-12-01' },
    { id: 'undated', branchName: 'undated' },
  ]), 'layout is deterministic');
});

test('later starts fork higher than earlier starts, between the rows their dates fall between', () => {
  const result = layout([job('old', 1, 3), job('new', 6, 9)]);
  const [old, recent] = result.entries;
  assert.ok(recent.headY < old.headY);
  assert.ok(recent.forkY < old.forkY);
  assert.ok(recent.forkY <= old.headY, 'a branch that starts after another ended forks above that row');
});

test('overlapping experiences take separate lanes and later ones reuse the smallest free lane', () => {
  const result = layout([job('a', 1, 4), job('b', 2, 6), job('c', 7, 9)]);
  assert.notEqual(byKey(result, 'a').lane, byKey(result, 'b').lane);
  assert.equal(byKey(result, 'c').lane, 1);
});

test('nested branches resolve names regardless of order and sit farther from the mainline than their parent', () => {
  const result = layout([job('child', 3, 5, 'parent'), job('parent', 2, 8), job('grandchild', 3, 4, 'child')]);
  const [child, parent, grandchild] = result.entries;
  assert.equal(child.parentKey, 'parent');
  assert.equal(grandchild.parentKey, 'child');
  assert.ok(parent.lane < child.lane && child.lane < grandchild.lane);
  assert.equal(child.forkX, parent.x);
  assert.equal(child.mergeX, parent.x);
});

test('missing, ambiguous, self-referencing, cyclic and out-of-range parents fall back to main', () => {
  const result = layout([
    job('missing', 2, 8, 'absent'), job('self', 2, 8, 'self'),
    job('cycle-a', 2, 8, 'cycle-b'), job('cycle-b', 2, 8, 'cycle-a'),
    job('parent', 3, 7), job('outside', 2, 8, 'parent'),
    job('duplicate', 1, 9), { ...job('other', 1, 9), branchName: 'duplicate' },
    job('ambiguous', 2, 8, 'duplicate'), { id: 'undated-parent', branchName: 'undated-parent' },
    job('dated-child', 2, 8, 'undated-parent'),
  ]);
  for (const key of ['missing', 'self', 'cycle-a', 'cycle-b', 'outside', 'ambiguous', 'dated-child']) {
    const entry = byKey(result, key);
    assert.equal(entry.parentKey, null, key);
    assert.equal(entry.forkX, result.mainX, key);
    assert.equal(entry.mergeX, result.mainX, key);
    assert.doesNotMatch(entry.path, /NaN|Infinity/, key);
  }
});

test('undated and malformed entries come last with distinct lanes and an open branch', () => {
  const result = layout([
    { id: 'undated-b' }, { id: 'malformed', startDate: '2024-02-30', endDate: '2025-01-01' },
    job('dated', 1, 4), { id: 'undated-a' },
  ]);
  assert.equal(result.order[0], 2);
  const undated = result.entries.filter((entry) => !entry.dated);
  assert.equal(undated.length, 3);
  assert.equal(new Set(undated.map((entry) => entry.lane)).size, 3);
  for (const entry of undated) assert.match(entry.path, new RegExp(`V${entry.headY}$`));
});

test('ongoing experiences stay open at their head and nested completed children return to the ongoing lane', () => {
  const result = layout([
    { id: 'job', branchName: 'job', startDate: '2024-01-01', ongoing: true },
    { id: 'project', branchName: 'project', parentBranchName: 'job', startDate: '2024-03-01', endDate: '2024-06-01' },
  ]);
  const [ongoing, project] = result.entries;
  assert.equal(ongoing.mergeX, ongoing.x);
  assert.match(ongoing.path, new RegExp(`V${ongoing.headY}$`));
  assert.equal(project.mergeX, ongoing.x);
});

test('ongoing entries list every active branch newest first', () => {
  const jobs = [
    { id: 'old', startDate: '2020-01-01', ongoing: true },
    { id: 'done', startDate: '2021-01-01', endDate: '2022-01-01' },
    { id: 'new', startDate: '2025-01-01', ongoing: true },
    { id: 'undated', ongoing: true },
  ];
  assert.deepEqual(ongoingCareerEntries(jobs, now).map((entry) => entry.id), ['new', 'old', 'undated']);
});

test('the width follows the lanes up to a maximum, and spacing clamps safely', () => {
  const jobs = [job('a', 1, 9), job('b', 2, 8), job('c', 3, 7)];
  const wide = layout(jobs, { maxWidth: 400, spacing: 24 });
  const narrow = layout(jobs, { maxWidth: 400, spacing: 18 });
  assert.equal(wide.width, 24 + 3 * 24);
  assert.ok(narrow.width < wide.width);
  const rail = layout(jobs, { maxWidth: 28 });
  assert.equal(rail.width, 28);
  for (const entry of rail.entries) assert.ok(entry.x <= rail.width && entry.x > rail.mainX);
  for (const spacing of [Number.NaN, -1, 1000]) {
    for (const entry of layout(jobs, { spacing }).entries) assert.doesNotMatch(entry.path, /NaN|Infinity/);
  }
  assert.throws(() => layoutCareerRows(jobs, Number.NaN, { rowHeight: 100, top: 60, maxWidth: 400 }));
});

test('story and graph periods share localized dates and missing-date behavior', () => {
  const now = Date.parse('2026-10-13');
  assert.equal(formatCareerPeriod({ startDate: '2022-09-01', endDate: '2024-07-01' }, 'en', now), 'Sep 2022 – Jul 2024');
  assert.equal(formatCareerPeriod({ startDate: '2022-09-01', ongoing: true, endDate: '2020-01-01' }, 'it', now), 'set 2022 – Presente');
  assert.equal(formatCareerPeriod({}, 'en', now), 'Dates not provided');
  for (const job of [{ startDate: '2024-02-30', endDate: '2025-01-01' }, { startDate: '2024-01-01' }, { startDate: '2025-01-01', endDate: '2024-01-01' }]) {
    assert.equal(formatCareerPeriod(job, 'en', now), 'Date range incomplete');
  }
});

test('a nested branch still ongoing above its ongoing parent forks where the parent lane is drawn', () => {
  const result = layout([
    { id: 'parent', branchName: 'parent', startDate: '2024-01-01', ongoing: true },
    { id: 'child', branchName: 'child', parentBranchName: 'parent', startDate: '2025-01-01', ongoing: true },
  ]);
  const [parent, child] = result.entries;
  assert.equal(child.parentKey, 'parent');
  assert.equal(child.forkX, parent.x);
  assert.ok(child.forkY > parent.headY && child.forkY < parent.forkY, 'the fork lies on the drawn part of the parent lane');
});

test('undated entries never share a lane with dated branches', () => {
  const result = layout([
    { id: 'dated', branchName: 'dated', startDate: '2020-01-01', ongoing: true },
    { id: 'undated', branchName: 'undated', ongoing: true },
  ]);
  const [dated, undated] = result.entries;
  assert.ok(undated.lane > dated.lane);
  assert.notEqual(undated.x, dated.x);
});

test('a completed nested branch forks on the drawn part of its ongoing parent lane', () => {
  const result = layout([
    { id: 'parent', branchName: 'parent', startDate: '2024-01-01', ongoing: true },
    { id: 'child', branchName: 'child', parentBranchName: 'parent', startDate: '2024-02-01', endDate: '2024-03-01' },
  ], { maxWidth: 160 });
  const [parent, child] = result.entries;
  assert.equal(child.forkX, parent.x);
  assert.ok(child.forkY > parent.headY && child.forkY < parent.forkY, 'the child fork lies between the parent head and fork');
  assert.ok(child.headY > parent.headY && child.headY < parent.forkY, 'the child head lies on the parent lane');
  assert.ok(parent.forkY <= result.height);
});

test('branches starting the same day from the same lane share one junction even when one has nested children', () => {
  const result = layout([job('b', 1, 9), job('c', 1, 6), job('d', 2, 4, 'b')]);
  const [b, c, d] = result.entries;
  assert.equal(b.forkY, c.forkY);
  assert.ok(d.forkY < b.forkY && d.forkY > b.headY);
});

test('a child starting the same day as its parent forks at the parent junction', () => {
  const result = layout([job('parent', 2, 9), job('same', 2, 7, 'parent'), job('later', 4, 6, 'parent')]);
  const [parent, same] = result.entries;
  assert.equal(same.forkY, parent.forkY);
  assert.equal(same.forkX, result.mainX);
});
