import { validRecord, type Dump } from './backup';
import { canonical } from './canonical';
import { DEFAULT_SETTINGS } from './model';
import { validateSettings } from './settings';

/**
 * The database as independent items, for syncing only what changed. Each item is one record
 * (theme, note, card, review, event, tombstone, flag) or the settings.
 */
export type ItemKind = 'theme' | 'note' | 'card' | 'review' | 'event' | 'tombstone' | 'flag' | 'settings';
export interface Item {
  kind: ItemKind;
  id: string;
  data: unknown;
}

const KINDS: ItemKind[] = ['theme', 'note', 'card', 'review', 'event', 'tombstone', 'flag', 'settings'];
export const itemKey = (i: { kind: string; id: string }) => `${i.kind}:${i.id}`;

export function dumpToItems(d: Dump): Item[] {
  return [
    ...d.themes.map((data) => ({ kind: 'theme' as const, id: data.id, data })),
    ...d.notes.map((data) => ({ kind: 'note' as const, id: data.id, data })),
    ...d.cards.map((data) => ({ kind: 'card' as const, id: data.id, data })),
    ...d.reviews.map((data) => ({ kind: 'review' as const, id: data.id, data })),
    ...d.events.map((data) => ({ kind: 'event' as const, id: data.id, data })),
    ...d.tombstones.map((data) => ({ kind: 'tombstone' as const, id: `${data.kind}:${data.id}`, data })),
    ...d.flags.map((f) => ({ kind: 'flag' as const, id: f, data: true })),
    { kind: 'settings' as const, id: 'settings', data: { settings: d.settings, settingsUpdatedAt: d.settingsUpdatedAt } },
  ];
}

/**
 * Items back into a partial dump, to merge into local data (merging only adds or updates).
 * Without settings the partial dump's settings lose every merge (time −1).
 */
export function itemsToDump(items: Item[]): Dump {
  const d: Dump = { themes: [], notes: [], cards: [], reviews: [], events: [], tombstones: [], flags: [], settings: { ...DEFAULT_SETTINGS }, settingsUpdatedAt: -1 };
  for (const i of items) {
    switch (i.kind) {
      case 'theme': d.themes.push(i.data as Dump['themes'][number]); break;
      case 'note': d.notes.push(i.data as Dump['notes'][number]); break;
      case 'card': d.cards.push(i.data as Dump['cards'][number]); break;
      case 'review': d.reviews.push(i.data as Dump['reviews'][number]); break;
      case 'event': d.events.push(i.data as Dump['events'][number]); break;
      case 'tombstone': d.tombstones.push(i.data as Dump['tombstones'][number]); break;
      case 'flag': d.flags.push(i.id); break;
      case 'settings': {
        const s = i.data as { settings: Dump['settings']; settingsUpdatedAt: number };
        d.settings = s.settings;
        d.settingsUpdatedAt = s.settingsUpdatedAt;
        break;
      }
    }
  }
  return d;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether an item from the server is safe to merge; `null` for a kind from a later version (ignored). */
export function checkItem(i: { kind: string; id: string; data: unknown }): boolean | null {
  if (!KINDS.includes(i.kind as ItemKind)) return null;
  const d = i.data;
  switch (i.kind as ItemKind) {
    case 'theme': return validRecord('themes', d) && (d as { id: string }).id === i.id;
    case 'note': return validRecord('notes', d) && (d as { id: string }).id === i.id;
    case 'card': return validRecord('cards', d) && (d as { id: string }).id === i.id;
    case 'review': return validRecord('reviews', d) && (d as { id: string }).id === i.id;
    case 'event': return validRecord('events', d) && (d as { id: string }).id === i.id;
    case 'tombstone':
      return isObj(d) && typeof d.id === 'string' && (d.kind === 'note' || d.kind === 'theme') && typeof d.ts === 'number' && Number.isFinite(d.ts) && i.id === `${d.kind}:${d.id}`;
    case 'flag': return d === true;
    case 'settings': {
      if (!isObj(d) || !isObj(d.settings) || typeof d.settingsUpdatedAt !== 'number') return false;
      return validateSettings({ desiredRetention: d.settings.desiredRetention as number, newPerDay: d.settings.newPerDay as number }).ok;
    }
  }
}

/** A short fingerprint of an item's content (FNV-1a over its canonical JSON). */
export function itemHash(data: unknown): string {
  const s = canonical(data);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}.${s.length.toString(36)}`;
}

/** Items whose content differs from what the server is known to hold. */
export function changedItems(items: Item[], known: Record<string, string>): Item[] {
  return items.filter((i) => known[itemKey(i)] !== itemHash(i.data));
}
