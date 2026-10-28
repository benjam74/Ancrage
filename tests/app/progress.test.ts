import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { createServices, seedIfEmpty, type Services } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';
import { studyDayStart } from '../../src/core/queue';
import { nextStudyDay } from '../../src/core/progress';

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
    expect(round).toEqual({ xp: 45, streak: 1, firstGoalToday: true });
    const p = await services.progress(NOW + 2000);
    expect(p).toMatchObject({ streak: 1, todayDone: true, xpToday: 45, xpWeek: 45 });
  });

  test('a second round the same day does not add to the streak', async () => {
    await seedIfEmpty(services.repo, NOW);
    await playNew(NOW);
    await services.completeRound(NOW - 1000, NOW + 1000);
    const second = await services.completeRound(NOW + 2000, NOW + 3000);
    expect(second).toEqual({ xp: 20, streak: 1, firstGoalToday: false });
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
