import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { createServices, seedIfEmpty, type Services } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import type { Repo } from '../../src/storage/repo';
import { newId } from '../../src/core/ids';
import { STARTER_THEMES } from '../../src/data/starter';

const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const ok = { kind: 'auto', correct: true, durationMs: 2000, hintUsed: false } as const;

let repo: Repo;
let services: Services;
beforeEach(async () => {
  repo = createDexieRepo(`library-${newId()}`);
  services = createServices(repo, 'device-test');
});

async function aTheme() {
  return services.createTheme('Recadrage');
}

describe('saveNote', () => {
  test('an invalid note is refused with field errors and nothing is written', async () => {
    const t = await aTheme();
    const res = await services.saveNote({ themeId: t.id, fields: { type: 'cloze', text: 'sans trou' }, tags: [] }, NOW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors).toHaveProperty('text');
    expect(await repo.listNotes()).toEqual([]);
  });

  test('a new note gets an id, timestamps and its cards', async () => {
    const t = await aTheme();
    const res = await services.saveNote({ themeId: t.id, fields: { type: 'cloze', text: '{{a}} {{b}}' }, tags: ['perso'], source: 'Livre' }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cards).toBe(2);
    expect(res.note).toMatchObject({ themeId: t.id, createdAt: NOW, updatedAt: NOW, tags: ['perso'], source: 'Livre' });
    expect(await repo.getNote(res.note.id)).toEqual(res.note);
  });

  test('editing keeps id, createdAt and the history of unchanged gaps', async () => {
    const t = await aTheme();
    const first = await services.saveNote({ themeId: t.id, fields: { type: 'cloze', text: '{{a}} {{b}} {{c}}' }, tags: [] }, NOW);
    if (!first.ok) throw new Error('setup');
    const before = await repo.listCards(first.note.id);
    for (const c of before) await services.engine.answer(c.id, 'recognition', ok, NOW);
    const edited = await services.saveNote({ id: first.note.id, themeId: t.id, fields: { type: 'cloze', text: '{{a}} {{b}} {{cc}}' }, tags: [] }, NOW + 1000);
    if (!edited.ok) throw new Error('edit failed');
    expect(edited.note).toMatchObject({ id: first.note.id, createdAt: NOW, updatedAt: NOW + 1000 });
    const after = (await repo.listCards(first.note.id)).filter((c) => !c.orphan);
    const kept = after.filter((c) => before.some((b) => b.id === c.id));
    expect(kept.map((c) => c.variant).sort()).toEqual(['a', 'b']);
    for (const c of kept) expect(await repo.listReviews(c.id)).toHaveLength(1);
    expect(after.find((c) => c.variant === 'cc')).toBeDefined();
  });
});

describe('themes', () => {
  test('createTheme trims the name and appends it after existing themes', async () => {
    await repo.putTheme({ id: 'x', name: 'X', order: 4 });
    expect(await services.createTheme('  Écoute active ')).toMatchObject({ name: 'Écoute active', order: 5 });
    await expect(services.createTheme('   ')).rejects.toThrow();
  });

  test('renameTheme changes only the name', async () => {
    const t = await aTheme();
    await services.renameTheme(t.id, ' Recadrage de sens ');
    expect((await repo.listThemes()).find((x) => x.id === t.id)).toEqual({ ...t, name: 'Recadrage de sens' });
  });

  test('a theme with notes cannot be deleted; an empty one can', async () => {
    const t = await aTheme();
    await services.saveNote({ themeId: t.id, fields: { type: 'basic', front: 'Q', back: 'R', reverse: false }, tags: [] }, NOW);
    const refused = await services.deleteTheme(t.id);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBeTruthy();
    expect(await repo.listThemes()).toHaveLength(1);
    const empty = await services.createTheme('Vide');
    expect((await services.deleteTheme(empty.id)).ok).toBe(true);
    expect((await repo.listThemes()).map((x) => x.id)).toEqual([t.id]);
  });
});

describe('examples', () => {
  test('removeExamples keeps themes that hold personal notes', async () => {
    await seedIfEmpty(repo, NOW);
    await services.saveNote({ themeId: 'ex-meta', fields: { type: 'basic', front: 'Perso', back: 'R', reverse: false }, tags: [] }, NOW);
    const res = await services.removeExamples();
    expect(res.themes).toBe(STARTER_THEMES.length - 1);
    expect(res.notes).toBeGreaterThanOrEqual(20);
    expect((await repo.listThemes()).map((t) => t.id)).toEqual(['ex-meta']);
    expect((await repo.listNotes()).map((n) => n.fields.type === 'basic' && n.fields.front)).toEqual(['Perso']);
  });

  test('the starter deck is never seeded again after removal', async () => {
    await seedIfEmpty(repo, NOW);
    await services.removeExamples();
    expect(await seedIfEmpty(repo, NOW)).toBe(false);
    expect(await repo.listNotes()).toEqual([]);
  });
});

describe('library and slots', () => {
  test('newSlotsLeft drops as new cards are answered today', async () => {
    await seedIfEmpty(repo, NOW);
    expect(await services.newSlotsLeft(NOW)).toBe(5);
    for (const id of (await services.today(NOW)).queue) await services.engine.answer(id, 'recognition', ok, NOW);
    expect(await services.newSlotsLeft(NOW + 1000)).toBe(0);
  });

  test('library lists themes in order with notes and their card counts', async () => {
    const b = await services.createTheme('B');
    const a = await services.createTheme('A');
    await services.saveNote({ themeId: a.id, fields: { type: 'cloze', text: '{{x}} {{y}}' }, tags: [] }, NOW);
    await services.saveNote({ themeId: a.id, fields: { type: 'basic', front: 'Q', back: 'R', reverse: true }, tags: [] }, NOW + 1);
    const lib = await services.library();
    expect(lib.map((l) => l.theme.name)).toEqual(['B', 'A']);
    expect(lib[0].notes).toEqual([]);
    expect(lib[1].notes.map((n) => n.cards)).toEqual([2, 2]);
    expect(lib[1].notes[0].note.fields.type).toBe('cloze');
    void b;
  });

  test('deleteNote removes it from the library', async () => {
    const t = await aTheme();
    const res = await services.saveNote({ themeId: t.id, fields: { type: 'basic', front: 'Q', back: 'R', reverse: false }, tags: [] }, NOW);
    if (!res.ok) throw new Error('setup');
    await services.deleteNote(res.note.id);
    expect((await services.library())[0].notes).toEqual([]);
  });
});
