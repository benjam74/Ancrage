import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { createServices, seedIfEmpty } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';
import { parseBackup } from '../../src/core/backup';

const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const ok = { kind: 'auto', correct: true, durationMs: 2000, hintUsed: false } as const;

async function richServices() {
  const services = createServices(createDexieRepo(`backup-${newId()}`), 'device-a');
  await seedIfEmpty(services.repo, NOW);
  const t = await services.createTheme('Perso');
  const note = await services.saveNote({ themeId: t.id, fields: { type: 'cloze', text: '{{a}} {{b}}' }, tags: ['x'] }, NOW);
  if (!note.ok) throw new Error('setup');
  for (const id of (await services.today(NOW)).queue) await services.engine.answer(id, 'recognition', ok, NOW);
  const [a] = await services.repo.listCards(note.note.id);
  await services.engine.answer(a.id, 'recognition', ok, NOW + 1);
  await services.saveNote({ id: note.note.id, themeId: t.id, fields: { type: 'cloze', text: '{{b}}' }, tags: [] }, NOW + 2); // orphan with history
  await services.completeRound(NOW - 1, NOW + 3);
  await services.repo.putSettings({ desiredRetention: 0.85, newPerDay: 7 });
  return services;
}

describe('backup round trip', () => {
  test('export then import into an empty database restores everything, streak and XP included', async () => {
    const source = await richServices();
    const { text, fileName } = await source.exportBackup(NOW + 10);
    expect(fileName).toBe('ancrage-2026-10-28.json');
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);

    const target = createServices(createDexieRepo(`restore-${newId()}`), 'device-b');
    await target.importBackup(parsed.dump);
    expect(await target.repo.dumpAll()).toEqual(await source.repo.dumpAll());
    const [p1, p2] = await Promise.all([source.progress(NOW + 20), target.progress(NOW + 20)]);
    expect(p2).toEqual(p1);
    expect(await seedIfEmpty(target.repo, NOW)).toBe(false);
  });

  test('import replaces existing data', async () => {
    const source = await richServices();
    const parsed = parseBackup((await source.exportBackup(NOW)).text);
    if (!parsed.ok) throw new Error(parsed.error);
    const target = createServices(createDexieRepo(`replace-${newId()}`), 'device-b');
    const t = await target.createTheme('À écraser');
    await target.importBackup(parsed.dump);
    expect((await target.repo.listThemes()).some((x) => x.id === t.id)).toBe(false);
  });

  test('a failing restore leaves the original data intact', async () => {
    const services = await richServices();
    const before = await services.repo.dumpAll();
    const broken = { ...before, reviews: [...before.reviews, before.reviews[0]] };
    await expect(services.importBackup(broken)).rejects.toThrow();
    expect(await services.repo.dumpAll()).toEqual(before);
  });
});

describe('merging a backup file', () => {
  test('two devices that diverged end with everything after merging each other', async () => {
    const origin = await richServices();
    const start = parseBackup((await origin.exportBackup(NOW)).text);
    if (!start.ok) throw new Error(start.error);
    const a = createServices(createDexieRepo(`dev-a-${newId()}`), 'device-a');
    const b = createServices(createDexieRepo(`dev-b-${newId()}`), 'device-b');
    await a.importBackup(start.dump);
    await b.importBackup(start.dump);

    // A reviews tomorrow; B creates a note and plays a round.
    const tomorrow = NOW + 86_400_000;
    for (const id of (await a.today(tomorrow)).queue.slice(0, 3)) await a.engine.answer(id, 'recognition', ok, tomorrow);
    await a.completeRound(tomorrow - 1, tomorrow + 1);
    const theme = (await b.repo.listThemes())[0];
    await b.saveNote({ themeId: theme.id, fields: { type: 'basic', front: 'Sur B', back: 'R', reverse: false }, tags: [] }, tomorrow + 5);

    const fromB = parseBackup((await b.exportBackup(tomorrow + 10)).text);
    if (!fromB.ok) throw new Error(fromB.error);
    await a.mergeBackup(fromB.dump);
    const fromA = parseBackup((await a.exportBackup(tomorrow + 20)).text);
    if (!fromA.ok) throw new Error(fromA.error);
    await b.mergeBackup(fromA.dump);

    const [da, db] = await Promise.all([a.repo.dumpAll(), b.repo.dumpAll()]);
    expect(da).toEqual(db);
    expect(da.notes.some((n) => n.fields.type === 'basic' && n.fields.front === 'Sur B')).toBe(true);
    const [pa, pb] = await Promise.all([a.progress(tomorrow + 30), b.progress(tomorrow + 30)]);
    expect(pa.streak).toBe(2);
    expect(pb).toEqual(pa);
  });

  test('merging the same backup twice changes nothing', async () => {
    const a = await richServices();
    const parsed = parseBackup((await a.exportBackup(NOW)).text);
    if (!parsed.ok) throw new Error(parsed.error);
    const before = await a.repo.dumpAll();
    await a.mergeBackup(parsed.dump);
    await a.mergeBackup(parsed.dump);
    expect(await a.repo.dumpAll()).toEqual(before);
  });
});
