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

test('dense histories get unique spaced lanes and a wider canvas rather than overlapping lanes', () => {
  const layout = layoutCareerTimeline(Array.from({ length: 20 }, (_, index) => ({ id: `entry-${index}` })), now);
  assert.equal(new Set(layout.entries.map((entry) => entry.x)).size, 20);
  assert.ok(layout.width > 700);
  assert.ok(layout.entries.every((entry) => entry.x >= 60 && entry.x < layout.mainX));
  assert.ok(layout.entries.every((entry) => Number.isFinite(entry.forkY) && Number.isFinite(entry.headY)));
});
