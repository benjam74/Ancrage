import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { createServices, type Services } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import type { Repo } from '../../src/storage/repo';
import { newId } from '../../src/core/ids';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const miss = { kind: 'self', grade: 1 } as const;
const good = { kind: 'self', grade: 3 } as const;

let repo: Repo;
let services: Services;
beforeEach(async () => {
  repo = createDexieRepo(`hard-${newId()}`);
  services = createServices(repo, 'device-test');
});

async function aNote() {
  const t = await services.createTheme('Recadrage');
  const res = await services.saveNote({ themeId: t.id, fields: { type: 'basic', front: 'Q', back: 'R', reverse: false }, tags: [] }, NOW - 400 * DAY);
  if (!res.ok) throw new Error('save');
  const [card] = await repo.listCards();
  return { note: res.note, cardId: card.id, theme: t };
}

/** Learns the card, then forgets it `lapses` times, each time after it became a review card again. */
async function forget(cardId: string, lapses: number) {
  let t = NOW - 300 * DAY;
  for (let i = 0; i < lapses; i++) {
    await services.engine.answer(cardId, 'self', good, t);
    await services.engine.answer(cardId, 'self', good, (t += 3 * DAY));
    await services.engine.answer(cardId, 'self', good, (t += 10 * DAY));
    await services.engine.answer(cardId, 'self', miss, (t += 30 * DAY));
    t += DAY;
  }
  return t;
}

describe('hard cards', () => {
  test('a card forgotten 4 times is listed with its theme', async () => {
    const { note, cardId, theme } = await aNote();
    await forget(cardId, 4);
    const hard = await services.hardNotes(NOW);
    expect(hard.map((h) => h.note.id)).toEqual([note.id]);
    expect(hard[0].theme.id).toBe(theme.id);
    expect(hard[0].lapses).toBeGreaterThanOrEqual(4);
  });
  test('3 forgettings are not enough', async () => {
    const { cardId } = await aNote();
    await forget(cardId, 3);
    expect(await services.hardNotes(NOW)).toEqual([]);
  });
});

describe('suspended notes', () => {
  test('leave the daily queue and custom sessions, keep their history, and come back', async () => {
    const { note, cardId, theme } = await aNote();
    await services.engine.answer(cardId, 'self', good, NOW - 30 * DAY);
    expect((await services.today(NOW)).queue).toContain(cardId);
    await services.setSuspended(note.id, true, NOW);
    expect((await services.today(NOW)).queue).not.toContain(cardId);
    expect(await services.custom(NOW, { themeIds: [theme.id], mode: 'due', limit: Infinity })).toEqual([]);
    expect(await services.custom(NOW, { themeIds: [theme.id], mode: 'practice', limit: Infinity })).toEqual([]);
    expect((await services.progress(NOW)).themes.find((t) => t.theme.id === theme.id)!.due).toBe(0);
    expect(await repo.listReviews(cardId)).toHaveLength(1);
    const lib = await services.library();
    expect(lib.flatMap((t) => t.notes).find((n) => n.note.id === note.id)!.note.suspended).toBe(true);
    await services.setSuspended(note.id, false, NOW + 1);
    expect((await services.today(NOW + 1)).queue).toContain(cardId);
  });
  test('editing a suspended note keeps it aside, with a newer version for sync', async () => {
    const { note, cardId, theme } = await aNote();
    await services.setSuspended(note.id, true, NOW);
    const after = await repo.getNote(note.id);
    expect(after!.updatedAt).toBeGreaterThan(note.updatedAt);
    await services.saveNote({ id: note.id, themeId: theme.id, fields: { type: 'basic', front: 'Q2', back: 'R', reverse: false }, tags: [] }, NOW + 5);
    expect((await repo.getNote(note.id))!.suspended).toBe(true);
    expect((await services.today(NOW + 5)).queue).not.toContain(cardId);
  });
  test('a suspended note is not listed as hard', async () => {
    const { note, cardId } = await aNote();
    await forget(cardId, 4);
    await services.setSuspended(note.id, true, NOW);
    expect(await services.hardNotes(NOW)).toEqual([]);
  });
});
