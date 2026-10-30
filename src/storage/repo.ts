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
  /** Also records a tombstone dated `ts`, so sync does not bring the note back. */
  deleteNote(id: string, ts?: number): Promise<void>;
  deleteTheme(id: string, ts?: number): Promise<void>;
  appendEvent(event: AppEvent): Promise<void>;
  /** Sorted by time. */
  listEvents(): Promise<AppEvent[]>;
  getFlag(key: string): Promise<boolean>;
  setFlag(key: string): Promise<void>;
  /** Every table, each sorted by id, for backups. */
  dumpAll(): Promise<Dump>;
  /** Replaces the whole database with `dump`, all or nothing. */
  restoreAll(dump: Dump): Promise<void>;
  /** Reads, transforms and rewrites the whole database in one transaction (no write can slip in between). */
  mergeIntoLocal(merge: (local: Dump) => Dump): Promise<{ changed: boolean; dump: Dump }>;
  /** Device-side bookkeeping kept out of backups and sync (e.g. the sync state). */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string | null): Promise<void>;
  /** Forgets every bookkeeping entry whose key starts with `prefix`. */
  clearMeta(prefix: string): Promise<void>;
  getSettings(): Promise<Settings>;
  /** `ts` dates the change for last-writer-wins sync. */
  putSettings(settings: Settings, ts?: number): Promise<void>;
}
