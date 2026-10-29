import { describe, expect, test } from 'vitest';
import { effectiveness, memoryOf, reviewLoad } from '../../src/core/insights';
import { makeScheduler } from '../../src/core/scheduler';
import { DEFAULT_SETTINGS, type ReviewEntry } from '../../src/core/model';
import type { EntryKind } from '../../src/core/progress';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const scheduler = makeScheduler(DEFAULT_SETTINGS);

describe('memoryOf', () => {
  test('null when no card was studied', () => {
    expect(memoryOf([scheduler.initial(NOW)], NOW, scheduler)).toBeNull();
    expect(memoryOf([], NOW, scheduler)).toBeNull();
  });
  test('mean recall now, lower in 30 days without review; new cards ignored', () => {
    let s = scheduler.initial(NOW - 40 * DAY);
    s = scheduler.apply(s, 3, NOW - 40 * DAY);
    s = scheduler.apply(s, 3, NOW - 39 * DAY);
    const m = memoryOf([s, scheduler.initial(NOW)], NOW, scheduler)!;
    expect(m.now).toBeGreaterThan(0);
    expect(m.now).toBeLessThanOrEqual(1);
    expect(m.in30).toBeLessThan(m.now);
    expect(m.now).toBeCloseTo(scheduler.retrievability(s, NOW), 6);
  });
});

describe('reviewLoad', () => {
  test('a new card answered right each time needs a few reviews in 30 days, more in 90', () => {
    const r30 = reviewLoad(scheduler, NOW, 30);
    expect(r30).toBeGreaterThanOrEqual(1);
    expect(r30).toBeLessThanOrEqual(5);
    expect(reviewLoad(scheduler, NOW, 90)).toBeGreaterThanOrEqual(r30);
  });
});

describe('effectiveness', () => {
  const entry = (id: string, cardId: string, daysAgo: number, correct: boolean, durationMs = 4000): ReviewEntry => ({
    id, cardId, ts: NOW - daysAgo * DAY, rating: correct ? 3 : 1, mode: 'production', correct, durationMs, hintUsed: false, deviceId: 'd',
  });
  const entries = [
    entry('a', 'c1', 1, true, 2000),
    entry('b', 'c1', 10, false, 6000),
    entry('c', 'c2', 10, true, 600_000),
    entry('d', 'c2', 60, true),
    entry('e', 'c3', 60, false),
    entry('f', 'c3', 2, true), // new card, not counted in success
    entry('g', 'c3', 2, true, 0), // self-graded: no duration, left out of the median
  ];
  const kinds = new Map<string, EntryKind>([['a', 'due'], ['b', 'due'], ['c', 'due'], ['d', 'due'], ['e', 'due'], ['f', 'new'], ['g', 'new']]);
  const typeOf = (id: string) => (id === 'c3' ? 'scenario' : 'basic') as 'basic' | 'scenario';
  const domainOf = (id: string) => (id === 'c1' ? 'Coaching' : 'Maths');
  const r = effectiveness(entries, kinds, typeOf, domainOf, NOW);

  test('success on due reviews over 30 and 90 days, and active days', () => {
    expect(r.windows).toEqual([
      { days: 30, rate: 2 / 3, count: 3, activeDays: 3 },
      { days: 90, rate: 3 / 5, count: 5, activeDays: 4 },
    ]);
  });
  test('by exercise type and by domain, over 90 days', () => {
    expect(r.byType).toEqual([
      { key: 'basic', rate: 3 / 4, count: 4 },
      { key: 'scenario', rate: 0, count: 1 },
    ]);
    expect(r.byDomain).toEqual([
      { key: 'Coaching', rate: 1 / 2, count: 2 },
      { key: 'Maths', rate: 2 / 3, count: 3 },
    ]);
  });
  test('median time per answer over 90 days, long pauses capped at 5 minutes', () => {
    expect(r.medianMs).toBe(4000);
    expect(effectiveness([], kinds, typeOf, domainOf, NOW)).toMatchObject({ medianMs: null, windows: [{ rate: null, count: 0, activeDays: 0 }, { rate: null }] });
  });
});
