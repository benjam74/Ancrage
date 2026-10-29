import type { ReviewEntry } from './model';
import { byTimeThenId } from './scheduler';

/** Forgotten this many times (FSRS lapses), a card is worth rewording. */
export const HARD_LAPSES = 4;
/** Right this many times in a row since the last miss, it is no longer hard. */
export const HARD_CLEAR = 3;

export function isHard(lapses: number, entries: ReviewEntry[]): boolean {
  if (lapses < HARD_LAPSES) return false;
  let streak = 0;
  for (const e of [...entries].sort(byTimeThenId)) streak = e.rating > 1 ? streak + 1 : 0;
  return streak < HARD_CLEAR;
}
