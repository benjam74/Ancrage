import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { createServices, seedIfEmpty, type Services } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';
import { studyDayStart } from '../../src/core/queue';
import { dailyRing, nextStudyDay } from '../../src/core/progress';

const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const DAY = 86_400_000;
const ok = { kind: 'auto', correct: true, durationMs: 2000, hintUsed: false } as const;

let services: Services;
beforeEach(() => {
  services = createServices(createDexieRepo(`progress-${newId()}`), 'device-test');
});

async function playNew(now: number) {
  const { queue } = await services.today(now);
  for (const id of queue) await services.engine.answer(id, 'recognition', ok, now);
  return queue;
}

describe('progress', () => {
  test('an empty database gives readable zeros', async () => {
    const p = await services.progress(NOW);
    expect(p).toMatchObject({ streak: 0, freezes: 0, todayDone: false, xpToday: 0, xpWeek: 0, themes: [], retention: null });
    expect(p.heatmap).toHaveLength(140);
    expect(p.heatmap.every((n) => n === 0)).toBe(true);
    expect(p.forecast).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test('seeded themes without reviews are Nouveau', async () => {
    await seedIfEmpty(services.repo, NOW);
    const p = await services.progress(NOW);
    expect(p.themes.length).toBe(5);
    expect(p.themes.every((t) => t.level === 'Nouveau' && t.cards > 0)).toBe(true);
  });

  test('a first round of 5 new cards earns 45 XP and starts the streak', async () => {
    await seedIfEmpty(services.repo, NOW);
    await playNew(NOW);
    const round = await services.completeRound(NOW - 1000, NOW + 1000);
    expect(round).toMatchObject({ xp: 45, streak: 1, firstGoalToday: true, comeback: false, repaired: false, milestone: null });
    const p = await services.progress(NOW + 2000);
    expect(p).toMatchObject({ streak: 1, todayDone: true, xpToday: 45, xpWeek: 45 });
  });

  test('a second round the same day does not add to the streak', async () => {
    await seedIfEmpty(services.repo, NOW);
    await playNew(NOW);
    await services.completeRound(NOW - 1000, NOW + 1000);
    const second = await services.completeRound(NOW + 2000, NOW + 3000);
    expect(second).toMatchObject({ xp: 20, streak: 1, firstGoalToday: false });
  });

  test('rounds on consecutive days grow the streak', async () => {
    await seedIfEmpty(services.repo, NOW);
    await services.completeRound(NOW - DAY, NOW - DAY + 1);
    expect((await services.completeRound(NOW, NOW + 1)).streak).toBe(2);
  });

  test('a day with nothing to review does not break the streak', async () => {
    const t = await services.createTheme('T');
    const start = NOW - 20 * DAY;
    await services.saveNote({ themeId: t.id, fields: { type: 'basic', front: 'Q', back: 'R', reverse: false }, tags: [] }, start);
    const [card] = (await services.today(start)).queue;
    // Good twice: the card graduates and is not due again for some days.
    await services.engine.answer(card, 'self', { kind: 'self', grade: 3 }, start);
    await services.engine.answer(card, 'self', { kind: 'self', grade: 3 }, start + 11 * 60_000);
    await services.completeRound(start - 1, start + 12 * 60_000);
    const due = (await services.engine.cardState(card)).due.getTime();
    const goalDay = studyDayStart(start);
    const checkAt = due - 1;
    // At least one whole study day without anything to review lies between the goal day and checkAt.
    expect(studyDayStart(checkAt)).toBeGreaterThanOrEqual(nextStudyDay(nextStudyDay(goalDay)));
    expect((await services.progress(checkAt)).streak).toBe(1);
  });

  test('weekly XP ignores answers dated in the future', async () => {
    await seedIfEmpty(services.repo, NOW);
    const [a] = (await services.today(NOW)).queue;
    await services.engine.answer(a, 'recognition', ok, NOW + 30 * DAY);
    expect((await services.progress(NOW)).xpWeek).toBe(0);
  });

  test('forecast comes with the start of each study day it covers', async () => {
    const p = await services.progress(new Date(2026, 9, 28, 2, 0).getTime());
    expect(p.forecastDays).toHaveLength(7);
    expect(new Date(p.forecastDays[0]).getDate()).toBe(27);
    expect(new Date(p.forecastDays[1]).getDate()).toBe(28);
  });

  test('correcting an answer does not change XP', async () => {
    await seedIfEmpty(services.repo, NOW);
    const [first] = await services.today(NOW).then((t) => t.queue);
    const { entry } = await services.engine.answer(first, 'recognition', ok, NOW);
    const before = (await services.progress(NOW + 1)).xpToday;
    await services.engine.correctLast(entry.id, false, NOW + 1);
    expect((await services.progress(NOW + 2)).xpToday).toBe(before);
  });
});

describe('engagement', () => {
  test('after a round: rounds and answers today, the week strip shows today done', async () => {
    await seedIfEmpty(services.repo, NOW);
    const queue = await playNew(NOW);
    await services.completeRound(NOW - 1000, NOW + 1000);
    const p = await services.progress(NOW + 2000);
    expect(p.roundsToday).toBe(1);
    expect(p.answersToday).toBe(queue.length);
    expect(p.week).toHaveLength(7);
    expect(p.week.find((d) => d.dayStart === studyDayStart(NOW))?.status).toBe('done');
    expect(p.best).toBe(1);
    expect(p.xpPrevAvg).toBeNull();
    expect(p.themes.every((t) => t.next !== null)).toBe(true);
  });

  test('coming back after 4 days earns the comeback bonus once', async () => {
    await seedIfEmpty(services.repo, NOW - 4 * DAY);
    await services.completeRound(NOW - 4 * DAY, NOW - 4 * DAY + 1);
    const before = await services.progress(NOW);
    expect(before.comebackReady).toBe(true);
    expect(before.streak).toBe(0);
    const round = await services.completeRound(NOW, NOW + 1);
    expect(round).toMatchObject({ comeback: true, xp: 40 });
    expect((await services.completeRound(NOW + 2, NOW + 3)).comeback).toBe(false);
    const after = await services.progress(NOW + 4);
    expect(after.comebackReady).toBe(false);
    expect(after.xpToday).toBe(40 + 20);
  });

  test('two rounds the day after a missed day repair the streak', async () => {
    await seedIfEmpty(services.repo, NOW - 4 * DAY);
    // Three days in a row, then yesterday missed.
    for (const d of [4, 3, 2]) await services.completeRound(NOW - d * DAY, NOW - d * DAY + 1);
    const offer = await services.progress(NOW);
    expect(offer.repair).toEqual({ lost: 3, rounds: 0 });
    const first = await services.completeRound(NOW, NOW + 1);
    expect(first).toMatchObject({ streak: 1, repaired: false });
    expect((await services.progress(NOW + 2)).repair).toEqual({ lost: 3, rounds: 1 });
    const second = await services.completeRound(NOW + 3, NOW + 4);
    expect(second).toMatchObject({ streak: 4, repaired: true });
    const p = await services.progress(NOW + 5);
    expect(p.repair).toBeNull();
    expect(p.week.find((d) => d.dayStart === studyDayStart(NOW - DAY))?.status).toBe('repaired');
  });

  test('the 7th day is a milestone', async () => {
    await seedIfEmpty(services.repo, NOW - 7 * DAY);
    for (let d = 6; d >= 1; d--) await services.completeRound(NOW - d * DAY, NOW - d * DAY + 1);
    expect((await services.completeRound(NOW, NOW + 1)).milestone).toBe(7);
    expect((await services.completeRound(NOW + 2, NOW + 3)).milestone).toBeNull();
  });

  test('last week compared with the weeks before', async () => {
    await seedIfEmpty(services.repo, NOW - 14 * DAY);
    await services.completeRound(NOW - 14 * DAY, NOW - 14 * DAY + 1);
    await services.completeRound(NOW - 7 * DAY, NOW - 7 * DAY + 1);
    await services.completeRound(NOW - 7 * DAY + 2, NOW - 7 * DAY + 3);
    const p = await services.progress(NOW);
    // Two previous weeks since the first round: 20 XP and 40 XP (comeback bonus only when 3+ days apart: 7 days → +20).
    expect(p.xpPrevBest).toBe(60);
    expect(p.xpPrevAvg).toBe(40);
  });

  test('a lapsed learner back on a Monday or the 1st gets a fresh start, never while a streak runs', async () => {
    const mon = new Date(2026, 10, 2, 10).getTime();
    const first = new Date(2026, 10, 1, 10).getTime();
    await seedIfEmpty(services.repo, mon - 10 * DAY);
    await services.completeRound(mon - 10 * DAY, mon - 10 * DAY + 1);
    expect((await services.progress(mon)).freshStart).toBe('week');
    expect((await services.progress(first)).freshStart).toBe('month');
    expect((await services.progress(mon + DAY)).freshStart).toBeNull();
    await services.completeRound(mon, mon + 1);
    expect((await services.progress(mon + 2)).freshStart).toBeNull();
  });

  test('daily ring target never exceeds what is left to do', () => {
    expect(dailyRing(3, 0, 3)).toEqual({ done: 3, target: 3 });
    expect(dailyRing(0, 0, 1)).toEqual({ done: 0, target: 1 });
    expect(dailyRing(4, 40, 2)).toEqual({ done: 4, target: 20 });
    expect(dailyRing(25, 5, 2)).toEqual({ done: 20, target: 20 });
  });
});

describe('custom sessions', () => {
  test('new cards beyond the daily limit, for the chosen themes only', async () => {
    await seedIfEmpty(services.repo, NOW);
    await playNew(NOW);
    expect((await services.today(NOW + 1)).fresh).toBe(0);
    const themes = (await services.progress(NOW + 1)).themes;
    const target = themes.find((t) => t.fresh > 0)!;
    const queue = await services.custom(NOW + 1, { themeIds: [target.theme.id], mode: 'new', limit: 3 });
    expect(queue.length).toBe(Math.min(3, target.fresh));
    for (const id of queue) expect((await services.context(id)).theme.id).toBe(target.theme.id);
  });

  test('practice offers cards already seen even when nothing is due', async () => {
    await seedIfEmpty(services.repo, NOW);
    const seen = await playNew(NOW);
    const all = (await services.progress(NOW + 1)).themes.map((t) => t.theme.id);
    expect(await services.custom(NOW + 1, { themeIds: all, mode: 'due', limit: Infinity })).toEqual([]);
    const practice = await services.custom(NOW + 1, { themeIds: all, mode: 'practice', limit: Infinity });
    expect(new Set(practice)).toEqual(new Set(seen));
  });
});

describe('memory and effectiveness', () => {
  test('a theme shows its memory once studied; insights count due reviews', async () => {
    const t = await services.createTheme('Recadrage');
    await services.saveNote({ themeId: t.id, fields: { type: 'basic', front: 'Q', back: 'R', reverse: false }, tags: [] }, NOW - 20 * DAY);
    let p = await services.progress(NOW);
    expect(p.themes[0].memory).toBeNull();
    expect(p.loadPerNew).toBeGreaterThanOrEqual(1);
    expect(p.hard).toBe(0);
    const [id] = (await services.today(NOW - 20 * DAY)).queue;
    await services.engine.answer(id, 'recognition', ok, NOW - 20 * DAY);
    await services.engine.answer(id, 'production', ok, NOW - 10 * DAY);
    p = await services.progress(NOW);
    expect(p.themes[0].memory!.now).toBeGreaterThan(p.themes[0].memory!.in30);
    expect(p.insights.windows[0]).toMatchObject({ days: 30, activeDays: 2 });
    expect(p.insights.byType.map((r) => r.key)).toEqual(p.insights.windows[0].count ? ['basic'] : []);
  });
});

describe('rounds of cards not due yet', () => {
  test('only a round with a due or new answer earns round XP and the streak', async () => {
    const t = await services.createTheme('T');
    await services.saveNote({ themeId: t.id, fields: { type: 'basic', front: 'Q', back: 'R', reverse: false }, tags: [] }, NOW - 3 * DAY);
    const [id] = (await services.today(NOW - 3 * DAY)).queue;
    await services.engine.answer(id, 'self', { kind: 'self', grade: 3 }, NOW - 3 * DAY);
    expect(await services.earnsRound(NOW - 3 * DAY - 1, NOW - 3 * DAY + 1)).toBe(true);
    // Answered again five minutes later: not due, so practice.
    await services.engine.answer(id, 'self', { kind: 'self', grade: 3 }, NOW - 3 * DAY + 300_000);
    expect(await services.earnsRound(NOW - 3 * DAY + 300_000 - 1, NOW - 3 * DAY + 300_000 + 1)).toBe(false);
    expect(await services.earnsRound(NOW, NOW + 1)).toBe(false);
  });
});
