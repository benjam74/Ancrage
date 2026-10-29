import { describe, expect, test } from 'vitest';
import { spokenText } from '../../src/core/speech';

describe('spokenText', () => {
  test('reads the question, then the answer', () => {
    const ex = { kind: 'reveal', prompt: 'Rappelle-toi la réponse', front: 'to go', back: 'aller', keyPoints: [] } as const;
    expect(spokenText(ex, false)).toBe('to go');
    expect(spokenText(ex, true)).toBe('aller');
  });
  test('a choice reads its options, numbered; a cloze reads around the gap', () => {
    expect(spokenText({ kind: 'choice', prompt: 'Q', options: ['a', 'b'], answerIndex: 0 }, false)).toBe('Q. 1. a. 2. b');
    expect(spokenText({ kind: 'typed', prompt: 'Complète', before: 'I ', after: ' home', expected: 'go' }, false)).toBe('I … home');
    expect(spokenText({ kind: 'typed', prompt: 'Complète', before: 'I ', after: ' home', expected: 'go' }, true)).toBe('go');
  });
  test('a scenario reads what the client says', () => {
    expect(spokenText({ kind: 'reveal', prompt: 'Ton client te dit :', quote: 'Je bloque.', front: 'Quelle question ?', back: 'M', keyPoints: [] }, false)).toBe('Je bloque.');
  });
});
