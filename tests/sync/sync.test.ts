import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { createServices, seedIfEmpty } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';
import { createMemoryRemote } from '../../src/sync/memory-remote';
import { syncOnce } from '../../src/sync/sync';
import { parseBackup } from '../../src/core/backup';

const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const ok = { kind: 'auto', correct: true, durationMs: 2000, hintUsed: false } as const;
const device = (name: string) => createServices(createDexieRepo(`${name}-${newId()}`), name);

describe('syncOnce', () => {
  test('the first device pushes, an empty second device pulls everything', async () => {
    const remote = createMemoryRemote();
    const a = device('a');
    await seedIfEmpty(a.repo, NOW);
    expect(await syncOnce(a.repo, remote)).toEqual({ pulled: false, pushed: true });
    const b = device('b');
    expect(await syncOnce(b.repo, remote)).toEqual({ pulled: true, pushed: false });
    expect(await b.repo.dumpAll()).toEqual(await a.repo.dumpAll());
  });

  test('two diverged devices converge after syncing in turn', async () => {
    const remote = createMemoryRemote();
    const a = device('a');
    await seedIfEmpty(a.repo, NOW);
    await syncOnce(a.repo, remote);
    const b = device('b');
    await syncOnce(b.repo, remote);

    for (const id of (await a.today(NOW)).queue.slice(0, 2)) await a.engine.answer(id, 'recognition', ok, NOW);
    const theme = (await b.repo.listThemes())[0];
    await b.saveNote({ themeId: theme.id, fields: { type: 'cloze', text: '{{sur B}}' }, tags: [] }, NOW + 5);

    await syncOnce(a.repo, remote);
    await syncOnce(b.repo, remote);
    await syncOnce(a.repo, remote);
    const [da, db] = await Promise.all([a.repo.dumpAll(), b.repo.dumpAll()]);
    expect(da).toEqual(db);
    expect(da.reviews).toHaveLength(2);
    expect(da.notes.some((n) => n.fields.type === 'cloze' && n.fields.text === '{{sur B}}')).toBe(true);
  });

  test('nothing to do pushes nothing', async () => {
    const remote = createMemoryRemote();
    const a = device('a');
    await seedIfEmpty(a.repo, NOW);
    await syncOnce(a.repo, remote);
    expect(await syncOnce(a.repo, remote)).toEqual({ pulled: false, pushed: false });
  });

  test('concurrent syncs from two devices lose nothing', async () => {
    const remote = createMemoryRemote({ latencyMs: 5 });
    const a = device('a');
    const b = device('b');
    await seedIfEmpty(a.repo, NOW);
    await syncOnce(a.repo, remote);
    await syncOnce(b.repo, remote);
    for (const id of (await a.today(NOW)).queue.slice(0, 2)) await a.engine.answer(id, 'recognition', ok, NOW);
    for (const id of (await b.today(NOW)).queue.slice(2, 4)) await b.engine.answer(id, 'recognition', ok, NOW + 1);

    await Promise.all([syncOnce(a.repo, remote), syncOnce(b.repo, remote)]);
    await syncOnce(a.repo, remote);
    await syncOnce(b.repo, remote);
    const remoteNow = parseBackup(JSON.stringify((await remote.get())?.data));
    expect(remoteNow.ok && remoteNow.dump.reviews).toHaveLength(4);
    expect((await a.repo.dumpAll()).reviews).toHaveLength(4);
    expect((await b.repo.dumpAll()).reviews).toHaveLength(4);
  });

  test('a persistent conflict gives up with an error, local data untouched', async () => {
    const a = device('a');
    await seedIfEmpty(a.repo, NOW);
    const before = await a.repo.dumpAll();
    const stubborn = { get: async () => null, put: async () => ({ ok: false as const, conflict: true as const }) };
    await expect(syncOnce(a.repo, stubborn)).rejects.toThrow(/conflit/);
    expect(await a.repo.dumpAll()).toEqual(before);
  });
});

describe('real multi-device use', () => {
  test('removed examples stay removed when a freshly seeded device joins', async () => {
    const remote = createMemoryRemote();
    const a = device('a');
    await seedIfEmpty(a.repo, NOW);
    await a.removeExamples();
    await syncOnce(a.repo, remote);
    const b = device('b');
    await seedIfEmpty(b.repo, NOW + 86_400_000);
    await syncOnce(b.repo, remote);
    await syncOnce(a.repo, remote);
    expect(await a.examplesCount()).toBe(0);
    expect(await b.examplesCount()).toBe(0);
    expect((await a.repo.listThemes()).length).toBe(0);
  });

  test('a remote snapshot from a newer version is refused with a French message', async () => {
    const a = device('a');
    await seedIfEmpty(a.repo, NOW);
    const before = await a.repo.dumpAll();
    const future = { get: async () => ({ data: { format: 'ancrage-backup', version: 99 }, version: 1 }), put: async () => ({ ok: true as const, version: 2 }) };
    await expect(syncOnce(a.repo, future)).rejects.toThrow(/plus récente/);
    expect(await a.repo.dumpAll()).toEqual(before);
  });

  test('a damaged remote snapshot is refused and local data is untouched', async () => {
    const a = device('a');
    await seedIfEmpty(a.repo, NOW);
    const before = await a.repo.dumpAll();
    const broken = { get: async () => ({ data: { format: 'ancrage-backup', version: 2, notes: 'oops' }, version: 1 }), put: async () => ({ ok: true as const, version: 2 }) };
    await expect(syncOnce(a.repo, broken)).rejects.toThrow(/abîmée|incomplète/);
    expect(await a.repo.dumpAll()).toEqual(before);
  });
});
