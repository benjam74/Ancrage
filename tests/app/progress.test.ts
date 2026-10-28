import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { createServices, seedIfEmpty, type Services } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';

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

  test('correcting an answer does not change XP', async () => {
    await seedIfEmpty(services.repo, NOW);
    const [first] = await services.today(NOW).then((t) => t.queue);
    const { entry } = await services.engine.answer(first, 'recognition', ok, NOW);
    const before = (await services.progress(NOW + 1)).xpToday;
    await services.engine.correctLast(entry.id, false, NOW + 1);
    expect((await services.progress(NOW + 2)).xpToday).toBe(before);
  });
});
