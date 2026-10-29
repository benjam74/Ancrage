import { describe, expect, test } from 'vitest';
import { cleanMarkdown, splitDocument, splitLong } from '../../src/core/importdoc';

describe('cleanMarkdown', () => {
  test('drops the YAML header and reduces wiki links to their text', () => {
    const md = '---\ntags: [pnl]\naliases: x\n---\nVoir [[Ancrage]] et [[Recadrage|le recadrage]], ou ![[image.png]].';
    expect(cleanMarkdown(md)).toBe('Voir Ancrage et le recadrage, ou .');
  });
  test('keeps a horizontal rule that is not a header', () => {
    expect(cleanMarkdown('Texte\n---\nSuite')).toBe('Texte\n---\nSuite');
  });
});

describe('splitDocument', () => {
  test('splits Markdown by level 1 and 2 headings, level 3 stays inside', () => {
    const md = '# Ancrage\nIntro.\n## Étapes\n1. Calibrer\n### Détail\nPrécision.\n# Recadrage\nSens.';
    const s = splitDocument('pnl.md', md);
    expect(s.map((x) => x.title)).toEqual(['Ancrage', 'Étapes', 'Recadrage']);
    expect(s[1].text).toContain('### Détail');
    expect(s[1].text).toContain('Précision.');
    expect(s.every((x) => x.file === 'pnl.md')).toBe(true);
    expect(new Set(s.map((x) => x.id)).size).toBe(3);
  });
  test('text before the first heading becomes a section named after the file', () => {
    const s = splitDocument('Notes de stage.md', 'Préambule utile.\n# Partie\nContenu.');
    expect(s.map((x) => x.title)).toEqual(['Notes de stage', 'Partie']);
  });
  test('a file without headings is one section; empty sections are skipped', () => {
    expect(splitDocument('a.md', 'Juste du texte.').map((x) => x.title)).toEqual(['a']);
    expect(splitDocument('b.md', '# Vide\n\n# Plein\nOui.').map((x) => x.title)).toEqual(['Plein']);
    expect(splitDocument('c.md', '# Titre seul')).toEqual([]);
    expect(splitDocument('d.md', '---\ntags: x\n---\n')).toEqual([]);
  });
  test('an empty YAML header, a title ending in #, and mixed fences', () => {
    expect(splitDocument('y.md', '---\n---\n# Titre\nTexte.').map((x) => x.title)).toEqual(['Titre']);
    expect(splitDocument('c.md', '# Langage C#\nTexte.\n## Fin ##\nOui.').map((x) => x.title)).toEqual(['Langage C#', 'Fin']);
    const s = splitDocument('f.md', '# Un\n```\n~~~\n# dedans\n```\n# Deux\nFin.');
    expect(s.map((x) => x.title)).toEqual(['Un', 'Deux']);
  });
  test('a heading inside a code block does not split', () => {
    const s = splitDocument('e.md', '# Un\n```\n# pas un titre\n```\nFin.');
    expect(s.map((x) => x.title)).toEqual(['Un']);
  });
  test('plain text and PDF text are one block per file', () => {
    expect(splitDocument('cours.txt', '# pas un titre\nTexte.')).toEqual([{ id: 'cours.txt#0', file: 'cours.txt', title: 'cours', text: '# pas un titre\nTexte.' }]);
    expect(splitDocument('livre.pdf', 'Page 1').map((x) => x.title)).toEqual(['livre']);
  });
});

describe('splitLong', () => {
  test('cuts a long section on paragraph ends into numbered parts', () => {
    const para = 'x'.repeat(400);
    const text = Array.from({ length: 10 }, () => para).join('\n\n');
    const parts = splitLong([{ id: 'f#0', file: 'f.md', title: 'Long', text }], 1000);
    expect(parts.length).toBe(5);
    expect(parts.map((p) => p.title)).toEqual(['Long (1/5)', 'Long (2/5)', 'Long (3/5)', 'Long (4/5)', 'Long (5/5)']);
    expect(parts.every((p) => p.text.length <= 1000)).toBe(true);
    expect(parts.map((p) => p.text).join('\n\n')).toBe(text);
    expect(new Set(parts.map((p) => p.id)).size).toBe(5);
  });
  test('a paragraph longer than the limit is cut hard', () => {
    const parts = splitLong([{ id: 'f#0', file: 'f', title: 'T', text: 'y'.repeat(2500) }], 1000);
    expect(parts.map((p) => p.text.length)).toEqual([1000, 1000, 500]);
  });
  test('short sections are kept as they are', () => {
    const s = [{ id: 'a', file: 'a', title: 'A', text: 'court' }];
    expect(splitLong(s, 1000)).toEqual(s);
  });
});
