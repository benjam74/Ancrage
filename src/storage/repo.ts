import type { Dump } from '../core/backup';
import type { AppEvent, Card, Note, Rating, ReviewEntry, Settings, Theme } from '../core/model';

export interface Repo {
  putTheme(theme: Theme): Promise<void>;
  listThemes(): Promise<Theme[]>;
  /** Upserts the note and syncs its cards; returns the cards the note currently produces. */
  putNote(note: Note): Promise<Card[]>;
  getNote(id: string): Promise<Note | undefined>;
  listNotes(themeId?: string): Promise<Note[]>;
  getCard(id: string): Promise<Card | undefined>;
  /** Includes orphan cards. */
  listCards(noteId?: string): Promise<Card[]>;
  /** Append-only: rejects an id that already exists. */
  appendReview(entry: ReviewEntry): Promise<void>;
  /** Sorted by time, then id. */
  listReviews(cardId?: string): Promise<ReviewEntry[]>;
  /** The one permitted change to the log: correcting the grade of an answer. */
  amendReview(id: string, patch: { rating: Rating; correct: boolean }): Promise<void>;
  /** Removes the note, its cards and their review log. */
  deleteNote(id: string): Promise<void>;
  deleteTheme(id: string): Promise<void>;
  appendEvent(event: AppEvent): Promise<void>;
  /** Sorted by time. */
  listEvents(): Promise<AppEvent[]>;
  getFlag(key: string): Promise<boolean>;
  setFlag(key: string): Promise<void>;
  /** Every table, each sorted by id, for backups. */
  dumpAll(): Promise<Dump>;
  /** Replaces the whole database with `dump`, all or nothing. */
  restoreAll(dump: Dump): Promise<void>;
  getSettings(): Promise<Settings>;
  putSettings(settings: Settings): Promise<void>;
}
