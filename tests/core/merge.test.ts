import { describe, expect, test } from 'vitest';
import { mergeDumps, reconcileCards } from '../../src/core/merge';
import { canonical } from '../../src/core/canonical';
import type { Dump } from '../../src/core/backup';
import { DEFAULT_SETTINGS, type Note, type ReviewEntry } from '../../src/core/model';

const T = new Date(2026, 9, 28, 10, 0).getTime();
const note = (id: string, text: string, updatedAt = T, themeId = 't1'): Note => ({
  id, themeId, fields: { type: 'cloze', text }, tags: [], createdAt: T, updatedAt,
});
const review = (id: string, cardId: string, ts: number): ReviewEntry => ({
  id, cardId, ts, rating: 3, mode: 'production', correct: true, durationMs: 1000, hintUsed: false, deviceId: 'd',
});
const base = (): Dump => ({
  themes: [{ id: 't1', name: 'Méta-modèle', order: 0, updatedAt: T }],
  notes: [note('n1', '{{a}} {{b}}'), note('n2', '{{x}}')],
  cards: [{ id: 'c1', noteId: 'n1', variant: 'a' }, { id: 'c2', noteId: 'n1', variant: 'b' }, { id: 'c3', noteId: 'n2', variant: 'x' }],
  reviews: [review('r1', 'c1', T)],
  events: [{ id: 'e1', type: 'round_completed', ts: T }],
  settings: { ...DEFAULT_SETTINGS },
  flags: ['starterSeeded'],
  tombstones: [],
  settingsUpdatedAt: 0,
});

/** Two devices that diverged from the same base. */
function diverged(): [Dump, Dump] {
  const a = base();
  a.reviews.push(review('rA', 'c2', T + 100));
  a.events.push({ id: 'eA', type: 'round_completed', ts: T + 100 });
  a.notes[1] = note('n2', '{{x}} édité sur A', T + 50);
  const b = base();
  b.reviews.push(review('rB', 'c3', T + 200));
  b.themes.push({ id: 't2', name: 'GROW', order: 1, updatedAt: T + 10 });
  b.notes.push(note('n3', '{{nouveau}}', T + 10, 't2'));
  b.cards.push({ id: 'c4', noteId: 'n3', variant: 'nouveau' });
  b.settings = { desiredRetention: 0.85, newPerDay: 8 };
  b.settingsUpdatedAt = T + 300;
  return [a, b];
}

describe('mergeDumps properties', () => {
  test('is commutative', () => {
    const [a, b] = diverged();
    expect(mergeDumps(a, b)).toEqual(mergeDumps(b, a));
  });

  test('is idempotent', () => {
    const [a, b] = diverged();
    const m = mergeDumps(a, b);
    expect(mergeDumps(m, m)).toEqual(m);
    expect(mergeDumps(m, b)).toEqual(m);
    expect(mergeDumps(a, a)).toEqual(mergeDumps(a, base()));
  });

  test('keeps the history and rounds of both devices', () => {
    const m = mergeDumps(...diverged());
    expect(m.reviews.map((r) => r.id)).toEqual(['r1', 'rA', 'rB']);
    expect(m.events.map((e) => e.id)).toEqual(['e1', 'eA']);
    expect(m.notes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
    expect(m.themes.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  test('settings: the latest change wins; flags are united', () => {
    const [a, b] = diverged();
    a.flags = ['other'];
    const m = mergeDumps(a, b);
    expect(m.settings).toEqual({ desiredRetention: 0.85, newPerDay: 8 });
    expect(m.settingsUpdatedAt).toBe(T + 300);
    expect(m.flags).toEqual(['other', 'starterSeeded']);
  });
});

describe('conflicts', () => {
  test('a note edited on both devices: the latest edit wins everywhere', () => {
    const a = base();
    const b = base();
    a.notes[1] = note('n2', '{{x}} version A', T + 50);
    b.notes[1] = note('n2', '{{x}} version B', T + 60);
    const m = mergeDumps(a, b);
    expect(m.notes.find((n) => n.id === 'n2')!.fields).toEqual({ type: 'cloze', text: '{{x}} version B' });
  });

  test('a note deleted on A and reviewed on B stays deleted, with its cards and reviews', () => {
    const a = base();
    a.notes = a.notes.filter((n) => n.id !== 'n1');
    a.cards = a.cards.filter((c) => c.noteId !== 'n1');
    a.reviews = [];
    a.tombstones = [{ id: 'n1', kind: 'note', ts: T + 10 }];
    const b = base();
    b.reviews.push(review('rB', 'c2', T + 20));
    const m = mergeDumps(a, b);
    expect(m.notes.map((n) => n.id)).toEqual(['n2']);
    expect(m.cards.map((c) => c.id)).toEqual(['c3']);
    expect(m.reviews).toEqual([]);
  });

  test('an edit after a deletion brings the note back', () => {
    const a = base();
    a.notes = a.notes.filter((n) => n.id !== 'n2');
    a.tombstones = [{ id: 'n2', kind: 'note', ts: T + 10 }];
    const b = base();
    b.notes[1] = note('n2', '{{x}} relu', T + 20);
    expect(mergeDumps(a, b).notes.map((n) => n.id)).toEqual(['n1', 'n2']);
  });

  test('the same gap added on two devices ends as one card holding both histories', () => {
    const a = base();
    const b = base();
    a.notes[1] = note('n2', '{{x}} {{y}}', T + 50);
    a.cards.push({ id: 'cy-A', noteId: 'n2', variant: 'y' });
    a.reviews.push(review('rA', 'cy-A', T + 60));
    b.notes[1] = note('n2', '{{x}} {{y}}', T + 50);
    b.cards.push({ id: 'cy-B', noteId: 'n2', variant: 'y' });
    b.reviews.push(review('rB', 'cy-B', T + 70));
    const m = mergeDumps(a, b);
    expect(m.cards.filter((c) => c.noteId === 'n2' && c.variant === 'y').map((c) => c.id)).toEqual(['cy-A']);
    expect(m.reviews.filter((r) => r.cardId === 'cy-A').map((r) => r.id)).toEqual(['rA', 'rB']);
  });

  test('a theme renamed on both devices keeps the latest name', () => {
    const a = base();
    const b = base();
    a.themes[0] = { ...a.themes[0], name: 'Méta A', updatedAt: T + 5 };
    b.themes[0] = { ...b.themes[0], name: 'Méta B', updatedAt: T + 9 };
    expect(mergeDumps(a, b).themes[0].name).toBe('Méta B');
  });

  test('a theme deleted on A comes back when B added a note to it', () => {
    const a = base();
    a.themes = [];
    a.notes = [];
    a.cards = [];
    a.reviews = [];
    a.tombstones = [{ id: 't1', kind: 'theme', ts: T + 10 }, { id: 'n1', kind: 'note', ts: T + 10 }, { id: 'n2', kind: 'note', ts: T + 10 }];
    const b = base();
    b.notes.push(note('n9', '{{z}}', T + 20));
    b.cards.push({ id: 'c9', noteId: 'n9', variant: 'z' });
    const m = mergeDumps(a, b);
    expect(m.themes.map((t) => t.id)).toEqual(['t1']);
    expect(m.notes.map((n) => n.id)).toEqual(['n9']);
  });
});

describe('tie-breaks', () => {
  test('equal timestamps pick the same winner whatever the key order (jsonb reorders keys)', () => {
    const a = base();
    const b = base();
    a.notes[1] = { updatedAt: T + 5, id: 'n2', themeId: 't1', fields: { text: '{{x}} A', type: 'cloze' }, tags: [], createdAt: T } as Note;
    b.notes[1] = note('n2', '{{x}} B', T + 5);
    const reordered = JSON.parse(canonical(b.notes[1])) as Note;
    const b2 = { ...b, notes: [b.notes[0], reordered] };
    const w1 = mergeDumps(a, b).notes[1].fields;
    const w2 = mergeDumps(a, b2).notes[1].fields;
    expect(w1).toEqual(w2);
  });
});

describe('reconcileCards', () => {
  test('a removed variant with history is kept as orphan, without history it goes', () => {
    const notes = [note('n1', '{{a}}')];
    const cards = [{ id: 'c1', noteId: 'n1', variant: 'a' }, { id: 'c2', noteId: 'n1', variant: 'b' }, { id: 'c5', noteId: 'n1', variant: 'old' }];
    const { cards: out, reviews } = reconcileCards(notes, cards, [review('r', 'c2', T), review('lost', 'ghost', T)]);
    expect(out).toEqual([{ id: 'c1', noteId: 'n1', variant: 'a' }, { id: 'c2', noteId: 'n1', variant: 'b', orphan: true }]);
    expect(reviews.map((r) => r.id)).toEqual(['r']);
  });

  test('a variant that came back is no longer orphan', () => {
    const { cards } = reconcileCards([note('n1', '{{a}}')], [{ id: 'c1', noteId: 'n1', variant: 'a', orphan: true }], []);
    expect(cards).toEqual([{ id: 'c1', noteId: 'n1', variant: 'a' }]);
  });
});
