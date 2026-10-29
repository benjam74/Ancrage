import { describe, expect, test } from 'vitest';
import { buildExercise, expectedText, isCorrect, makeRng, type Exercise } from '../../src/core/exercise';
import type { Card, Mode, Note, NoteFields } from '../../src/core/model';

let n = 0;
const note = (fields: NoteFields, themeId = 't'): Note => ({ id: `n${n++}`, themeId, fields, tags: [], createdAt: 0, updatedAt: 0 });
const card = (noteOf: Note, variant: string): Card => ({ id: `${noteOf.id}-${variant}`, noteId: noteOf.id, variant });
const build = (nt: Note, variant: string, mode: Mode, pool: Note[] = [], seed = 's') =>
  buildExercise(nt, card(nt, variant), mode, pool, makeRng(seed));
const only = <K extends Exercise['kind']>(ex: Exercise, kind: K) => {
  expect(ex.kind).toBe(kind);
  return ex as Extract<Exercise, { kind: K }>;
};

const grow = note({ type: 'cloze', text: 'GROW : Goal, {{Reality}}, Options, {{Will}}' });

describe('cloze', () => {
  test('production hides the card gap and shows the others', () => {
    const ex = only(build(grow, 'reality', 'production'), 'typed');
    expect(ex).toMatchObject({ before: 'GROW : Goal, ', after: ', Options, Will', expected: 'Reality' });
  });

  test('the #2 variant hides the second occurrence', () => {
    const twice = note({ type: 'cloze', text: '{{X}} puis {{X}}' });
    expect(only(build(twice, 'x#2', 'production'), 'typed')).toMatchObject({ before: 'X puis ', after: '', expected: 'X' });
  });

  test('recognition never offers a distractor that is visible in the sentence', () => {
    const pool = [note({ type: 'cloze', text: '{{Goal}} et {{Options}}' }), note({ type: 'cloze', text: '{{Généralisation}} et {{Omission}}' })];
    const ex = build(grow, 'reality', 'recognition', pool);
    if (ex.kind === 'choice') {
      for (const visible of ['Goal', 'Options', 'Will']) expect(ex.options).not.toContain(visible);
    }
  });

  test('recognition offers 4 distinct options when enough distractors exist', () => {
    const pool = [note({ type: 'cloze', text: '{{Goal}} et {{Généralisation}}' }), note({ type: 'cloze', text: '{{Omission}} puis {{Distorsion}}' })];
    const ex = only(build(grow, 'reality', 'recognition', pool), 'choice');
    expect(ex.options).toHaveLength(4);
    expect(new Set(ex.options).size).toBe(4);
    expect(ex.options[ex.answerIndex]).toBe('Reality');
  });

  test('recognition falls back to typing with fewer than 2 distractors', () => {
    const alone = note({ type: 'cloze', text: 'Le {{recadrage}}' });
    expect(build(alone, 'recadrage', 'recognition').kind).toBe('typed');
  });
});

describe('ordering', () => {
  const steps = ['Contrat', 'Situation', 'Options', 'Plan', 'Engagement'];
  const seance = note({ type: 'ordering', title: 'Déroulé', steps });

  test('production shuffles every step', () => {
    const ex = only(build(seance, 'main', 'production'), 'order');
    expect(ex.given).toBe(0);
    expect([...ex.shuffled].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(ex.shuffled).not.toEqual([0, 1, 2, 3, 4]);
  });

  test('recognition gives the first step', () => {
    const ex = only(build(seance, 'main', 'recognition'), 'order');
    expect(ex.given).toBe(1);
    expect(ex.shuffled[0]).toBe(0);
  });

  test('isCorrect checks the full order', () => {
    const ex = build(seance, 'main', 'production');
    expect(isCorrect(ex, { kind: 'order', order: [0, 1, 2, 3, 4] })).toBe(true);
    expect(isCorrect(ex, { kind: 'order', order: [1, 0, 2, 3, 4] })).toBe(false);
    expect(expectedText(ex)).toBe('1. Contrat · 2. Situation · 3. Options · 4. Plan · 5. Engagement');
  });
});

describe('classify and mcq', () => {
  test('classify asks for the category of the statement', () => {
    const nt = note({ type: 'classify', statement: 'Il ne m’écoute jamais.', categories: ['Généralisation', 'Distorsion', 'Omission'], answer: 'generalisation' });
    const ex = only(build(nt, 'main', 'recognition'), 'choice');
    expect(ex.quote).toBe('Il ne m’écoute jamais.');
    expect(ex.options).toEqual(['Généralisation', 'Distorsion', 'Omission']);
    expect(ex.answerIndex).toBe(0);
  });

  test('mcq order is stable per seed and varies across seeds', () => {
    const nt = note({ type: 'mcq', question: 'Pourquoi ?', answer: 'Croyances', distractors: ['Environnement', 'Comportements', 'Capacités'] });
    const a = only(build(nt, 'main', 'recognition', [], 'seed-1'), 'choice');
    expect(only(build(nt, 'main', 'recognition', [], 'seed-1'), 'choice').options).toEqual(a.options);
    expect(a.options[a.answerIndex]).toBe('Croyances');
    const positions = new Set(Array.from({ length: 20 }, (_, i) => only(build(nt, 'main', 'recognition', [], `s${i}`), 'choice').answerIndex));
    expect(positions.size).toBeGreaterThanOrEqual(2);
  });

  test('an mcq without a usable distractor falls back to reveal', () => {
    expect(build(note({ type: 'mcq', question: 'Q', answer: 'A', distractors: [] }), 'main', 'recognition').kind).toBe('reveal');
    expect(build(note({ type: 'mcq', question: 'Q', answer: 'Été', distractors: ['ete '] }), 'main', 'recognition').kind).toBe('reveal');
  });

  test('a classify with a single category falls back to reveal', () => {
    const nt = note({ type: 'classify', statement: 'S', categories: ['Omission'], answer: 'Omission' });
    expect(build(nt, 'main', 'recognition').kind).toBe('reveal');
  });

  test('isCorrect compares the chosen index', () => {
    const ex = only(build(note({ type: 'mcq', question: 'Q', answer: 'A', distractors: ['B'] }), 'main', 'recognition'), 'choice');
    expect(isCorrect(ex, { kind: 'choice', index: ex.answerIndex })).toBe(true);
    expect(isCorrect(ex, { kind: 'choice', index: 1 - ex.answerIndex })).toBe(false);
  });
});

describe('basic and scenario', () => {
  const calibrer = note({ type: 'basic', front: 'Calibrer ?', back: 'Observer les signaux', reverse: true });
  const pool = ['Synchroniser', 'Recadrer', 'Ancrer'].map((b) => note({ type: 'basic', front: `Q ${b}`, back: b, reverse: false }));

  test('recognition picks among backs from the theme', () => {
    const ex = only(build(calibrer, 'front', 'recognition', pool), 'choice');
    expect(ex.prompt).toBe('Calibrer ?');
    expect(ex.options[ex.answerIndex]).toBe('Observer les signaux');
    expect(ex.options).toHaveLength(4);
  });

  test('self mode reveals the back, and the back variant swaps sides', () => {
    expect(only(build(calibrer, 'front', 'self'), 'reveal')).toMatchObject({ front: 'Calibrer ?', back: 'Observer les signaux' });
    expect(only(build(calibrer, 'back', 'self'), 'reveal')).toMatchObject({ front: 'Observer les signaux', back: 'Calibrer ?' });
  });

  test('recognition without 3 distractors falls back to reveal', () => {
    expect(build(calibrer, 'front', 'recognition', pool.slice(0, 2)).kind).toBe('reveal');
  });

  test('scenario reveals the model answer and key points', () => {
    const nt = note({ type: 'scenario', situation: 'Je dois réussir.', model: 'Que se passerait-il sinon ?', keyPoints: ['Modal de nécessité'] });
    expect(only(build(nt, 'main', 'self'), 'reveal')).toMatchObject({ quote: 'Je dois réussir.', back: 'Que se passerait-il sinon ?', keyPoints: ['Modal de nécessité'], coaching: true });
  });
});

describe('typed answers', () => {
  test('isCorrect uses tolerant checking and expectedText gives the answer', () => {
    const ex = build(grow, 'reality', 'production');
    expect(isCorrect(ex, { kind: 'typed', text: 'options' })).toBe(false);
    expect(isCorrect(ex, { kind: 'typed', text: 'realite' })).toBe(true);
    expect(isCorrect(ex, { kind: 'typed', text: 'reality' })).toBe(true);
    expect(expectedText(ex)).toBe('Reality');
  });
});
