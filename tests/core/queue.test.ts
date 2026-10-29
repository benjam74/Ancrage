import { describe, expect, test } from 'vitest';
import { State } from 'ts-fsrs';
import { buildCustomQueue, buildDailyQueue, countNewIntroduced, nextDue, studyDayStart, type QueueCandidate } from '../../src/core/queue';
import { makeScheduler } from '../../src/core/scheduler';
import { DEFAULT_SETTINGS, type ReviewEntry } from '../../src/core/model';

const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const blank = makeScheduler(DEFAULT_SETTINGS).initial(0);

function cand(cardId: string, themeId: string, themeOrder: number, opts: { due?: number; state?: State; createdAt?: number } = {}): QueueCandidate {
  return {
    cardId,
    themeId,
    themeOrder,
    noteCreatedAt: opts.createdAt ?? 0,
    state: { ...blank, state: opts.state ?? State.Review, due: new Date(opts.due ?? NOW - HOUR) },
  };
}
const fresh = (cardId: string, themeOrder: number, createdAt = 0) => cand(cardId, `t${themeOrder}`, themeOrder, { state: State.New, createdAt });

function entry(cardId: string, ts: number): ReviewEntry {
  return { id: `${ts}-${cardId}`, cardId, ts, rating: 3, mode: 'production', correct: true, durationMs: 1000, hintUsed: false, deviceId: 'd' };
}

describe('buildDailyQueue', () => {
  test('an empty collection gives an empty queue', () => {
    expect(buildDailyQueue([], NOW, 5)).toEqual([]);
  });

  test('only non-new cards due now are reviews, most overdue first', () => {
    const q = buildDailyQueue(
      [cand('late', 'a', 0, { due: NOW - 3 * DAY }), cand('future', 'a', 0, { due: NOW + HOUR }), cand('recent', 'a', 0, { due: NOW - HOUR })],
      NOW,
      0,
    );
    expect(q).toEqual(['late', 'recent']);
  });

  test('reviews are interleaved across themes in theme order', () => {
    const q = buildDailyQueue(
      [
        cand('B1', 'b', 1, { due: NOW - 5 * DAY }),
        cand('A1', 'a', 0, { due: NOW - 3 * DAY }),
        cand('A2', 'a', 0, { due: NOW - 2 * DAY }),
        cand('B2', 'b', 1, { due: NOW - 1 * DAY }),
        cand('A3', 'a', 0, { due: NOW - HOUR }),
      ],
      NOW,
      0,
    );
    expect(q).toEqual(['A1', 'B1', 'A2', 'B2', 'A3']);
  });

  test('new cards come after reviews, by theme order then creation, up to the limit', () => {
    const q = buildDailyQueue(
      [fresh('n-b', 1, 1), fresh('n-a2', 0, 2), fresh('n-a1', 0, 1), cand('r', 'a', 0)],
      NOW,
      2,
    );
    expect(q).toEqual(['r', 'n-a1', 'n-a2']);
  });

  test('a non-positive new limit adds no new card', () => {
    expect(buildDailyQueue([fresh('n', 0)], NOW, 0)).toEqual([]);
    expect(buildDailyQueue([fresh('n', 0)], NOW, -2)).toEqual([]);
  });
});

describe('nextDue', () => {
  test('is null without scheduled cards', () => {
    expect(nextDue([], NOW)).toBeNull();
    expect(nextDue([fresh('n', 0)], NOW)).toBeNull();
  });

  test('is the closest future due date', () => {
    expect(nextDue([cand('a', 'a', 0, { due: NOW + 2 * DAY }), cand('b', 'a', 0, { due: NOW + DAY })], NOW)).toBe(NOW + DAY);
  });
});

describe('countNewIntroduced', () => {
  const dayStart = studyDayStart(NOW);

  test('ignores cards first seen before today', () => {
    expect(countNewIntroduced([entry('c', dayStart - DAY), entry('c', dayStart + HOUR)], dayStart)).toBe(0);
  });

  test('counts each card first seen today once', () => {
    expect(countNewIntroduced([entry('c', dayStart + HOUR), entry('c', dayStart + 2 * HOUR), entry('d', dayStart + HOUR)], dayStart)).toBe(2);
  });
});

describe('studyDayStart', () => {
  test('before 4 am belongs to the previous day', () => {
    expect(studyDayStart(new Date(2026, 9, 28, 3, 0).getTime())).toBe(new Date(2026, 9, 27, 4, 0).getTime());
  });

  test('after 4 am starts at 4 am the same day', () => {
    expect(studyDayStart(new Date(2026, 9, 28, 10, 0).getTime())).toBe(new Date(2026, 9, 28, 4, 0).getTime());
  });
});

describe('buildCustomQueue', () => {
  const r = (c: QueueCandidate) => (c.cardId.startsWith('weak') ? 0.4 : c.cardId.startsWith('mid') ? 0.7 : 0.95);
  const pool = [
    cand('d1', 'a', 0, { due: NOW - 2 * DAY }),
    cand('d2', 'b', 1, { due: NOW - DAY }),
    cand('strong', 'a', 0, { due: NOW + 5 * DAY }),
    cand('weak', 'a', 0, { due: NOW + 2 * DAY }),
    cand('mid', 'b', 1, { due: NOW + 3 * DAY }),
    fresh('n1', 0, 1),
    { ...fresh('n2', 0, 2), themeId: 'a' },
    { ...fresh('n3', 1, 3), themeId: 'b' },
  ].map((c) => (c.cardId === 'n1' ? { ...c, themeId: 'a' } : c));

  test('due mode: only due cards of the chosen themes', () => {
    expect(buildCustomQueue(pool, NOW, { themeIds: ['a'], mode: 'due', limit: 10 }, r)).toEqual(['d1']);
    expect(buildCustomQueue(pool, NOW, { themeIds: ['a', 'b'], mode: 'due', limit: 10 }, r)).toEqual(['d1', 'd2']);
  });

  test('new mode ignores the daily limit, in creation order, up to the chosen count', () => {
    expect(buildCustomQueue(pool, NOW, { themeIds: ['a', 'b'], mode: 'new', limit: 2 }, r)).toEqual(['n1', 'n2']);
    expect(buildCustomQueue(pool, NOW, { themeIds: ['b'], mode: 'new', limit: 10 }, r)).toEqual(['n3']);
  });

  test('practice mode: seen cards not due yet, most forgotten first', () => {
    expect(buildCustomQueue(pool, NOW, { themeIds: ['a', 'b'], mode: 'practice', limit: 10 }, r)).toEqual(['weak', 'mid', 'strong']);
  });

  test('an unlimited count and an empty selection', () => {
    expect(buildCustomQueue(pool, NOW, { themeIds: ['a'], mode: 'practice', limit: Infinity }, r)).toEqual(['weak', 'strong']);
    expect(buildCustomQueue(pool, NOW, { themeIds: [], mode: 'due', limit: 10 }, r)).toEqual([]);
  });
});

describe('v1.9: mixed new cards and mixed sessions', async () => {
  const { buildDailyQueue, buildCustomQueue } = await import('../../src/core/queue');
  const { createEmptyCard, State: S } = await import('ts-fsrs');
  const NOW2 = new Date(2026, 9, 28, 10, 0).getTime();
  const fresh = (cardId: string, themeId: string, themeOrder: number, createdAt: number, mixNew: boolean, noteType: 'basic' | 'scenario' | 'classify' = 'basic') =>
    ({ cardId, themeId, themeOrder, noteCreatedAt: createdAt, state: createEmptyCard(new Date(0)), mixNew, noteType });
  const due = (cardId: string, themeId: string, themeOrder: number, dueAt: number, noteType: 'basic' | 'scenario' | 'classify' = 'basic') =>
    ({ cardId, themeId, themeOrder, noteCreatedAt: 0, state: { ...createEmptyCard(new Date(0)), state: S.Review, due: new Date(dueAt), stability: 3 }, mixNew: true, noteType });

  test('in a mixed domain, new cards alternate between its themes', () => {
    const c = [fresh('a1', 'A', 0, 1, true), fresh('a2', 'A', 0, 2, true), fresh('a3', 'A', 0, 3, true), fresh('b1', 'B', 1, 4, true), fresh('c1', 'C', 2, 5, true)];
    expect(buildDailyQueue(c, NOW2, 5)).toEqual(['a1', 'b1', 'c1', 'a2', 'a3']);
    expect(buildDailyQueue(c, NOW2, 2)).toEqual(['a1', 'b1']);
  });
  test('a chapter-by-chapter domain keeps its order, and domains keep theirs', () => {
    const c = [fresh('x2', 'X', 10_000, 2, false), fresh('x1', 'X', 10_000, 1, false), fresh('y1', 'Y', 10_001, 3, false), fresh('a1', 'A', 0, 9, true), fresh('b1', 'B', 1, 9, true)];
    expect(buildDailyQueue(c, NOW2, 10)).toEqual(['a1', 'b1', 'x1', 'x2', 'y1']);
  });
  test('mix: due, new and fragile cards in turn, within the limit', () => {
    const c = [due('d1', 'A', 0, NOW2 - 1000), due('d2', 'B', 1, NOW2 - 500), fresh('n1', 'A', 0, 1, true), due('w1', 'A', 0, NOW2 + 10 * 86_400_000)];
    const r = () => 0.5;
    expect(buildCustomQueue(c, NOW2, { themeIds: ['A', 'B'], mode: 'mix', limit: Infinity }, r)).toEqual(['d1', 'n1', 'w1', 'd2']);
    expect(buildCustomQueue(c, NOW2, { themeIds: ['A', 'B'], mode: 'mix', limit: 2 }, r)).toEqual(['d1', 'n1']);
  });
  test('situations: scenarios and classifications only, due first, then fragile, then new', () => {
    const c = [due('s-due', 'A', 0, NOW2 - 1000, 'scenario'), due('b-due', 'A', 0, NOW2 - 1000, 'basic'), fresh('k-new', 'B', 1, 1, true, 'classify'), due('s-weak', 'B', 1, NOW2 + 86_400_000, 'scenario'), due('s-solid', 'A', 0, NOW2 + 86_400_000, 'scenario')];
    const r = (x: { cardId: string }) => (x.cardId === 's-weak' ? 0.3 : 0.9);
    expect(buildCustomQueue(c, NOW2, { themeIds: ['A', 'B'], mode: 'situations', limit: Infinity }, r)).toEqual(['s-due', 's-weak', 's-solid', 'k-new']);
  });
});
