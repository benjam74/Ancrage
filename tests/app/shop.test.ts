import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { createServices, seedIfEmpty, type Services } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';

const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const ok = { kind: 'auto', correct: true, durationMs: 2000, hintUsed: false } as const;
let services: Services;

beforeEach(async () => {
  services = createServices(createDexieRepo(`shop-${newId()}`), 'device-test');
  await seedIfEmpty(services.repo, NOW);
});

async function earn45() {
  const { queue } = await services.today(NOW);
  for (const id of queue) await services.engine.answer(id, 'recognition', ok, NOW);
  await services.completeRound(NOW - 1000, NOW + 1000);
}

describe('shop services', () => {
  test('a new learner has nothing and wears the pyjama', async () => {
    const s = await services.shop(NOW);
    expect(s).toMatchObject({ earned: 0, balance: 0, outfit: {}, avatar: { character: 'renard', name: 'Renard' }, chosen: false });
    expect((await services.buy('bonnet', NOW)).ok).toBe(false);
  });

  test('buy with earned XP, then it is worn; XP figures elsewhere do not change', async () => {
    await earn45();
    await services.completeRound(NOW + 1500, NOW + 1600);
    expect((await services.shop(NOW + 2000)).balance).toBe(65);
    const before = await services.progress(NOW + 2000);
    expect(await services.buy('bonnet', NOW + 3000)).toEqual({ ok: true });
    const s = await services.shop(NOW + 4000);
    expect(s.balance).toBe(5);
    expect(s.owned.has('bonnet') && s.outfit.chapeau === 'bonnet').toBe(true);
    const after = await services.progress(NOW + 4000);
    expect([after.xpToday, after.xpWeek, after.streak]).toEqual([before.xpToday, before.xpWeek, before.streak]);
  });

  test('refused when too expensive or already owned; sell gives half back', async () => {
    await earn45();
    expect(await services.buy('jean', NOW + 3000)).toEqual({ ok: false, error: 'Il te manque 35 XP.' });
    expect((await services.buy('tasse', NOW + 3000)).ok).toBe(false);
  });

  test('sell returns floor(price / 2) and removes the item', async () => {
    for (let i = 0; i < 3; i++) await services.completeRound(NOW + i, NOW + i + 1);
    expect((await services.shop(NOW)).balance).toBe(60);
    await services.buy('bonnet', NOW + 10);
    expect(await services.buy('bonnet', NOW + 11)).toEqual({ ok: false, error: 'Tu as déjà cet objet.' });
    expect(await services.sell('bonnet', NOW + 12)).toEqual({ ok: true, refund: 30 });
    const s = await services.shop(NOW + 13);
    expect(s.balance).toBe(30);
    expect(s.owned.has('bonnet')).toBe(false);
    expect(s.outfit.chapeau).toBeUndefined();
    expect((await services.sell('bonnet', NOW + 14)).ok).toBe(false);
  });

  test('character and name: trimmed, capped at 20, default name when empty', async () => {
    await services.setAvatar('lapin', '  Pompon le très grand lapin  ', NOW);
    expect((await services.shop(NOW)).avatar).toEqual({ character: 'lapin', name: 'Pompon le très grand' });
    await services.setAvatar('loutre', '   ', NOW + 1);
    expect((await services.shop(NOW + 1))).toMatchObject({ avatar: { character: 'loutre', name: 'Loutre' }, chosen: true });
  });

  test('a backup keeps the purchases', async () => {
    for (let i = 0; i < 3; i++) await services.completeRound(NOW + i, NOW + i + 1);
    await services.buy('bonnet', NOW + 10);
    const { text } = await services.exportBackup(NOW + 20);
    const other = createServices(createDexieRepo(`shop-${newId()}`), 'device-2');
    const { parseBackup } = await import('../../src/core/backup');
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    await other.importBackup(parsed.dump);
    expect((await other.shop(NOW + 30)).outfit.chapeau).toBe('bonnet');
  });
});
