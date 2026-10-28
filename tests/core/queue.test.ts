import { describe, expect, test } from 'vitest';
import { State } from 'ts-fsrs';
import { buildDailyQueue, countNewIntroduced, nextDue, studyDayStart, type QueueCandidate } from '../../src/core/queue';
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
