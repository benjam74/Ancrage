import { State } from 'ts-fsrs';
import type { ReviewEntry } from './model';
import { nextStudyDay, type EntryKind } from './progress';
import { studyDayStart } from './queue';
import type { CardState, Scheduler } from './scheduler';

export const MASTERED_STABILITY = 21;
export const MASTERED_RETRIEVABILITY = 0.9;

export type Level = 'Nouveau' | 'Découverte' | 'En cours' | 'Solide' | 'Ancré';

const HOUR = 3_600_000;

function levelOf(pct: number): Level {
  if (pct >= 90) return 'Ancré';
  if (pct >= 60) return 'Solide';
  if (pct >= 25) return 'En cours';
  return 'Découverte';
}

/** Share of cards both stable (≥ 21 days) and still well remembered (≥ 90 %) right now. */
export function mastery(states: CardState[], now: number, scheduler: Scheduler): { cards: number; mastered: number; pct: number; level: Level } {
  const mastered = states.filter(
    (c) => c.state !== State.New && c.stability >= MASTERED_STABILITY && scheduler.retrievability(c, now) >= MASTERED_RETRIEVABILITY,
  ).length;
  const pct = states.length ? Math.round((mastered / states.length) * 100) : 0;
  const reviewed = states.some((c) => c.state !== State.New);
  return { cards: states.length, mastered, pct, level: reviewed ? levelOf(pct) : 'Nouveau' };
}

function previousStudyDay(dayStart: number): number {
  return studyDayStart(dayStart - 12 * HOUR);
}

/** Reviews per study day for the last `days` days, oldest first, today last. */
export function dailyCounts(entries: ReviewEntry[], todayStart: number, days: number): number[] {
  const starts = [todayStart];
  while (starts.length < days) starts.unshift(previousStudyDay(starts[0]));
  const counts = new Map(starts.map((d) => [d, 0]));
  for (const e of entries) {
    const d = studyDayStart(e.ts);
    if (counts.has(d)) counts.set(d, counts.get(d)! + 1);
  }
  return starts.map((d) => counts.get(d)!);
}

/** Cards falling due per study day; index 0 includes everything overdue. */
export function forecast(states: CardState[], now: number, days: number): number[] {
  const ends: number[] = [];
  let d = studyDayStart(now);
  for (let i = 0; i < days; i++) ends.push((d = nextStudyDay(d)));
  const out = new Array<number>(days).fill(0);
  for (const c of states) {
    if (c.state === State.New) continue;
    const i = ends.findIndex((end) => c.due.getTime() < end);
    if (i >= 0) out[i]++;
  }
  return out;
}

export function retention(entries: ReviewEntry[], kinds: Map<string, EntryKind>, from: number): number | null {
  const due = entries.filter((e) => e.ts >= from && kinds.get(e.id) === 'due');
  return due.length ? due.filter((e) => e.correct).length / due.length : null;
}

export function stateBreakdown(states: CardState[]): { nouvelles: number; apprentissage: number; jeunes: number; ancrees: number } {
  const out = { nouvelles: 0, apprentissage: 0, jeunes: 0, ancrees: 0 };
  for (const c of states) {
    if (c.state === State.New) out.nouvelles++;
    else if (c.state === State.Learning || c.state === State.Relearning) out.apprentissage++;
    else if (c.stability >= MASTERED_STABILITY) out.ancrees++;
    else out.jeunes++;
  }
  return out;
}
