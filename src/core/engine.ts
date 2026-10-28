import type { Repo } from '../storage/repo';
import { easyThreshold, selectMode, toRating, type Outcome } from './grading';
import { newId } from './ids';
import type { Card, Mode, Note, NoteType, ReviewEntry } from './model';
import { makeScheduler, type CardState } from './scheduler';

export interface Engine {
  cardState(cardId: string): Promise<CardState>;
  modeFor(cardId: string): Promise<Mode>;
  answer(cardId: string, mode: Mode, outcome: Outcome, now: number): Promise<{ entry: ReviewEntry; state: CardState }>;
  /** "En fait je ne savais pas" / "J'avais bon": regrades the card's latest answer and replays the card. */
  correctLast(entryId: string, correct: boolean, now: number): Promise<CardState>;
}

export function createEngine(repo: Repo, deviceId: string): Engine {
  async function load(cardId: string): Promise<{ card: Card; note: Note }> {
    const card = await repo.getCard(cardId);
    const note = card && (await repo.getNote(card.noteId));
    if (!card || !note) throw new Error(`card ${cardId} not found`);
    return { card, note };
  }

  async function cardState(cardId: string): Promise<CardState> {
    const { note } = await load(cardId);
    const scheduler = makeScheduler(await repo.getSettings());
    return scheduler.replay(note.createdAt, await repo.listReviews(cardId));
  }

  /** Median duration of past correct production answers on notes of the same type. */
  async function thresholdFor(type: NoteType, excludeEntryId?: string): Promise<number | null> {
    const [reviews, cards, notes] = await Promise.all([repo.listReviews(), repo.listCards(), repo.listNotes()]);
    const typeByNote = new Map(notes.map((n) => [n.id, n.fields.type]));
    const typeByCard = new Map(cards.map((c) => [c.id, typeByNote.get(c.noteId)]));
    const durations = reviews
      .filter((e) => e.id !== excludeEntryId && e.mode === 'production' && e.correct && typeByCard.get(e.cardId) === type)
      .map((e) => e.durationMs);
    return easyThreshold(durations);
  }

  return {
    cardState,

    async modeFor(cardId) {
      const { note } = await load(cardId);
      const state = await cardState(cardId);
      const basicDistractors =
        note.fields.type === 'basic'
          ? (await repo.listNotes(note.themeId)).filter((n) => n.id !== note.id && n.fields.type === 'basic').length
          : 0;
      return selectMode(note.fields.type, state, { basicDistractors });
    },

    async answer(cardId, mode, outcome, now) {
      if ((mode === 'self') !== (outcome.kind === 'self')) {
        throw new Error(`a ${outcome.kind} outcome does not match mode ${mode}`);
      }
      const { note } = await load(cardId);
      const rating = toRating(mode, outcome, await thresholdFor(note.fields.type));
      const entry: ReviewEntry = {
        id: newId(now),
        cardId,
        ts: now,
        rating,
        mode,
        correct: outcome.kind === 'auto' ? outcome.correct : outcome.grade > 1,
        durationMs: outcome.kind === 'auto' ? outcome.durationMs : 0,
        hintUsed: outcome.kind === 'auto' ? outcome.hintUsed : false,
        deviceId,
      };
      await repo.appendReview(entry);
      return { entry, state: await cardState(cardId) };
    },

    async correctLast(entryId, correct, _now) {
      const entry = (await repo.listReviews()).find((e) => e.id === entryId);
      if (!entry) throw new Error(`review ${entryId} not found`);
      const cardLog = await repo.listReviews(entry.cardId);
      if (cardLog[cardLog.length - 1].id !== entryId) {
        throw new Error('only the latest answer of a card can be corrected');
      }
      const { note } = await load(entry.cardId);
      const outcome: Outcome =
        entry.mode === 'self'
          ? { kind: 'self', grade: correct ? 3 : 1 }
          : { kind: 'auto', correct, durationMs: entry.durationMs, hintUsed: entry.hintUsed };
      const rating = toRating(entry.mode, outcome, await thresholdFor(note.fields.type, entryId));
      await repo.amendReview(entryId, { rating, correct });
      return cardState(entry.cardId);
    },
  };
}
