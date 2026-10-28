import { describe, expect, test } from 'vitest';
import { checkChoice, checkOrder, checkTyped, normalizeAnswer } from '../../src/core/check';

describe('checkTyped', () => {
  test('ignores accents and case', () => {
    expect(checkTyped('realite', 'Réalité')).toBe(true);
  });

  test('ignores typographic apostrophes and surrounding spaces', () => {
    expect(checkTyped('  L’Omission ', "l'omission")).toBe(true);
  });

  test('accepts one edit when the expected answer has at least 6 letters', () => {
    expect(checkTyped('generalisaton', 'généralisation')).toBe(true);
  });

  test('rejects a transposition (distance 2)', () => {
    expect(checkTyped('generalisatoin', 'généralisation')).toBe(false);
  });

  test('has no typo tolerance under 6 letters', () => {
    expect(checkTyped('wil', 'Will')).toBe(false);
  });

  test('rejects an empty answer', () => {
    expect(checkTyped('', 'Will')).toBe(false);
  });
});

describe('checkTyped, French input', () => {
  test('accepts oe and ae for the œ and æ ligatures', () => {
    expect(checkTyped('coeur', 'cœur')).toBe(true);
    expect(checkTyped('oeuvre', 'Œuvre')).toBe(true);
    expect(checkTyped('ex aequo', 'ex æquo')).toBe(true);
  });

  test('ignores trailing punctuation', () => {
    expect(checkTyped('Paris.', 'Paris')).toBe(true);
    expect(checkTyped('Will', 'Will !')).toBe(true);
  });

  test('treats apostrophes and hyphens like spaces', () => {
    expect(checkTyped('l eau', "l'eau")).toBe(true);
    expect(checkTyped('meta modele', 'méta-modèle')).toBe(true);
    expect(checkTyped('lʼeau', "l'eau")).toBe(true);
  });

  test('typo tolerance counts letters, not spaces', () => {
    expect(checkTyped('a b c x', 'a b c d')).toBe(false);
  });
});

describe('checkOrder', () => {
  test('accepts the exact order', () => {
    expect(checkOrder([0, 1, 2, 3], 4)).toBe(true);
  });

  test('rejects a swapped order', () => {
    expect(checkOrder([1, 0, 2, 3], 4)).toBe(false);
  });

  test('rejects an incomplete order', () => {
    expect(checkOrder([0, 1, 2], 4)).toBe(false);
  });
});

describe('checkChoice', () => {
  test('compares normalized labels', () => {
    expect(checkChoice('Généralisation ', 'generalisation')).toBe(true);
  });
});

describe('normalizeAnswer', () => {
  test('collapses inner whitespace', () => {
    expect(normalizeAnswer('Croyances   et\tvaleurs')).toBe('croyances et valeurs');
  });

  test('maps ligatures, apostrophes, hyphens and trailing punctuation', () => {
    expect(normalizeAnswer("  L’Œuvre d'art-total ! ")).toBe('l oeuvre d art total');
  });
});
