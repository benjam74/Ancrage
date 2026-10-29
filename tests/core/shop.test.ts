import { describe, expect, test } from 'vitest';
import type { AppEvent } from '../../src/core/model';
import { DEFAULT_AVATAR, SLOTS, TIER_BANDS, avatarOf, owned, outfit, resale, wallet } from '../../src/core/shop';
import { CATALOG } from '../../src/data/items';

let seq = 0;
const id = () => `e${String(seq++).padStart(4, '0')}`;
const buy = (itemId: string, price: number, ts: number): AppEvent => ({ id: id(), type: 'purchase', ts, itemId, price });
const sell = (itemId: string, refund: number, ts: number): AppEvent => ({ id: id(), type: 'sale', ts, itemId, refund });
const wear = (slot: 'chapeau' | 'haut', itemId: string | null, ts: number): AppEvent => ({ id: id(), type: 'equip', ts, slot, itemId });

describe('catalogue', () => {
  test('50 items, 8 slots with the planned counts, unique ids', () => {
    expect(CATALOG).toHaveLength(50);
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(50);
    const count = (slot: string) => CATALOG.filter((i) => i.slot === slot).length;
    expect(Object.fromEntries(SLOTS.map((s) => [s, count(s)]))).toEqual({ haut: 8, bas: 6, chapeau: 9, lunettes: 5, cou: 6, objet: 7, compagnon: 4, decor: 5 });
  });

  test('tiers: 16 / 16 / 12 / 6, prices within their band', () => {
    const tiers = CATALOG.reduce<Record<string, number>>((m, i) => ({ ...m, [i.tier]: (m[i.tier] ?? 0) + 1 }), {});
    expect(tiers).toEqual({ commun: 16, rare: 16, epique: 12, legendaire: 6 });
    for (const i of CATALOG) {
      const [lo, hi] = TIER_BANDS[i.tier];
      expect(i.price, i.id).toBeGreaterThanOrEqual(lo);
      expect(i.price, i.id).toBeLessThanOrEqual(hi);
    }
  });
});

describe('inventory and wallet', () => {
  test('buying, selling and buying again', () => {
    const events = [buy('bonnet', 60, 1), sell('bonnet', 30, 2)];
    expect(owned(events).has('bonnet')).toBe(false);
    expect(owned([...events, buy('bonnet', 60, 3)]).has('bonnet')).toBe(true);
  });

  test('balance = earned − purchases + sales, and can go negative after a merge', () => {
    expect(wallet(200, [buy('bonnet', 60, 1), sell('bonnet', 30, 2)])).toBe(170);
    expect(wallet(100, [buy('jean', 80, 1), buy('casquette', 90, 1)])).toBe(-70);
    expect(resale(75)).toBe(37);
  });

  test('round events do not touch the wallet', () => {
    expect(wallet(50, [{ id: 'r', type: 'round_completed', ts: 1 }])).toBe(50);
  });
});

describe('outfit', () => {
  test('the latest equip per slot wins, by time', () => {
    const events = [buy('bonnet', 60, 1), buy('beret', 300, 2), wear('chapeau', 'beret', 5), wear('chapeau', 'bonnet', 4)];
    expect(outfit(events).chapeau).toBe('beret');
    expect(outfit([...events, wear('chapeau', null, 6)]).chapeau).toBeUndefined();
  });

  test('an item sold or never owned is not worn', () => {
    expect(outfit([buy('bonnet', 60, 1), wear('chapeau', 'bonnet', 2), sell('bonnet', 30, 3)]).chapeau).toBeUndefined();
    expect(outfit([wear('haut', 'veste-coach', 1)]).haut).toBeUndefined();
  });
});

describe('avatar', () => {
  test('default, then the latest choice', () => {
    expect(avatarOf([])).toEqual(DEFAULT_AVATAR);
    expect(DEFAULT_AVATAR).toEqual({ character: 'renard', name: 'Renard' });
    const events: AppEvent[] = [
      { id: 'a2', type: 'avatar', ts: 5, character: 'lapin', name: 'Pompon' },
      { id: 'a1', type: 'avatar', ts: 3, character: 'loutre', name: 'Lou' },
    ];
    expect(avatarOf(events)).toEqual({ character: 'lapin', name: 'Pompon' });
  });
});

describe('art', () => {
  test('every catalogue item has a drawing for its slot, and nothing else is drawn', async () => {
    const { ART } = await import('../../src/data/art');
    expect(Object.keys(ART).sort()).toEqual(CATALOG.map((i) => i.id).sort());
    for (const i of CATALOG) expect(ART[i.id].slot, i.id).toBe(i.slot);
  });
});
