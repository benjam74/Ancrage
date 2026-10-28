import type { Card, Note, Rating, ReviewEntry, Settings, Theme } from '../core/model';

export interface Repo {
  putTheme(theme: Theme): Promise<void>;
  listThemes(): Promise<Theme[]>;
  /** Upserts the note and syncs its cards; returns the cards the note currently produces. */
  putNote(note: Note): Promise<Card[]>;
  getNote(id: string): Promise<Note | undefined>;
  /** Includes orphan cards. */
  listCards(noteId?: string): Promise<Card[]>;
  /** Append-only: rejects an id that already exists. */
  appendReview(entry: ReviewEntry): Promise<void>;
  /** Sorted by time, then id. */
  listReviews(cardId?: string): Promise<ReviewEntry[]>;
  /** The one permitted change to the log: correcting the grade of an answer. */
  amendReview(id: string, patch: { rating: Rating; correct: boolean }): Promise<void>;
  getSettings(): Promise<Settings>;
  putSettings(settings: Settings): Promise<void>;
}
