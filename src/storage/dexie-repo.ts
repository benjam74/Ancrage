import Dexie, { type EntityTable } from 'dexie';
import { cardVariants } from '../core/cards';
import { newId } from '../core/ids';
import { DEFAULT_SETTINGS, type Card, type Note, type ReviewEntry, type Settings, type Theme } from '../core/model';
import { byTimeThenId } from '../core/scheduler';
import type { Repo } from './repo';

type SettingsRow = Settings & { key: 'main' };

class AncrageDb extends Dexie {
  themes!: EntityTable<Theme, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  reviews!: EntityTable<ReviewEntry, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      themes: 'id',
      notes: 'id, themeId',
      cards: 'id, noteId',
      reviews: 'id, cardId, ts',
      settings: 'key',
    });
  }
}

export function createDexieRepo(name: string): Repo {
  const db = new AncrageDb(name);

  return {
    async putTheme(theme) {
      await db.themes.put(theme);
    },
    listThemes: () => db.themes.orderBy('id').toArray(),

    putNote: (note) =>
      db.transaction('rw', db.notes, db.cards, db.reviews, async () => {
        await db.notes.put(note);
        const wanted = cardVariants(note.fields);
        const existing = await db.cards.where('noteId').equals(note.id).toArray();
        const active: Card[] = [];
        for (const variant of wanted) {
          const found = existing.find((c) => c.variant === variant);
          const card: Card = found ? { id: found.id, noteId: note.id, variant } : { id: newId(), noteId: note.id, variant };
          await db.cards.put(card);
          active.push(card);
        }
        for (const card of existing.filter((c) => !wanted.includes(c.variant))) {
          const hasHistory = (await db.reviews.where('cardId').equals(card.id).count()) > 0;
          if (hasHistory) await db.cards.put({ ...card, orphan: true });
          else await db.cards.delete(card.id);
        }
        return active;
      }),
    getNote: (id) => db.notes.get(id),
    listNotes: (themeId) => (themeId === undefined ? db.notes.toArray() : db.notes.where('themeId').equals(themeId).toArray()),
    getCard: (id) => db.cards.get(id),
    listCards: (noteId) => (noteId === undefined ? db.cards.toArray() : db.cards.where('noteId').equals(noteId).toArray()),

    async appendReview(entry) {
      await db.reviews.add(entry);
    },
    async listReviews(cardId) {
      const rows = cardId === undefined ? await db.reviews.toArray() : await db.reviews.where('cardId').equals(cardId).toArray();
      return rows.sort(byTimeThenId);
    },
    async amendReview(id, patch) {
      const updated = await db.reviews.update(id, { rating: patch.rating, correct: patch.correct });
      if (!updated) throw new Error(`review ${id} not found`);
    },

    async getSettings() {
      const row = await db.settings.get('main');
      if (!row) return { ...DEFAULT_SETTINGS };
      const { key: _key, ...settings } = row;
      return settings;
    },
    async putSettings(settings) {
      await db.settings.put({ ...settings, key: 'main' });
    },
  };
}
