import type { AppEvent, CharacterId, Slot } from './model';
import { CATALOG, type Tier } from '../data/items';

export const SLOTS: Slot[] = ['haut', 'bas', 'chapeau', 'lunettes', 'cou', 'objet', 'compagnon', 'decor'];
export const CHARACTERS: CharacterId[] = ['renard', 'loutre', 'ourson', 'lapin'];
export const TIER_BANDS: Record<Tier, [number, number]> = { commun: [60, 150], rare: [300, 600], epique: [1000, 1800], legendaire: [3000, 6000] };
export const NAME_MAX = 20;
export const CHARACTER_NAMES: Record<CharacterId, string> = { renard: 'Renard', loutre: 'Loutre', ourson: 'Ourson', lapin: 'Lapin' };
export const DEFAULT_AVATAR: { character: CharacterId; name: string } = { character: 'renard', name: 'Renard' };

const byTime = (a: AppEvent, b: AppEvent) => a.ts - b.ts || a.id.localeCompare(b.id);

/** Items currently owned: the last purchase or sale of each item decides. */
export function owned(events: AppEvent[]): Set<string> {
  const state = new Map<string, boolean>();
  for (const e of [...events].sort(byTime)) {
    if (e.type === 'purchase') state.set(e.itemId, true);
    else if (e.type === 'sale') state.set(e.itemId, false);
  }
  return new Set([...state].filter(([, has]) => has).map(([id]) => id));
}

/**
 * XP left to spend: earned, plus XP kept from deleted notes, minus purchases, plus sales. A purchase of an
 * item already owned (bought offline on two devices) is not charged twice. May still be negative.
 */
export function wallet(earned: number, events: AppEvent[]): number {
  let balance = earned;
  const has = new Set<string>();
  for (const e of [...events].sort(byTime)) {
    if (e.type === 'xp_credit') balance += e.xp;
    else if (e.type === 'purchase' && !has.has(e.itemId)) {
      balance -= e.price;
      has.add(e.itemId);
    } else if (e.type === 'sale' && has.has(e.itemId)) {
      balance += e.refund;
      has.delete(e.itemId);
    }
  }
  return balance;
}

export const resale = (price: number) => Math.floor(price / 2);

/** What the character wears: the latest choice per slot, only among items still owned. */
export function outfit(events: AppEvent[]): Partial<Record<Slot, string>> {
  const has = owned(events);
  const worn: Partial<Record<Slot, string>> = {};
  for (const e of [...events].sort(byTime)) {
    if (e.type !== 'equip') continue;
    if (e.itemId === null) delete worn[e.slot];
    else worn[e.slot] = e.itemId;
  }
  // Only items still owned, and only in their own slot (a synced event could say otherwise).
  for (const slot of SLOTS) if (worn[slot] && (!has.has(worn[slot]!) || CATALOG.find((i) => i.id === worn[slot])?.slot !== slot)) delete worn[slot];
  return worn;
}

export function avatarOf(events: AppEvent[]): { character: CharacterId; name: string } {
  const last = events.filter((e) => e.type === 'avatar').sort(byTime).pop();
  return last && last.type === 'avatar' ? { character: last.character, name: last.name } : { ...DEFAULT_AVATAR };
}
