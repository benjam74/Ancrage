import type { AppEvent, CharacterId, Slot } from './model';
import type { Tier } from '../data/items';

export const SLOTS: Slot[] = ['haut', 'bas', 'chapeau', 'lunettes', 'cou', 'objet', 'compagnon', 'decor'];
export const CHARACTERS: CharacterId[] = ['renard', 'loutre', 'ourson', 'lapin'];
export const TIER_BANDS: Record<Tier, [number, number]> = { commun: [60, 150], rare: [300, 600], epique: [1000, 1800], legendaire: [3000, 6000] };
export const NAME_MAX = 20;
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

/** XP left to spend; may be negative when two devices spent offline at the same time. */
export function wallet(earned: number, events: AppEvent[]): number {
  let balance = earned;
  for (const e of events) {
    if (e.type === 'purchase') balance -= e.price;
    else if (e.type === 'sale') balance += e.refund;
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
  for (const slot of SLOTS) if (worn[slot] && !has.has(worn[slot]!)) delete worn[slot];
  return worn;
}

export function avatarOf(events: AppEvent[]): { character: CharacterId; name: string } {
  const last = events.filter((e) => e.type === 'avatar').sort(byTime).pop();
  return last && last.type === 'avatar' ? { character: last.character, name: last.name } : { ...DEFAULT_AVATAR };
}
