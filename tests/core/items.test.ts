import { describe, expect, test } from 'vitest';
import { changedItems, checkItem, dumpToItems, itemHash, itemKey, itemsToDump } from '../../src/core/items';
import { mergeDumps } from '../../src/core/merge';
import { DEFAULT_SETTINGS } from '../../src/core/model';
import type { Dump } from '../../src/core/backup';

const dump: Dump = {
  themes: [{ id: 't', name: 'T', order: 0 }],
  notes: [{ id: 'n', themeId: 't', fields: { type: 'cloze', text: '{{a}}' }, tags: [], createdAt: 1, updatedAt: 2 }],
  cards: [{ id: 'c', noteId: 'n', variant: 'a' }],
  reviews: [{ id: 'r', cardId: 'c', ts: 3, rating: 3, mode: 'production', correct: true, durationMs: 1000, hintUsed: false, deviceId: 'd' }],
  events: [{ id: 'e', type: 'round_completed', ts: 4 }],
  settings: { desiredRetention: 0.85, newPerDay: 7 },
  flags: ['starterSeeded'],
  tombstones: [{ id: 'old', kind: 'note', ts: 5 }],
  settingsUpdatedAt: 6,
};

describe('items', () => {
  test('a dump round-trips through items', () => {
    const items = dumpToItems(dump);
    expect(items.map(itemKey)).toEqual(['theme:t', 'note:n', 'card:c', 'review:r', 'event:e', 'tombstone:note:old', 'flag:starterSeeded', 'settings:settings']);
    expect(itemsToDump(items)).toEqual(dump);
  });
  test('a partial dump without settings never overrides local settings', () => {
    const partial = itemsToDump(dumpToItems(dump).filter((i) => i.kind === 'review'));
    const local = { ...dump, settings: { desiredRetention: 0.95, newPerDay: 3 }, settingsUpdatedAt: 0 };
    expect(mergeDumps(local, partial).settings).toEqual(local.settings);
    expect(partial.settings).toEqual(DEFAULT_SETTINGS);
  });
  test('checks each item alone; a kind from a later version is ignored', () => {
    for (const i of dumpToItems(dump)) expect(checkItem(i)).toBe(true);
    expect(checkItem({ kind: 'note', id: 'n', data: { ...dump.notes[0], fields: { type: 'cloze' } } })).toBe(false);
    expect(checkItem({ kind: 'note', id: 'other', data: dump.notes[0] })).toBe(false);
    expect(checkItem({ kind: 'settings', id: 'settings', data: { settings: { desiredRetention: 5, newPerDay: 1 }, settingsUpdatedAt: 0 } })).toBe(false);
    expect(checkItem({ kind: 'future', id: 'x', data: {} })).toBeNull();
  });
  test('only items that changed since the last sync are sent', () => {
    const items = dumpToItems(dump);
    const known = Object.fromEntries(items.map((i) => [itemKey(i), itemHash(i.data)]));
    expect(changedItems(items, known)).toEqual([]);
    const edited = dumpToItems({ ...dump, notes: [{ ...dump.notes[0], tags: ['x'], updatedAt: 9 }] });
    expect(changedItems(edited, known).map(itemKey)).toEqual(['note:n']);
    expect(itemHash({ b: 1, a: 2 })).toBe(itemHash({ a: 2, b: 1 }));
  });
});
