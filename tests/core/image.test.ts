import { describe, expect, test } from 'vitest';
import { cardVariants } from '../../src/core/cards';
import { validateFields } from '../../src/core/validate';
import { draftToFields, emptyDraft, fieldsToDraft } from '../../src/core/draft';
import type { NoteFields } from '../../src/core/model';

const IMG = 'data:image/webp;base64,AAAA';
const mask = (id: string, label = '', x = 0.1, y = 0.1, w = 0.2, h = 0.1) => ({ id, x, y, w, h, label });
const note = (over: Partial<Extract<NoteFields, { type: 'image' }>> = {}): NoteFields => ({ type: 'image', title: 'Le cœur', image: IMG, masks: [mask('a', 'Oreillette droite'), mask('b', 'Ventricule gauche', 0.5)], ...over });

describe('image notes', () => {
  test('one card per zone, keyed by zone id', () => {
    expect(cardVariants(note())).toEqual(['a', 'b']);
  });
  test('valid with an image and zones inside it; the title and labels are optional', () => {
    expect(validateFields(note())).toEqual({});
    expect(validateFields(note({ title: '', masks: [mask('a')] }))).toEqual({});
  });
  test('needs an image and at least one zone', () => {
    expect(validateFields(note({ image: '' }))).toHaveProperty('image');
    expect(validateFields(note({ image: 'https://x/y.png' }))).toHaveProperty('image');
    expect(validateFields(note({ masks: [] }))).toHaveProperty('masks');
  });
  test('zones must lie inside the image, not be tiny, have distinct ids and labels', () => {
    expect(validateFields(note({ masks: [mask('a', '', 0.9, 0.1, 0.2, 0.1)] }))).toHaveProperty('masks');
    expect(validateFields(note({ masks: [mask('a', '', 0.1, 0.1, 0.01, 0.1)] }))).toHaveProperty('masks');
    expect(validateFields(note({ masks: [mask('a'), mask('a', '', 0.5)] }))).toHaveProperty('masks');
    expect(validateFields(note({ masks: [mask('a', 'Aorte'), mask('b', 'aorte', 0.5)] }))).toHaveProperty('masks');
  });
  test('draft round trip keeps the image and zones', () => {
    const f = note();
    expect(draftToFields('image', fieldsToDraft(f))).toEqual(f);
    expect(draftToFields('image', emptyDraft('image'))).toEqual({ type: 'image', title: '', image: '', masks: [] });
  });
  test('a damaged masks draft gives no zones instead of crashing', () => {
    expect(draftToFields('image', { title: '', image: IMG, masks: '{oops' })).toMatchObject({ masks: [] });
  });
});

describe('image exercises', async () => {
  const { buildExercise, makeRng, isCorrect } = await import('../../src/core/exercise');
  const mk = (fields: NoteFields) => ({ id: 'n', themeId: 't', fields, tags: [], createdAt: 0, updatedAt: 0 });
  const three = note({ masks: [mask('a', 'Aorte'), mask('b', 'Ventricule gauche', 0.5), mask('c', 'Oreillette droite', 0.1, 0.5)] });
  const card = (variant: string) => ({ id: `c-${variant}`, noteId: 'n', variant });

  test('a young zone is a choice among the other answers, with the image and the target', () => {
    const ex = buildExercise(mk(three), card('b'), 'recognition', [], makeRng('x'));
    expect(ex.kind).toBe('choice');
    if (ex.kind !== 'choice') return;
    expect(ex.options[ex.answerIndex]).toBe('Ventricule gauche');
    expect(ex.options).toHaveLength(3);
    expect(ex.figure).toMatchObject({ src: IMG, target: 'b' });
    expect(ex.figure!.masks).toHaveLength(3);
    expect(ex.prompt).toBe('Le cœur');
  });
  test('a solid zone asks to type the answer', () => {
    const ex = buildExercise(mk(three), card('a'), 'production', [], makeRng('x'));
    expect(ex).toMatchObject({ kind: 'typed', expected: 'Aorte', figure: { target: 'a' } });
    expect(isCorrect(ex, { kind: 'typed', text: 'aorte' })).toBe(true);
  });
  test('too few other answers: typed even when young; distractors may come from other images of the theme', () => {
    expect(buildExercise(mk(note()), card('a'), 'recognition', [], makeRng('x')).kind).toBe('typed');
    const other = mk(note({ masks: [mask('z', 'Veine cave'), mask('y', 'Artère pulmonaire', 0.5)] }));
    expect(buildExercise(mk(note()), card('a'), 'recognition', [{ ...other, id: 'o' }], makeRng('x')).kind).toBe('choice');
  });
  test('a zone without answer is revealed and self-graded; no title gives a default prompt', () => {
    const ex = buildExercise(mk(note({ title: '', masks: [mask('a')] })), card('a'), 'production', [], makeRng('x'));
    expect(ex).toMatchObject({ kind: 'reveal', prompt: 'Que cache la zone\u202f?', figure: { target: 'a' } });
  });
});
