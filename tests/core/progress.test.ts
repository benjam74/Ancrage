import { describe, expect, test } from 'vitest';
import { XP, classifyEntries, comebackRounds, goalDays, nextStudyDay, roundsPerDay, streakState, weekStart, weekStrip, xpBetween } from '../../src/core/progress';
import { studyDayStart } from '../../src/core/queue';
import { makeScheduler } from '../../src/core/scheduler';
import { DEFAULT_SETTINGS, type Rating, type ReviewEntry } from '../../src/core/model';

const s = makeScheduler(DEFAULT_SETTINGS);
const MIN = 60_000;
const DAY = 86_400_000;
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0).getTime();
const T0 = at(2026, 10, 1);

let seq = 0;
const entry = (cardId: string, ts: number, rating: Rating = 3): ReviewEntry => ({
  id: `e${String(seq++).padStart(4, '0')}`, cardId, ts, rating, mode: 'production', correct: rating > 1, durationMs: 2000, hintUsed: false, deviceId: 'd',
});
const day = (y: number, m: number, d: number) => studyDayStart(at(y, m, d));

describe('timezone', () => {
  test('tests run in Europe/Paris', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Paris');
  });
});

describe('classifyEntries', () => {
  test('first answer is new, an answer at due time is due, before due time is early', () => {
    const first = entry('c', T0);
    const afterFirst = s.apply(s.initial(T0), 3, T0);
    const onTime = entry('c', afterFirst.due.getTime() + MIN);
    const afterSecond = s.apply(afterFirst, 3, onTime.ts);
    const early = entry('c', afterSecond.due.getTime() - DAY);
    const kinds = classifyEntries([{ cardId: 'c', createdAt: T0 }], [early, first, onTime], s);
    expect(kinds.get(first.id)).toBe('new');
    expect(kinds.get(onTime.id)).toBe('due');
    expect(kinds.get(early.id)).toBe('early');
  });

  test('a missed card answered again 15 minutes later is due', () => {
    const miss = entry('c', T0, 1);
    const again = entry('c', T0 + 15 * MIN);
    expect(classifyEntries([{ cardId: 'c', createdAt: T0 }], [miss, again], s).get(again.id)).toBe('due');
  });
});

describe('xpBetween', () => {
  test('sums 10 per due, 5 per new, 0 early, 20 per round, within [from, to)', () => {
    const entries = [entry('a', T0), entry('b', T0 + 1), entry('c', T0 + 2), entry('d', T0 + 3), entry('e', T0 + DAY)];
    const kinds = new Map([[entries[0].id, 'due'], [entries[1].id, 'due'], [entries[2].id, 'new'], [entries[3].id, 'early'], [entries[4].id, 'due']] as const);
    expect(XP).toEqual({ due: 10, new: 5, early: 0, round: 20, comeback: 20 });
    expect(xpBetween(entries, new Map(kinds), [T0 + 10, T0 + 20, T0 + DAY + 5], T0, T0 + DAY)).toBe(65);
  });
});

describe('goalDays', () => {
  test('two rounds on the same day make one goal day', () => {
    expect(goalDays([at(2026, 10, 28, 9), at(2026, 10, 28, 21)])).toEqual([day(2026, 10, 28)]);
  });

  test('a round at 3 am counts for the previous day', () => {
    expect(goalDays([at(2026, 10, 29, 3)])).toEqual([day(2026, 10, 28)]);
  });
});

describe('streakState', () => {
  const days = (from: number, count: number) => Array.from({ length: count }, (_, i) => day(2026, 10, from + i));

  test('3 days up to today', () => {
    expect(streakState(days(20, 3), day(2026, 10, 22))).toMatchObject({ current: 3, freezes: 0, todayDone: true });
  });

  test('3 days up to yesterday keeps the streak alive', () => {
    expect(streakState(days(20, 3), day(2026, 10, 23))).toMatchObject({ current: 3, freezes: 0, todayDone: false });
  });

  test('a missed day without freeze restarts the streak', () => {
    expect(streakState([...days(10, 3), ...days(14, 2)], day(2026, 10, 15)).current).toBe(2);
  });

  test('7 days earn a freeze, 14 two, never more than 2', () => {
    expect(streakState(days(1, 7), day(2026, 10, 7)).freezes).toBe(1);
    expect(streakState(days(1, 14), day(2026, 10, 14)).freezes).toBe(2);
    expect(streakState(days(1, 21), day(2026, 10, 21)).freezes).toBe(2);
  });

  test('a freeze covers one missed day', () => {
    expect(streakState([...days(1, 7), ...days(9, 3)], day(2026, 10, 11))).toMatchObject({ current: 10, freezes: 0, todayDone: true });
  });

  test('two missed days with one freeze break the streak', () => {
    expect(streakState([...days(1, 7), ...days(10, 2)], day(2026, 10, 11)).current).toBe(2);
  });

  test('missing yesterday and today without freeze shows 0', () => {
    expect(streakState(days(1, 3), day(2026, 10, 5)).current).toBe(0);
  });

  test('the DST change does not create or skip a day', () => {
    expect(streakState(days(24, 4), day(2026, 10, 27))).toMatchObject({ current: 4, freezes: 0, todayDone: true });
    expect(nextStudyDay(day(2026, 10, 24))).toBe(day(2026, 10, 25));
    expect(nextStudyDay(day(2026, 10, 25))).toBe(day(2026, 10, 26));
  });

  test('a rest day (nothing to review) neither grows nor breaks the streak', () => {
    const rest = new Set([day(2026, 10, 4), day(2026, 10, 5)]);
    expect(streakState([...days(1, 3), ...days(6, 2)], day(2026, 10, 7), (d) => rest.has(d))).toMatchObject({ current: 5, freezes: 0, todayDone: true });
  });

  test('no goal day at all', () => {
    expect(streakState([], day(2026, 10, 28))).toMatchObject({ current: 0, freezes: 0, todayDone: false });
  });
});

describe('weekStart', () => {
  test('is Monday 4 am local time', () => {
    expect(weekStart(at(2026, 10, 28, 10))).toBe(new Date(2026, 9, 26, 4, 0).getTime());
    expect(weekStart(new Date(2026, 9, 26, 3, 0).getTime())).toBe(new Date(2026, 9, 19, 4, 0).getTime());
  });
});

describe('streak repair', () => {
  const days = (from: number, count: number) => Array.from({ length: count }, (_, i) => day(2026, 10, from + i));
  const rounds = (counts: Record<number, number>) => (d: number) => {
    for (const [dom, n] of Object.entries(counts)) if (day(2026, 10, Number(dom)) === d) return n;
    return 1;
  };

  test('two rounds the day after a missed day repair the streak', () => {
    const r = streakState([...days(1, 5), day(2026, 10, 7)], day(2026, 10, 7), undefined, rounds({ 7: 2 }));
    expect(r.current).toBe(6);
    expect(r.history.get(day(2026, 10, 6))).toBe('repaired');
    expect(r.repair).toBeNull();
  });

  test('a single round the next day does not repair, and offers the repair while today lasts', () => {
    const r = streakState([...days(1, 5), day(2026, 10, 7)], day(2026, 10, 7), undefined, rounds({ 7: 1 }));
    expect(r.current).toBe(1);
    expect(r.history.get(day(2026, 10, 6))).toBe('missed');
    expect(r.repair).toEqual({ lost: 5, rounds: 1 });
  });

  test('the offer shows before any round today', () => {
    const r = streakState(days(1, 5), day(2026, 10, 7), undefined, () => 0);
    expect(r.current).toBe(0);
    expect(r.repair).toEqual({ lost: 5, rounds: 0 });
  });

  test('the offer ends with the day: a repair missed yesterday is gone', () => {
    const r = streakState([...days(1, 5), day(2026, 10, 7)], day(2026, 10, 8), undefined, rounds({ 7: 1 }));
    expect(r.repair).toBeNull();
    expect(r.current).toBe(1);
  });

  test('two missed days in a row cannot be repaired', () => {
    const r = streakState([...days(1, 5), day(2026, 10, 8)], day(2026, 10, 8), undefined, rounds({ 8: 2 }));
    expect(r.current).toBe(1);
    expect(r.repair).toBeNull();
  });

  test('a freeze is used before a repair', () => {
    const r = streakState([...days(1, 7), day(2026, 10, 9)], day(2026, 10, 9), undefined, rounds({ 9: 2 }));
    expect(r.history.get(day(2026, 10, 8))).toBe('freeze');
    expect(r.current).toBe(8);
  });

  test('best keeps the longest streak reached', () => {
    const r = streakState([...days(1, 4), ...days(10, 2)], day(2026, 10, 11));
    expect(r.best).toBe(4);
    expect(r.current).toBe(2);
    expect(r.history.get(day(2026, 10, 1))).toBe('done');
  });

  test('roundsPerDay counts round ends per study day, 3 am counting for the day before', () => {
    const m = roundsPerDay([at(2026, 10, 1, 9), at(2026, 10, 1, 20), at(2026, 10, 2, 3)]);
    expect(m.get(day(2026, 10, 1))).toBe(3);
  });
});

describe('comebackRounds', () => {
  test('first round of a day at least 3 study days after the previous goal day', () => {
    const first = at(2026, 10, 1);
    const twoLater = at(2026, 10, 3);
    const back = at(2026, 10, 6, 9);
    const again = at(2026, 10, 6, 18);
    expect(comebackRounds([again, first, twoLater, back])).toEqual([back]);
  });

  test('the very first round is not a comeback', () => {
    expect(comebackRounds([at(2026, 10, 1)])).toEqual([]);
  });

  test('xpBetween adds the comeback bonus', () => {
    const back = at(2026, 10, 6);
    expect(xpBetween([], new Map(), [back], at(2026, 10, 6, 5), at(2026, 10, 7, 5), [back])).toBe(XP.round + XP.comeback);
    expect(XP.comeback).toBe(20);
  });
});

describe('weekStrip', () => {
  test('Monday to Sunday of the current week', () => {
    const history = new Map([[day(2026, 10, 26), 'done' as const], [day(2026, 10, 27), 'freeze' as const]]);
    const strip = weekStrip(history, day(2026, 10, 28), false);
    expect(strip.map((d) => d.status)).toEqual(['done', 'freeze', 'today', 'future', 'future', 'future', 'future']);
    expect(strip[0].dayStart).toBe(day(2026, 10, 26));
    expect(strip[6].dayStart).toBe(day(2026, 11, 1));
  });

  test('today done, days before any history are none, across the DST change', () => {
    const strip = weekStrip(new Map([[day(2026, 10, 25), 'done' as const]]), day(2026, 10, 25), true);
    expect(strip.map((d) => d.status)).toEqual(['none', 'none', 'none', 'none', 'none', 'none', 'done']);
    expect(new Set(strip.map((d) => new Date(d.dayStart).getDate())).size).toBe(7);
  });
});
