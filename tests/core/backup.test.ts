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

  test('rejects a backup from a newer version', () => {
    const res = parseBackup(mutate((o) => (o.version = 2)));
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

  test('file name uses the local date', () => {
    expect(backupFileName(NOW)).toBe('ancrage-2026-10-28.json');
  });

  test('summary counts themes, notes and reviews', () => {
    expect(summarize(dump)).toEqual({ themes: 1, notes: 1, reviews: 1 });
  });
});
