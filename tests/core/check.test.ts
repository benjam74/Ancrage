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
});
