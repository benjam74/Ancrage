import { describe, expect, test } from 'vitest';
import { cardVariants, clozeGaps } from '../../src/core/cards';

describe('cardVariants', () => {
  test('basic note yields the front card only', () => {
    expect(cardVariants({ type: 'basic', front: 'Q', back: 'A', reverse: false })).toEqual(['front']);
  });

  test('basic note with reverse yields front and back cards', () => {
    expect(cardVariants({ type: 'basic', front: 'Q', back: 'A', reverse: true })).toEqual(['front', 'back']);
  });

  test('cloze yields one variant per gap, keyed by gap text', () => {
    const text = "La {{généralisation}}, la {{distorsion}} et l'{{omission}}.";
    expect(cardVariants({ type: 'cloze', text })).toEqual(['généralisation', 'distorsion', 'omission']);
  });

  test('inserting a gap before existing ones keeps their variants', () => {
    const before = cardVariants({ type: 'cloze', text: 'La {{généralisation}} et la {{distorsion}}.' });
    const after = cardVariants({ type: 'cloze', text: '{{Le méta-modèle}} : la {{généralisation}} et la {{distorsion}}.' });
    expect(after).toEqual(expect.arrayContaining(before));
    expect(after).toEqual(['le méta-modèle', 'généralisation', 'distorsion']);
  });

  test('duplicate gaps get an occurrence suffix', () => {
    expect(cardVariants({ type: 'cloze', text: '{{X}} puis {{ x }}' })).toEqual(['x', 'x#2']);
  });

  test('cloze without a usable gap yields no card', () => {
    expect(cardVariants({ type: 'cloze', text: 'Aucun trou ici' })).toEqual([]);
    expect(cardVariants({ type: 'cloze', text: 'Trou vide {{   }}' })).toEqual([]);
  });

  test('single-card note types yield one main variant', () => {
    expect(cardVariants({ type: 'ordering', title: 'T', steps: ['a', 'b'] })).toEqual(['main']);
    expect(cardVariants({ type: 'classify', statement: 'S', categories: ['a', 'b'], answer: 'a' })).toEqual(['main']);
    expect(cardVariants({ type: 'mcq', question: 'Q', answer: 'a', distractors: ['b'] })).toEqual(['main']);
    expect(cardVariants({ type: 'scenario', situation: 'S', model: 'M', keyPoints: [] })).toEqual(['main']);
  });
});

describe('clozeGaps', () => {
  test('returns raw gap texts in order', () => {
    expect(clozeGaps('A {{Reality}} B {{ Will }}')).toEqual(['Reality', 'Will']);
  });
});
