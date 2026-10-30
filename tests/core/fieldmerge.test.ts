import { describe, expect, test } from 'vitest';
import { NOTE_FIELDS, THEME_FIELDS, mergeRecord, stampFields } from '../../src/core/merge';
import type { Note, Theme } from '../../src/core/model';

const base: Note = { id: 'n', themeId: 't', fields: { type: 'basic', front: 'Q', back: 'R', reverse: false }, tags: [], createdAt: 1, updatedAt: 10 };

describe('stampFields', () => {
  test('records when each changed field changed, including a removed optional field', () => {
    const next = stampFields(base, { ...base, explanation: 'Parce que.', updatedAt: 20 }, NOTE_FIELDS);
    expect(next.fieldTimes).toEqual({ themeId: 10, fields: 10, tags: 10 });
    const cleared = stampFields(next, { ...base, updatedAt: 30, fieldTimes: next.fieldTimes }, NOTE_FIELDS);
    expect(cleared.fieldTimes).toMatchObject({ fields: 10, explanation: 30 });
    expect(cleared.explanation).toBeUndefined();
  });
  test('a new record needs no field times', () => {
    expect(stampFields(undefined, base, NOTE_FIELDS).fieldTimes).toBeUndefined();
  });
});

describe('mergeRecord', () => {
  test('edits of different fields on two devices are both kept', () => {
    const a = stampFields(base, { ...base, explanation: 'Parce que.', updatedAt: 20 }, NOTE_FIELDS);
    const b = stampFields(base, { ...base, tags: ['pnl'], updatedAt: 25 }, NOTE_FIELDS);
    const m = mergeRecord(a, b, NOTE_FIELDS);
    expect(m.explanation).toBe('Parce que.');
    expect(m.tags).toEqual(['pnl']);
    expect(m.updatedAt).toBe(25);
    expect(mergeRecord(b, a, NOTE_FIELDS)).toEqual(m);
  });
  test('the same field edited twice: the latest wins', () => {
    const a = stampFields(base, { ...base, explanation: 'Ancienne.', updatedAt: 20 }, NOTE_FIELDS);
    const b = stampFields(base, { ...base, explanation: 'Nouvelle.', updatedAt: 30 }, NOTE_FIELDS);
    expect(mergeRecord(a, b, NOTE_FIELDS).explanation).toBe('Nouvelle.');
  });
  test('a version from an older app (no field times) never deletes a field it does not know', () => {
    const withWhy = stampFields(base, { ...base, explanation: 'Parce que.', updatedAt: 20 }, NOTE_FIELDS);
    const old: Note = { ...base, fields: { type: 'basic', front: 'Q2', back: 'R', reverse: false }, updatedAt: 40 };
    const m = mergeRecord(withWhy, old, NOTE_FIELDS);
    expect(m.explanation).toBe('Parce que.');
    expect(m.fields).toEqual(old.fields);
  });
  test('a deletion recorded by a newer app wins over an older value', () => {
    const withWhy = stampFields(base, { ...base, explanation: 'Parce que.', updatedAt: 20 }, NOTE_FIELDS);
    const cleared = stampFields(withWhy, { ...base, updatedAt: 30, fieldTimes: withWhy.fieldTimes }, NOTE_FIELDS);
    expect(mergeRecord(withWhy, cleared, NOTE_FIELDS).explanation).toBeUndefined();
  });
  test('themes: a rename on one device and a language on the other are both kept', () => {
    const t: Theme = { id: 'th', name: 'Anglais', order: 0, kind: 'domain', updatedAt: 5 };
    const a = stampFields(t, { ...t, name: 'English', updatedAt: 10 }, THEME_FIELDS);
    const b = stampFields(t, { ...t, lang: 'en-GB', updatedAt: 12 }, THEME_FIELDS);
    const m = mergeRecord(a, b, THEME_FIELDS);
    expect(m).toMatchObject({ name: 'English', lang: 'en-GB', updatedAt: 12 });
  });
  test('ties are deterministic whatever the order', () => {
    const a = { ...base, explanation: 'A', updatedAt: 20 };
    const b = { ...base, explanation: 'B', updatedAt: 20 };
    expect(mergeRecord(a, b, NOTE_FIELDS)).toEqual(mergeRecord(b, a, NOTE_FIELDS));
  });
});

describe('merge properties with field times', () => {
  test('three versions merge to the same result in any order, and merging twice changes nothing', () => {
    const a = stampFields(base, { ...base, explanation: 'E', updatedAt: 20 }, NOTE_FIELDS);
    const b = stampFields(base, { ...base, tags: ['x'], updatedAt: 25 }, NOTE_FIELDS);
    const c = stampFields(base, { ...base, source: 'S', updatedAt: 15 }, NOTE_FIELDS);
    const m1 = mergeRecord(mergeRecord(a, b, NOTE_FIELDS), c, NOTE_FIELDS);
    const m2 = mergeRecord(a, mergeRecord(c, b, NOTE_FIELDS), NOTE_FIELDS);
    expect(m1).toEqual(m2);
    expect(m1).toMatchObject({ explanation: 'E', tags: ['x'], source: 'S' });
    expect(mergeRecord(m1, m1, NOTE_FIELDS)).toEqual(m1);
  });
});

describe('fields from a later app version', () => {
  test('a field this version does not know survives its edits and merges', () => {
    const later = stampFields(base, { ...base, mood: 'calme', updatedAt: 20 } as Note, NOTE_FIELDS);
    // This version edits the note without knowing `mood`: its record still carries it (spread), then a merge.
    const edited = stampFields(later, { ...later, tags: ['x'], updatedAt: 30 }, NOTE_FIELDS);
    const m = mergeRecord(later, edited, NOTE_FIELDS) as Note & { mood?: string };
    expect(m.mood).toBe('calme');
    // A version rebuilt without the field (no time for it) does not delete it.
    const rebuilt: Note = { ...base, tags: ['y'], updatedAt: 40 };
    expect((mergeRecord(later, rebuilt, NOTE_FIELDS) as Note & { mood?: string }).mood).toBe('calme');
  });
});

describe('rebuilt records', () => {
  test('saving a note rebuilt without a later field keeps that field', () => {
    const later = { ...base, mood: 'calme', updatedAt: 20 } as Note;
    const saved = stampFields(later, { ...base, tags: ['z'], updatedAt: 30 }, NOTE_FIELDS) as Note & { mood?: string };
    expect(saved.mood).toBe('calme');
    expect(saved.tags).toEqual(['z']);
  });
});
