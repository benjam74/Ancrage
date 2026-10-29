import { describe, expect, test } from 'vitest';
import { BACKUP_FORMAT, BACKUP_VERSION, backupFileName, parseBackup, serializeBackup, summarize, type Dump } from '../../src/core/backup';
import { DEFAULT_SETTINGS } from '../../src/core/model';

const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const dump: Dump = {
  themes: [{ id: 't', name: 'T', order: 0 }],
  notes: [{ id: 'n', themeId: 't', fields: { type: 'cloze', text: '{{a}}' }, tags: [], createdAt: NOW, updatedAt: NOW }],
  cards: [{ id: 'c', noteId: 'n', variant: 'a' }],
  reviews: [{ id: 'r', cardId: 'c', ts: NOW, rating: 3, mode: 'production', correct: true, durationMs: 1000, hintUsed: false, deviceId: 'd' }],
  events: [{ id: 'e', type: 'round_completed', ts: NOW }],
  settings: { ...DEFAULT_SETTINGS },
  flags: ['starterSeeded'],
  tombstones: [{ id: 'old', kind: 'note', ts: NOW - 1 }],
  settingsUpdatedAt: NOW - 2,
};

const mutate = (f: (o: Record<string, unknown>) => void) => {
  const o = JSON.parse(serializeBackup(dump, NOW));
  f(o);
  return JSON.stringify(o);
};

describe('backup format', () => {
  test('serialize then parse gives the same dump', () => {
    const res = parseBackup(serializeBackup(dump, NOW));
    expect(res).toEqual({ ok: true, dump, exportedAt: NOW });
    expect(JSON.parse(serializeBackup(dump, NOW))).toMatchObject({ format: BACKUP_FORMAT, version: BACKUP_VERSION });
  });

  test('rejects text that is not JSON', () => {
    const res = parseBackup('{oops');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/JSON/);
  });

  test('rejects another format', () => {
    const res = parseBackup(mutate((o) => (o.format = 'anki')));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/sauvegarde Ancrage/);
  });

  test('reads a version 1 backup with empty sync data', () => {
    const res = parseBackup(mutate((o) => { o.version = 1; delete o.tombstones; delete o.settingsUpdatedAt; }));
    expect(res.ok && res.dump.tombstones).toEqual([]);
    expect(res.ok && res.dump.settingsUpdatedAt).toBe(0);
  });

  test('rejects a damaged tombstone', () => {
    expect(parseBackup(mutate((o) => ((o.tombstones as unknown[])[0] = { id: 1 }))).ok).toBe(false);
  });

  test('rejects a backup from a newer version', () => {
    const res = parseBackup(mutate((o) => (o.version = BACKUP_VERSION + 1)));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/plus récente/);
  });

  test('rejects a backup missing a table', () => {
    expect(parseBackup(mutate((o) => delete o.notes)).ok).toBe(false);
  });

  test('rejects a note without fields and a review with a bad rating', () => {
    expect(parseBackup(mutate((o) => delete (o.notes as Record<string, unknown>[])[0].fields)).ok).toBe(false);
    expect(parseBackup(mutate((o) => ((o.reviews as Record<string, unknown>[])[0].rating = 7))).ok).toBe(false);
  });

  test.each([
    ['retention out of range', (o: Record<string, any>) => (o.settings.desiredRetention = 5)],
    ['negative new cards', (o: Record<string, any>) => (o.settings.newPerDay = -3)],
    ['cloze without text', (o: Record<string, any>) => (o.notes[0].fields = { type: 'cloze' })],
    ['mcq distractors not a list', (o: Record<string, any>) => (o.notes[0].fields = { type: 'mcq', question: 'Q', answer: 'A', distractors: 'x' })],
    ['tags not strings', (o: Record<string, any>) => (o.notes[0].tags = [1, null])],
    ['card pointing to a missing note', (o: Record<string, any>) => (o.cards[0].noteId = 'ghost')],
    ['note pointing to a missing theme', (o: Record<string, any>) => (o.notes[0].themeId = 'ghost')],
    ['duplicate ids', (o: Record<string, any>) => o.reviews.push({ ...o.reviews[0] })],
    ['review without durationMs', (o: Record<string, any>) => delete o.reviews[0].durationMs],
    ['review without deviceId', (o: Record<string, any>) => delete o.reviews[0].deviceId],
    ['version 0', (o: Record<string, any>) => (o.version = 0)],
    ['version 1.5', (o: Record<string, any>) => (o.version = 1.5)],
    ['theme parentId not a string', (o: Record<string, any>) => (o.themes[0].parentId = 3)],
  ])('rejects a damaged backup: %s', (_name, damage) => {
    const res = parseBackup(mutate(damage as (o: Record<string, unknown>) => void));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Sauvegarde|version/);
  });

  test('settings are rebuilt from known keys only', () => {
    const res = parseBackup(mutate((o) => ((o.settings as Record<string, unknown>).key = 'flag:x')));
    expect(res.ok && res.dump.settings).toEqual(DEFAULT_SETTINGS);
  });

  test('file name uses the local date', () => {
    expect(backupFileName(NOW)).toBe('ancrage-2026-10-28.json');
  });

  test('summary counts themes, notes and reviews', () => {
    expect(summarize(dump)).toEqual({ themes: 1, notes: 1, reviews: 1 });
  });
});

describe('shop events in backups', () => {
  const shop: Dump = {
    ...dump,
    events: [
      { id: 'e', type: 'round_completed', ts: NOW },
      { id: 'p', type: 'purchase', ts: NOW + 1, itemId: 'bonnet', price: 60 },
      { id: 's', type: 'sale', ts: NOW + 2, itemId: 'bonnet', refund: 30 },
      { id: 'q', type: 'equip', ts: NOW + 3, slot: 'chapeau', itemId: null },
      { id: 'a', type: 'avatar', ts: NOW + 4, character: 'lapin', name: 'Pompon' },
    ],
  };

  test('purchases, sales, outfit and character round-trip', () => {
    expect(parseBackup(serializeBackup(shop, NOW))).toEqual({ ok: true, dump: shop, exportedAt: NOW });
  });

  test('an event type from a future version is kept untouched, a malformed known one is refused', () => {
    const future = mutate((o) => (o.events = [...(o.events as unknown[]), { id: 'z', type: 'future_thing', ts: NOW, extra: 1 }, { id: 'y', type: 'hasOwnProperty', ts: NOW }]));
    const res = parseBackup(future);
    expect(res.ok && res.dump.events.map((e) => e.id)).toEqual(['e', 'z', 'y']);
    expect(res.ok && res.dump.events[1]).toEqual({ id: 'z', type: 'future_thing', ts: NOW, extra: 1 });
    expect(parseBackup(mutate((o) => (o.events = [{ id: 'p', type: 'purchase', ts: NOW, itemId: 'bonnet' }]))).ok).toBe(false);
    expect(parseBackup(mutate((o) => (o.events = [{ id: 'a', type: 'avatar', ts: NOW, character: 'dragon', name: 'x' }]))).ok).toBe(false);
  });
});

describe('suspended notes', () => {
  test('a suspended note round-trips; a non-boolean value is refused', () => {
    const withFlag = mutate((o) => ((o.notes as Record<string, unknown>[])[0].suspended = true));
    const res = parseBackup(withFlag);
    expect(res.ok && res.dump.notes[0].suspended).toBe(true);
    expect(parseBackup(mutate((o) => ((o.notes as Record<string, unknown>[])[0].suspended = 'oui'))).ok).toBe(false);
  });
});

describe('v1.8: image notes and theme language', () => {
  const imageNote = { id: 'img', themeId: 't', fields: { type: 'image', title: 'Cœur', image: 'data:image/webp;base64,AAAA', masks: [{ id: 'a', x: 0.1, y: 0.1, w: 0.2, h: 0.1, label: 'Aorte' }] }, tags: [], createdAt: NOW, updatedAt: NOW };
  test('an image note and a theme language round-trip', () => {
    const res = parseBackup(mutate((o) => {
      (o.notes as unknown[]).push(imageNote);
      (o.themes as Record<string, unknown>[])[0].lang = 'en-GB';
    }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.dump.notes.find((n) => n.id === 'img')?.fields).toEqual(imageNote.fields);
      expect(res.dump.themes[0].lang).toBe('en-GB');
    }
  });
  test('a malformed zone or language is refused', () => {
    expect(parseBackup(mutate((o) => (o.notes as unknown[]).push({ ...imageNote, fields: { ...imageNote.fields, masks: [{ id: 'a', x: 'left' }] } }))).ok).toBe(false);
    expect(parseBackup(mutate((o) => ((o.themes as Record<string, unknown>[])[0].lang = 'klingon'))).ok).toBe(false);
  });
  test('backups are version 4', () => {
    expect(BACKUP_VERSION).toBe(4);
  });
});
