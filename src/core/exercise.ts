import { cardVariants } from './cards';
import { checkChoice, checkOrder, checkTyped, normalizeAnswer } from './check';
import type { Card, Mask, Mode, Note } from './model';

/** An image with its zones; `target` is the zone to find, hidden and marked with « ? ». */
export interface Figure {
  src: string;
  masks: Mask[];
  target: string;
}

export type Exercise =
  | { kind: 'choice'; prompt: string; quote?: string; options: string[]; answerIndex: number; explain?: string; figure?: Figure }
  | { kind: 'typed'; prompt: string; before: string; after: string; expected: string; figure?: Figure }
  | { kind: 'order'; prompt: string; steps: string[]; shuffled: number[]; given: number }
  | { kind: 'reveal'; prompt: string; quote?: string; front: string; back: string; keyPoints: string[]; /** A coaching scenario, whose written answer the AI can assess. */ coaching?: true; figure?: Figure };

export type Answer = { kind: 'choice'; index: number } | { kind: 'typed'; text: string } | { kind: 'order'; order: number[] };

/** Deterministic PRNG (xmur3 seed + mulberry32), so a given display keeps the same option order. */
export function makeRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Distinct candidates (by normalized text), excluding the answer, at most `max`, randomly picked. */
function pickDistractors(answer: string, candidates: string[], max: number, rng: () => number): string[] {
  const seen = new Set([normalizeAnswer(answer)]);
  const unique = candidates.filter((c) => {
    const key = normalizeAnswer(c);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return shuffle(unique, rng).slice(0, max);
}

function choice(prompt: string, answer: string, distractors: string[], rng: () => number, quote?: string): Exercise {
  const options = shuffle([answer, ...distractors], rng);
  return { kind: 'choice', prompt, quote, options, answerIndex: options.indexOf(answer) };
}

const GAP = /\{\{(.*?)\}\}/g;
const unwrap = (s: string) => s.replace(GAP, (_, g: string) => g.trim());

function clozeExercise(text: string, variant: string, mode: Mode, pool: Note[], rng: () => number): Exercise {
  const variants = cardVariants({ type: 'cloze', text });
  const target = variants.indexOf(variant);
  const gaps = [...text.matchAll(GAP)].filter((m) => m[1].trim().length > 0);
  const m = gaps[target] ?? gaps[0];
  const expected = m[1].trim();
  const before = unwrap(text.slice(0, m.index));
  const after = unwrap(text.slice(m.index! + m[0].length));

  if (mode === 'recognition') {
    // A distractor already printed in the sentence could be ruled out by elimination.
    const words = (text: string) => normalizeAnswer(text).replace(/[^a-z0-9]+/g, ' ').trim();
    const visible = ` ${words(`${before} ${after}`)} `;
    const hidden = (candidate: string) => !visible.includes(` ${words(candidate)} `);
    const others = [
      ...gaps.map((g) => g[1].trim()),
      ...pool.flatMap((n) => (n.fields.type === 'cloze' ? [...n.fields.text.matchAll(GAP)].map((g) => g[1].trim()) : [])),
    ];
    const distractors = pickDistractors(expected, others.filter(hidden), 3, rng);
    if (distractors.length >= 2) return choice('Complète', expected, distractors, rng, `${before}____${after}`);
  }
  return { kind: 'typed', prompt: 'Complète', before, after, expected };
}

function permutation(length: number, fixed: number, rng: () => number): number[] {
  const head = Array.from({ length: fixed }, (_, i) => i);
  const tail = Array.from({ length: length - fixed }, (_, i) => i + fixed);
  let mixed = shuffle(tail, rng);
  if (mixed.length > 1 && mixed.every((v, i) => v === tail[i])) mixed = [...mixed].reverse();
  return [...head, ...mixed];
}

export function buildExercise(note: Note, card: Card, mode: Mode, pool: Note[], rng: () => number): Exercise {
  const f = note.fields;
  switch (f.type) {
    case 'cloze':
      return clozeExercise(f.text, card.variant, mode, pool, rng);
    case 'ordering': {
      const given = mode === 'recognition' ? 1 : 0;
      return { kind: 'order', prompt: f.title, steps: f.steps, shuffled: permutation(f.steps.length, given, rng), given };
    }
    case 'classify': {
      const answerIndex = f.categories.findIndex((c) => checkChoice(c, f.answer));
      if (answerIndex < 0 || f.categories.length < 2) {
        return { kind: 'reveal', prompt: 'À quelle catégorie appartient cette phrase ?', quote: f.statement, front: f.statement, back: f.answer, keyPoints: [] };
      }
      return { kind: 'choice', prompt: 'À quelle catégorie appartient cette phrase ?', quote: f.statement, options: f.categories, answerIndex };
    }
    case 'mcq': {
      const distractors = pickDistractors(f.answer, f.distractors, f.distractors.length, rng);
      if (distractors.length === 0) return { kind: 'reveal', prompt: 'Rappelle-toi la réponse', front: f.question, back: f.answer, keyPoints: [] };
      return choice(f.question, f.answer, distractors, rng);
    }
    case 'basic': {
      const reversed = card.variant === 'back';
      const front = reversed ? f.back : f.front;
      const back = reversed ? f.front : f.back;
      if (mode === 'recognition') {
        const sides = pool.flatMap((n) => (n.fields.type === 'basic' ? [reversed ? n.fields.front : n.fields.back] : []));
        const distractors = pickDistractors(back, sides, 3, rng);
        if (distractors.length >= 3) return choice(front, back, distractors, rng);
      }
      return { kind: 'reveal', prompt: 'Rappelle-toi la réponse', front, back, keyPoints: [] };
    }
    case 'scenario':
      return { kind: 'reveal', prompt: 'Ton client te dit :', quote: f.situation, front: 'Quelle question poses-tu ?', back: f.model, keyPoints: f.keyPoints, coaching: true };
    case 'image': {
      const target = f.masks.find((m) => m.id === card.variant) ?? f.masks[0];
      const figure: Figure = { src: f.image, masks: f.masks, target: target.id };
      const prompt = f.title.trim() || 'Que cache la zone\u202f?';
      if (!target.label) return { kind: 'reveal', prompt, front: 'Rappelle-toi ce que cache la zone, puis découvre-la.', back: 'Compare avec l’image découverte.', keyPoints: [], figure };
      if (mode === 'recognition') {
        const others = [
          ...f.masks.map((m) => m.label),
          ...pool.flatMap((n) => (n.fields.type === 'image' ? n.fields.masks.map((m) => m.label) : [])),
        ];
        const distractors = pickDistractors(target.label, others, 3, rng);
        if (distractors.length >= 2) return { ...choice(prompt, target.label, distractors, rng), figure } as Exercise;
      }
      return { kind: 'typed', prompt, before: '', after: '', expected: target.label, figure };
    }
  }
}

export function isCorrect(ex: Exercise, answer: Answer): boolean {
  if (ex.kind === 'choice' && answer.kind === 'choice') return answer.index === ex.answerIndex;
  if (ex.kind === 'typed' && answer.kind === 'typed') return checkTyped(answer.text, ex.expected);
  if (ex.kind === 'order' && answer.kind === 'order') return checkOrder(answer.order, ex.steps.length);
  return false;
}

export function expectedText(ex: Exercise): string {
  switch (ex.kind) {
    case 'choice':
      return ex.options[ex.answerIndex];
    case 'typed':
      return ex.expected;
    case 'order':
      return ex.steps.map((s, i) => `${i + 1}. ${s}`).join(' · ');
    case 'reveal':
      return ex.back;
  }
}
