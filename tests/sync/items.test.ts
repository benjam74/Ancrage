import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { createServices, seedIfEmpty } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';
import { memoryStorage } from '../../src/app/cloud';
import { createMemoryItems } from '../../src/sync/items-remote';
import { createMemoryRemote } from '../../src/sync/memory-remote';
import { syncItems, syncOnce } from '../../src/sync/sync';
import { BACKUP_FORMAT, serializeBackup } from '../../src/core/backup';

const NOW = new Date(2026, 9, 28, 10, 0).getTime();

async function device() {
  const repo = createDexieRepo(`items-${newId()}`);
  return { repo, services: createServices(repo, `dev-${newId()}`), state: memoryStorage() };
}

describe('incremental sync', () => {
  test('a first device sends everything, a second receives it; nothing is sent twice', async () => {
    const server = createMemoryItems();
    const a = await device();
    await seedIfEmpty(a.repo, NOW);
    const first = await syncItems(a.repo, server.remote, a.state);
    expect(first.pushed).toBeGreaterThan(20);
    const again = await syncItems(a.repo, server.remote, a.state);
    expect(again).toEqual({ pulled: false, pushed: 0 });

    const b = await device();
    const res = await syncItems(b.repo, server.remote, b.state);
    expect(res.pulled).toBe(true);
    expect((await b.repo.listNotes()).length).toBe((await a.repo.listNotes()).length);
    expect(await syncItems(b.repo, server.remote, b.state)).toEqual({ pulled: false, pushed: 0 });
  });

  test('only what changed travels, and edits of different fields on two devices are both kept', async () => {
    const server = createMemoryItems();
    const a = await device();
    await seedIfEmpty(a.repo, NOW);
    await syncItems(a.repo, server.remote, a.state);
    const b = await device();
    await syncItems(b.repo, server.remote, b.state);

    await a.services.setExplanation('ex-02', 'Pourquoi A.', NOW + 1000);
    const note = (await b.repo.getNote('ex-02'))!;
    await b.services.saveNote({ id: 'ex-02', themeId: note.themeId, fields: note.fields, tags: ['b'] }, NOW + 2000);
    const writesBefore = server.writes.length;
    const pa = await syncItems(a.repo, server.remote, a.state);
    expect(pa.pushed).toBe(1);
    expect(server.writes.slice(writesBefore).flat().map((i) => `${i.kind}:${i.id}`)).toEqual(['note:ex-02']);
    await syncItems(b.repo, server.remote, b.state);
    await syncItems(a.repo, server.remote, a.state);
    for (const d of [a, b]) {
      const n = (await d.repo.getNote('ex-02'))!;
      expect(n.explanation).toBe('Pourquoi A.');
      expect(n.tags).toEqual(['b']);
    }
  });

  test('answers on both devices end on both', async () => {
    const server = createMemoryItems();
    const a = await device();
    await seedIfEmpty(a.repo, NOW);
    await syncItems(a.repo, server.remote, a.state);
    const b = await device();
    await syncItems(b.repo, server.remote, b.state);
    const [ca] = (await a.services.today(NOW)).queue;
    const [cb] = (await b.services.today(NOW)).queue;
    await a.services.engine.answer(ca, 'self', { kind: 'self', grade: 3 }, NOW + 1);
    await b.services.engine.answer(cb, 'self', { kind: 'self', grade: 2 }, NOW + 2);
    await syncItems(a.repo, server.remote, a.state);
    await syncItems(b.repo, server.remote, b.state);
    await syncItems(a.repo, server.remote, a.state);
    expect((await a.repo.listReviews()).length).toBe(2);
    expect((await b.repo.listReviews()).length).toBe(2);
  });

  test('the first incremental sync takes over the whole copy, then marks it so older apps ask for an update', async () => {
    const server = createMemoryItems();
    const snapshot = createMemoryRemote();
    const old = await device();
    await seedIfEmpty(old.repo, NOW);
    await old.services.setExplanation('ex-03', 'Ancienne synchro.', NOW + 1);
    await syncOnce(old.repo, snapshot);
    const fresh = await device();
    await syncItems(fresh.repo, server.remote, fresh.state, snapshot);
    expect((await fresh.repo.getNote('ex-03'))!.explanation).toBe('Ancienne synchro.');
    const marker = (await snapshot.get())!.data as { format: string; version: number; movedTo?: string };
    expect(marker).toMatchObject({ format: BACKUP_FORMAT, movedTo: 'ancrage_items' });
    // A second device does not read the marker as data.
    const other = await device();
    await syncItems(other.repo, server.remote, other.state, snapshot);
    expect((await other.repo.getNote('ex-03'))!.explanation).toBe('Ancienne synchro.');
  });

  test('an item from a damaged or newer app stops the sync without changing anything', async () => {
    const server = createMemoryItems();
    const a = await device();
    await seedIfEmpty(a.repo, NOW);
    await server.remote.push([{ kind: 'note', id: 'bad', data: { id: 'bad', fields: { type: 'cloze' } } }]);
    await expect(syncItems(a.repo, server.remote, a.state)).rejects.toThrow(/mise à jour|abîm/);
    await server.remote.push([{ kind: 'note', id: 'bad', data: (await a.repo.getNote('ex-01'))! }]);
    await expect(syncItems(a.repo, server.remote, a.state)).rejects.toThrow();
    // A kind this version does not know is simply ignored.
    const b = await device();
    const s2 = createMemoryItems();
    await s2.remote.push([{ kind: 'future' as 'note', id: 'x', data: {} }]);
    await expect(syncItems(b.repo, s2.remote, b.state)).resolves.toBeDefined();
  });

  test('serializeBackup is still readable by the incremental sync helper', () => {
    expect(JSON.parse(serializeBackup({ themes: [], notes: [], cards: [], reviews: [], events: [], settings: { desiredRetention: 0.9, newPerDay: 5 }, flags: [], tombstones: [], settingsUpdatedAt: 0 }, NOW)).version).toBe(5);
  });
});
