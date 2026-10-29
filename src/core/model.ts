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
  /** Last rename or creation, for last-writer-wins sync. */
  updatedAt?: number;
  /** A domain groups themes (its children have it as parent); it holds no notes itself. */
  kind?: 'domain';
}

/** Remembers a deletion so a merge with another device does not bring the item back. */
export interface Tombstone {
  id: string;
  kind: 'note' | 'theme';
  ts: number;
}

export interface Note {
  id: string;
  themeId: string;
  fields: NoteFields;
  tags: string[];
  source?: string;
  /** Put aside: out of every queue, history kept, can be resumed. */
  suspended?: boolean;
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

export type Slot = 'haut' | 'bas' | 'chapeau' | 'lunettes' | 'cou' | 'objet' | 'compagnon' | 'decor';
export type CharacterId = 'renard' | 'loutre' | 'ourson' | 'lapin';

/**
 * Facts that are not answers: round completions and the shop (purchases, sales, outfit, character).
 * Everything else is derived from the log. Events are only ever added, so devices merge them by id.
 */
export type AppEvent =
  | { id: string; type: 'round_completed'; ts: number }
  | { id: string; type: 'purchase'; ts: number; itemId: string; price: number }
  | { id: string; type: 'sale'; ts: number; itemId: string; refund: number }
  | { id: string; type: 'equip'; ts: number; slot: Slot; itemId: string | null }
  | { id: string; type: 'avatar'; ts: number; character: CharacterId; name: string }
  /** XP earned by reviews of a deleted note, kept in the wallet (id `credit:<noteId>`, so devices agree). */
  | { id: string; type: 'xp_credit'; ts: number; xp: number };
