import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { createServices, ensureDomains, seedIfEmpty } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';
import { DEFAULT_DOMAIN_ID } from '../../src/core/domains';
import { mergeDumps } from '../../src/core/merge';

const NOW = new Date(2026, 9, 30, 10, 0).getTime();
const fresh = () => createServices(createDexieRepo(`dom-${newId()}`), 'd');

describe('domains in a profile', () => {
  test('the coaching examples end up in « Coaching et PNL », once', async () => {
    const s = fresh();
    await seedIfEmpty(s.repo, NOW);
    expect(await ensureDomains(s.repo, NOW)).toBe(true);
    expect(await ensureDomains(s.repo, NOW + 1)).toBe(false);
    const themes = await s.repo.listThemes();
    expect(themes.filter((t) => t.kind === 'domain').map((t) => t.id)).toEqual([DEFAULT_DOMAIN_ID]);
    expect(themes.filter((t) => t.kind !== 'domain').every((t) => t.parentId === DEFAULT_DOMAIN_ID)).toBe(true);
    expect((await s.progress(NOW)).themes.length).toBe(5);
  });

  test('two devices migrating separately merge into one domain', async () => {
    const a = fresh();
    const b = fresh();
    for (const s of [a, b]) await seedIfEmpty(s.repo, NOW);
    await ensureDomains(a.repo, NOW);
    await ensureDomains(b.repo, NOW + 5000);
    const merged = mergeDumps(await a.repo.dumpAll(), await b.repo.dumpAll());
    expect(merged.themes.filter((t) => t.kind === 'domain')).toHaveLength(1);
    expect(merged.themes.filter((t) => t.kind !== 'domain').every((t) => t.parentId === DEFAULT_DOMAIN_ID)).toBe(true);
  });

  test('the 5e examples need no migration and are removable', async () => {
    const s = fresh();
    await seedIfEmpty(s.repo, NOW, 'college5');
    expect(await ensureDomains(s.repo, NOW)).toBe(false);
    expect((await s.today(NOW)).fresh).toBe(5);
    const res = await s.removeExamples();
    expect(res.notes).toBeGreaterThanOrEqual(55);
    expect(await s.repo.listThemes()).toEqual([]);
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
