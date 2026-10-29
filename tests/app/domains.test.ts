import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { createServices, ensureDomains, seedIfEmpty } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';
import { DEFAULT_DOMAIN_ID, groupByDomain } from '../../src/core/domains';
import { mergeDumps } from '../../src/core/merge';

const NOW = new Date(2026, 9, 30, 10, 0).getTime();
const fresh = () => createServices(createDexieRepo(`dom-${newId()}`), 'd');

describe('domains in a profile', () => {
  test('the coaching examples end up in « Coaching et PNL », once', async () => {
    const s = fresh();
    await seedIfEmpty(s.repo, NOW);
    expect(await ensureDomains(s.repo)).toBe(true);
    expect(await ensureDomains(s.repo)).toBe(false);
    const themes = await s.repo.listThemes();
    expect(themes.filter((t) => t.kind === 'domain').map((t) => t.id)).toEqual([DEFAULT_DOMAIN_ID]);
    expect(groupByDomain(themes).map((g) => g.domain?.id)).toEqual([DEFAULT_DOMAIN_ID]);
    expect((await s.progress(NOW)).themes.length).toBe(5);
  });

  test('two devices migrating separately merge into one domain', async () => {
    const a = fresh();
    const b = fresh();
    for (const s of [a, b]) await seedIfEmpty(s.repo, NOW);
    await ensureDomains(a.repo);
    await ensureDomains(b.repo);
    const merged = mergeDumps(await a.repo.dumpAll(), await b.repo.dumpAll());
    expect(merged.themes.filter((t) => t.kind === 'domain')).toHaveLength(1);
    expect(groupByDomain(merged.themes).map((g) => g.domain?.id)).toEqual([DEFAULT_DOMAIN_ID]);
  });

  test('a device migrating late never undoes a move or rename made elsewhere', async () => {
    const a = fresh();
    await seedIfEmpty(a.repo, NOW);
    await ensureDomains(a.repo);
    const b = fresh();
    await b.repo.restoreAll(await a.repo.dumpAll());
    const maths = await a.createDomain('Maths');
    await a.moveTheme('ex-dilts', maths.id);
    await a.renameTheme('ex-dilts', 'Renommé');
    // B was still on the old version: its themes have no domain yet, then it migrates on update.
    const stale = await b.repo.dumpAll();
    stale.themes = stale.themes.filter((t) => t.kind !== 'domain').map(({ parentId: _p, ...t }) => t);
    await b.repo.restoreAll(stale);
    await ensureDomains(b.repo);
    const merged = mergeDumps(await a.repo.dumpAll(), await b.repo.dumpAll());
    const dilts = merged.themes.find((t) => t.id === 'ex-dilts')!;
    expect([dilts.name, dilts.parentId]).toEqual(['Renommé', maths.id]);
  });

  test('the 5e examples need no migration and are removable', async () => {
    const s = fresh();
    await seedIfEmpty(s.repo, NOW, 'college5');
    expect(await ensureDomains(s.repo)).toBe(false);
    expect((await s.today(NOW)).fresh).toBe(5);
    const res = await s.removeExamples();
    expect(res.notes).toBeGreaterThanOrEqual(55);
    // Subjects and chapters stay for the pupil's own cards.
    expect((await s.repo.listThemes()).length).toBe(18);
  });

  test('an empty start, then a domain, a theme in it, and a move', async () => {
    const s = fresh();
    await seedIfEmpty(s.repo, NOW, 'none');
    expect(await s.repo.listNotes()).toEqual([]);
    const maths = await s.createDomain('Mathématiques');
    const fr = await s.createDomain('Français');
    const t = await s.createTheme('Fractions', maths.id);
    expect(t.parentId).toBe(maths.id);
    await s.moveTheme(t.id, fr.id);
    expect((await s.repo.listThemes()).find((x) => x.id === t.id)?.parentId).toBe(fr.id);
    expect((await s.deleteTheme(fr.id)).ok).toBe(false);
  });
});
