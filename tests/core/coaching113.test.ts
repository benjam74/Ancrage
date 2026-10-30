import { describe, expect, test } from 'vitest';
import { CONTRAST_INSTRUCTION, buildContrastSource, buildPrompt, MAX_SOURCE_CHARS } from '../../src/core/generate';
import { effectiveness } from '../../src/core/insights';
import type { Note, ReviewEntry } from '../../src/core/model';
import type { EntryKind } from '../../src/core/progress';

const note = (id: string, front: string, back: string): Note => ({ id, themeId: 't', fields: { type: 'basic', front, back, reverse: false }, tags: [], createdAt: 0, updatedAt: 0 });

describe('contrast cards', () => {
  test('the source lists the existing cards, one per block, within the size limit', () => {
    const src = buildContrastSource([note('a', 'Recadrage ?', 'Changer le sens.'), note('b', 'Reformulation ?', 'Redire avec ses mots.')]);
    expect(src).toContain('Question : Recadrage ?');
    expect(src).toContain('Question : Reformulation ?');
    const many = Array.from({ length: 2000 }, (_, i) => note(`n${i}`, `Question numéro ${i} assez longue pour remplir`, 'Réponse'));
    expect(buildContrastSource(many).length).toBeLessThanOrEqual(MAX_SOURCE_CHARS);
  });
  test('the instruction asks to tell close notions apart and explain the difference', () => {
    expect(CONTRAST_INSTRUCTION).toMatch(/confondre/);
    expect(CONTRAST_INSTRUCTION).toMatch(/distingue/);
    const { user } = buildPrompt({ source: 'x', themeName: 'Contrastes', types: ['classify', 'scenario', 'mcq'], count: 8, instruction: CONTRAST_INSTRUCTION });
    expect(user).toContain('Consigne : ');
  });
});

describe('confident errors', () => {
  const NOW = 100 * 86_400_000;
  const e = (id: string, correct: boolean, confident?: true): ReviewEntry => ({ id, cardId: 'c', ts: NOW - 86_400_000, rating: correct ? 3 : 1, mode: 'production', correct, durationMs: 3000, hintUsed: false, deviceId: 'd', ...(confident ? { confident } : {}) });
  test('counted over 30 days among answers marked sure', () => {
    const entries = [e('a', false, true), e('b', true, true), e('c', false), e('d', true, true)];
    const kinds = new Map<string, EntryKind>(entries.map((x) => [x.id, 'due']));
    expect(effectiveness(entries, kinds, () => 'basic', () => 'D', NOW).confident).toEqual({ sure: 3, wrong: 1 });
  });
});
