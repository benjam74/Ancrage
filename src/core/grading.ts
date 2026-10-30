import { State } from 'ts-fsrs';
import type { Mode, NoteType, Rating } from './model';

export const RECOGNITION_MAX_STABILITY = 7;
export const MIN_SAMPLES = 5;
export const DURATION_MIN_MS = 300;
export const DURATION_MAX_MS = 600_000;
const BASIC_MIN_DISTRACTORS = 3;

export type Outcome =
  /** `confident`: the learner said they were sure before checking (hypercorrection). */
  | { kind: 'auto'; correct: boolean; durationMs: number; hintUsed: boolean; confident?: boolean }
  | { kind: 'self'; grade: 1 | 2 | 3 };

function isYoung(card: { state: State; stability: number }): boolean {
  return card.state !== State.Review || card.stability < RECOGNITION_MAX_STABILITY;
}

/** Difficulty follows memory: young cards are recognized, solid ones are produced. */
export function selectMode(
  type: NoteType,
  card: { state: State; stability: number },
  opts: { basicDistractors: number } = { basicDistractors: 0 },
): Mode {
  switch (type) {
    case 'mcq':
      return 'recognition';
    case 'scenario':
      return 'self';
    case 'basic':
      return isYoung(card) && opts.basicDistractors >= BASIC_MIN_DISTRACTORS ? 'recognition' : 'self';
    default:
      return isYoung(card) ? 'recognition' : 'production';
  }
}

function isPlausible(durationMs: number): boolean {
  return durationMs >= DURATION_MIN_MS && durationMs <= DURATION_MAX_MS;
}

/**
 * Recognition is easier than recall, so a correct recognition only counts as Hard:
 * counting it as Good would make FSRS overestimate retention.
 */
export function toRating(mode: Mode, outcome: Outcome, easyThresholdMs: number | null): Rating {
  if (outcome.kind === 'self') return outcome.grade;
  if (!outcome.correct) return 1;
  if (mode === 'recognition') return 2;
  const fast =
    easyThresholdMs !== null && isPlausible(outcome.durationMs) && outcome.durationMs < easyThresholdMs;
  return fast && !outcome.hintUsed ? 4 : 3;
}

export function easyThreshold(durationsMs: number[]): number | null {
  const valid = durationsMs.filter(isPlausible).sort((a, b) => a - b);
  if (valid.length < MIN_SAMPLES) return null;
  const mid = valid.length / 2;
  return valid.length % 2 ? valid[Math.floor(mid)] : (valid[mid - 1] + valid[mid]) / 2;
}
