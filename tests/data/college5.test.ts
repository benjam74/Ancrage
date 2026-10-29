import { describe, expect, test } from 'vitest';
import { isDomain } from '../../src/core/domains';
import { validateFields } from '../../src/core/validate';
import { COLLEGE5_THEMES, college5Notes } from '../../src/data/college5';

describe('Collège 5e examples', () => {
  const notes = college5Notes(0);

  test('6 subjects as domains, every chapter in one of them', () => {
    const domains = COLLEGE5_THEMES.filter(isDomain);
    expect(domains.map((x) => x.name)).toEqual(['Mathématiques', 'Français', 'Histoire-géographie', 'SVT', 'Physique-chimie', 'Anglais']);
    const ids = new Set(domains.map((x) => x.id));
    for (const c of COLLEGE5_THEMES.filter((x) => !isDomain(x))) expect(ids.has(c.parentId!), c.id).toBe(true);
  });

  test('every card is valid, in a chapter, never a coaching scenario', () => {
    const chapters = new Set(COLLEGE5_THEMES.filter((x) => !isDomain(x)).map((x) => x.id));
    expect(notes.length).toBeGreaterThanOrEqual(55);
    for (const n of notes) {
      expect(validateFields(n.fields), n.id).toEqual({});
      expect(chapters.has(n.themeId), n.id).toBe(true);
      expect(n.fields.type).not.toBe('scenario');
    }
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
  });
});
