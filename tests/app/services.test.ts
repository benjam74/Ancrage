import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { createServices, seedIfEmpty, type Services } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import type { Repo } from '../../src/storage/repo';
import { newId } from '../../src/core/ids';
import { STARTER_THEMES } from '../../src/data/starter';

const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const HOUR = 3_600_000;
const ok = { kind: 'auto', correct: true, durationMs: 2000, hintUsed: false } as const;

let repo: Repo;
let services: Services;
beforeEach(() => {
  repo = createDexieRepo(`services-${newId()}`);
  services = createServices(repo, 'device-test');
});

describe('seedIfEmpty', () => {
  test('seeds the starter deck once', async () => {
    expect(await seedIfEmpty(repo, NOW)).toBe(true);
    const notes = await repo.listNotes();
    expect(notes.length).toBeGreaterThanOrEqual(20);
    expect(new Set(notes.map((n) => n.fields.type)).size).toBe(6);
    expect(await repo.listThemes()).toHaveLength(STARTER_THEMES.length);
    expect(await seedIfEmpty(repo, NOW)).toBe(false);
    expect(await repo.listNotes()).toHaveLength(notes.length);
  });
});

describe('today', () => {
  test('right after seeding, the queue holds today’s 5 new cards', async () => {
    await seedIfEmpty(repo, NOW);
    expect(await services.today(NOW)).toMatchObject({ due: 0, fresh: 5, nextDue: null });
    expect((await services.today(NOW)).queue).toHaveLength(5);
  });

  test('new cards answered today count against the daily limit', async () => {
    await seedIfEmpty(repo, NOW);
    const { queue } = await services.today(NOW);
    await services.engine.answer(queue[0], 'recognition', ok, NOW);
    await services.engine.answer(queue[1], 'recognition', ok, NOW);
    const after = await services.today(NOW + 1000);
    expect(after.fresh).toBe(3);
    expect(after.queue).not.toContain(queue[0]);
    expect(after.nextDue).toBeGreaterThan(NOW);
  });

  test('orphan cards never enter the queue', async () => {
    await repo.putTheme({ id: 't', name: 'T', order: 0 });
    const note = { id: 'n', themeId: 't', fields: { type: 'cloze' as const, text: '{{a}} {{b}}' }, tags: [], createdAt: NOW, updatedAt: NOW };
    const [, b] = await repo.putNote(note);
    await services.engine.answer(b.id, 'recognition', { ...ok, correct: false }, NOW);
    await repo.putNote({ ...note, fields: { type: 'cloze', text: '{{a}}' } });
    expect((await services.today(NOW + 2 * HOUR)).queue).not.toContain(b.id);
  });
});

describe('context', () => {
  test('returns the note, card, theme and the rest of the theme as pool', async () => {
    await seedIfEmpty(repo, NOW);
    const [cardId] = (await services.today(NOW)).queue;
    const ctx = await services.context(cardId);
    expect(ctx.card.id).toBe(cardId);
    expect(ctx.theme.id).toBe(ctx.note.themeId);
    expect(ctx.pool.length).toBeGreaterThan(0);
    expect(ctx.pool.every((n) => n.id !== ctx.note.id && n.themeId === ctx.note.themeId)).toBe(true);
  });
});
