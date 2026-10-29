import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import Dexie from 'dexie';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import type { Repo } from '../../src/storage/repo';
import { newId } from '../../src/core/ids';
import { DEFAULT_SETTINGS, type Note, type ReviewEntry } from '../../src/core/model';

const T0 = Date.UTC(2026, 9, 1);

function cloze(text: string, id = 'n1'): Note {
  return { id, themeId: 't1', fields: { type: 'cloze', text }, tags: [], createdAt: T0, updatedAt: T0 };
}

function review(cardId: string, ts: number, id = newId(ts)): ReviewEntry {
  return { id, cardId, ts, rating: 3, mode: 'production', correct: true, durationMs: 2000, hintUsed: false, deviceId: 'd' };
}

let repo: Repo;
beforeEach(() => {
  repo = createDexieRepo(`test-${newId()}`);
});

describe('notes and cards', () => {
  test('a cloze with 3 gaps creates 3 cards', async () => {
    const cards = await repo.putNote(cloze('{{a}} {{b}} {{c}}'));
    expect(cards.map((c) => c.variant)).toEqual(['a', 'b', 'c']);
    expect(await repo.getNote('n1')).toMatchObject({ id: 'n1' });
  });

  test('adding a gap in front keeps existing card ids', async () => {
    const before = await repo.putNote(cloze('{{a}} {{b}} {{c}}'));
    const after = await repo.putNote(cloze('{{z}} {{a}} {{b}} {{c}}'));
    expect(after).toHaveLength(4);
    for (const card of before) expect(after.find((c) => c.variant === card.variant)?.id).toBe(card.id);
  });

  test('a removed gap without history is deleted', async () => {
    await repo.putNote(cloze('{{a}} {{b}}'));
    const after = await repo.putNote(cloze('{{a}}'));
    expect(after.map((c) => c.variant)).toEqual(['a']);
    expect(await repo.listCards('n1')).toHaveLength(1);
  });

  test('a removed gap with history is kept as orphan', async () => {
    const cards = await repo.putNote(cloze('{{a}} {{b}}'));
    const b = cards.find((c) => c.variant === 'b')!;
    await repo.appendReview(review(b.id, T0));
    const after = await repo.putNote(cloze('{{a}}'));
    expect(after.map((c) => c.variant)).toEqual(['a']);
    expect((await repo.listCards('n1')).find((c) => c.id === b.id)?.orphan).toBe(true);
  });

  test('a gap that comes back reuses its orphan card', async () => {
    const cards = await repo.putNote(cloze('{{a}} {{b}}'));
    const b = cards.find((c) => c.variant === 'b')!;
    await repo.appendReview(review(b.id, T0));
    await repo.putNote(cloze('{{a}}'));
    const back = await repo.putNote(cloze('{{a}} {{b}}'));
    const revived = back.find((c) => c.variant === 'b')!;
    expect(revived.id).toBe(b.id);
    expect(revived.orphan).toBeFalsy();
  });
});

describe('lookups', () => {
  test('getCard returns a card by id', async () => {
    const [card] = await repo.putNote(cloze('{{a}}'));
    expect(await repo.getCard(card.id)).toEqual(card);
    expect(await repo.getCard('missing')).toBeUndefined();
  });

  test('listNotes filters by theme', async () => {
    await repo.putNote(cloze('{{a}}', 'n1'));
    await repo.putNote({ ...cloze('{{b}}', 'n2'), themeId: 't2' });
    expect((await repo.listNotes('t1')).map((n) => n.id)).toEqual(['n1']);
    expect(await repo.listNotes()).toHaveLength(2);
  });
});

describe('review log', () => {
  test('lists a card reviews sorted by time then id', async () => {
    await repo.appendReview(review('c1', T0 + 2000, 'B'));
    await repo.appendReview(review('c1', T0 + 1000, 'Z'));
    await repo.appendReview(review('c1', T0 + 2000, 'A'));
    await repo.appendReview(review('c2', T0, 'X'));
    expect((await repo.listReviews('c1')).map((e) => e.id)).toEqual(['Z', 'A', 'B']);
    expect(await repo.listReviews()).toHaveLength(4);
  });

  test('appending an existing id is rejected', async () => {
    await repo.appendReview(review('c1', T0, 'A'));
    await expect(repo.appendReview(review('c1', T0 + 1, 'A'))).rejects.toThrow();
  });

  test('amendReview changes only rating and correct', async () => {
    const e = review('c1', T0, 'A');
    await repo.appendReview(e);
    await repo.amendReview('A', { rating: 1, correct: false });
    expect(await repo.listReviews('c1')).toEqual([{ ...e, rating: 1, correct: false }]);
  });
});

describe('amendReview edge cases', () => {
  test('amending with identical values succeeds', async () => {
    await repo.appendReview(review('c1', T0, 'A'));
    await expect(repo.amendReview('A', { rating: 3, correct: true })).resolves.toBeUndefined();
  });

  test('amending an unknown id is rejected', async () => {
    await expect(repo.amendReview('missing', { rating: 1, correct: false })).rejects.toThrow('not found');
  });
});

describe('deletions and flags', () => {
  test('deleteNote removes the note, its cards and their log only', async () => {
    const [a] = await repo.putNote(cloze('{{a}}', 'n1'));
    const [b] = await repo.putNote(cloze('{{b}}', 'n2'));
    await repo.appendReview(review(a.id, T0, 'RA'));
    await repo.appendReview(review(b.id, T0, 'RB'));
    await repo.deleteNote('n1');
    expect(await repo.getNote('n1')).toBeUndefined();
    expect(await repo.listCards('n1')).toEqual([]);
    expect((await repo.listReviews()).map((e) => e.id)).toEqual(['RB']);
    expect(await repo.getNote('n2')).toBeDefined();
  });

  test('deleteTheme removes the theme', async () => {
    await repo.putTheme({ id: 't9', name: 'X', order: 0 });
    await repo.deleteTheme('t9');
    expect(await repo.listThemes()).toEqual([]);
  });

  test('flags start unset and stay set', async () => {
    expect(await repo.getFlag('starterSeeded')).toBe(false);
    await repo.setFlag('starterSeeded');
    expect(await repo.getFlag('starterSeeded')).toBe(true);
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('tombstones and sync timestamps', () => {
  test('deleting a note or a theme leaves a dated tombstone', async () => {
    await repo.putNote(cloze('{{a}}', 'n1'));
    await repo.putTheme({ id: 't9', name: 'X', order: 0 });
    await repo.deleteNote('n1', T0 + 5);
    await repo.deleteTheme('t9', T0 + 6);
    const dump = await repo.dumpAll();
    expect(dump.tombstones).toEqual([
      { id: 'n1', kind: 'note', ts: T0 + 5 },
      { id: 't9', kind: 'theme', ts: T0 + 6 },
    ]);
  });

  test('settings remember when they were last changed', async () => {
    expect((await repo.dumpAll()).settingsUpdatedAt).toBe(0);
    await repo.putSettings({ desiredRetention: 0.85, newPerDay: 3 }, T0 + 9);
    expect((await repo.dumpAll()).settingsUpdatedAt).toBe(T0 + 9);
    expect(await repo.getSettings()).toEqual({ desiredRetention: 0.85, newPerDay: 3 });
  });

  test('restoreAll keeps tombstones and the settings timestamp', async () => {
    await repo.deleteNote('gone', T0);
    await repo.putSettings({ desiredRetention: 0.8, newPerDay: 2 }, T0 + 1);
    const dump = await repo.dumpAll();
    const other = createDexieRepo(`copy-${newId()}`);
    await other.restoreAll(dump);
    expect(await other.dumpAll()).toEqual(dump);
  });
});

describe('events and migration', () => {
  test('events are appended and listed by time', async () => {
    await repo.appendEvent({ id: 'b', type: 'round_completed', ts: T0 + 2 });
    await repo.appendEvent({ id: 'a', type: 'round_completed', ts: T0 + 1 });
    expect((await repo.listEvents()).map((e) => e.id)).toEqual(['a', 'b']);
  });

  test('a version 1 database opens with its data intact and no events', async () => {
    const name = `v1-${newId()}`;
    const old = new Dexie(name);
    old.version(1).stores({ themes: 'id', notes: 'id, themeId', cards: 'id, noteId', reviews: 'id, cardId, ts', settings: 'key' });
    await old.table('notes').put(cloze('{{a}}', 'kept'));
    await old.table('reviews').put(review('c1', T0, 'R1'));
    old.close();
    const upgraded = createDexieRepo(name);
    expect(await upgraded.getNote('kept')).toBeDefined();
    expect((await upgraded.listReviews()).map((e) => e.id)).toEqual(['R1']);
    expect(await upgraded.listEvents()).toEqual([]);
  });
});

describe('themes and settings', () => {
  test('stores themes', async () => {
    await repo.putTheme({ id: 't1', name: 'Méta-modèle', order: 0 });
    expect(await repo.listThemes()).toEqual([{ id: 't1', name: 'Méta-modèle', order: 0 }]);
  });

  test('returns default settings on an empty database', async () => {
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test('stores settings', async () => {
    await repo.putSettings({ desiredRetention: 0.85, newPerDay: 8 });
    expect(await repo.getSettings()).toEqual({ desiredRetention: 0.85, newPerDay: 8 });
  });
});
