export type NoteType = 'basic' | 'cloze' | 'ordering' | 'classify' | 'mcq' | 'scenario';

export type NoteFields =
  | { type: 'basic'; front: string; back: string; reverse: boolean }
  | { type: 'cloze'; text: string }
  | { type: 'ordering'; title: string; steps: string[] }
  | { type: 'classify'; statement: string; categories: string[]; answer: string }
  | { type: 'mcq'; question: string; answer: string; distractors: string[] }
  | { type: 'scenario'; situation: string; model: string; keyPoints: string[] };

export interface Theme {
  id: string;
  parentId?: string;
  name: string;
  order: number;
}

export interface Note {
  id: string;
  themeId: string;
  fields: NoteFields;
  tags: string[];
  source?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Card {
  id: string;
  noteId: string;
  variant: string;
  /** Set when the note no longer produces this variant but the card has history worth keeping. */
  orphan?: boolean;
}

export type Mode = 'recognition' | 'production' | 'self';

export type Rating = 1 | 2 | 3 | 4;

/** One answer, appended to the review log. The log is the only source of truth for scheduling. */
export interface ReviewEntry {
  id: string;
  cardId: string;
  ts: number;
  rating: Rating;
  mode: Mode;
  correct: boolean;
  durationMs: number;
  hintUsed: boolean;
  deviceId: string;
}

export interface Settings {
  desiredRetention: number;
  newPerDay: number;
}

export const DEFAULT_SETTINGS: Settings = { desiredRetention: 0.9, newPerDay: 5 };

/** Facts that are not answers. Only round completions are stored: everything else is derived from the log. */
export interface AppEvent {
  id: string;
  type: 'round_completed';
  ts: number;
}
