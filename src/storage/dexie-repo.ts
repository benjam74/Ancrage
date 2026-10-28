import Dexie, { type EntityTable } from 'dexie';
import { cardVariants } from '../core/cards';
import { newId } from '../core/ids';
import { DEFAULT_SETTINGS, type AppEvent, type Card, type Note, type ReviewEntry, type Settings, type Theme, type Tombstone } from '../core/model';
import { byTimeThenId } from '../core/scheduler';
import { canonical } from '../core/canonical';
import type { Dump } from '../core/backup';
import type { Repo } from './repo';

/** The `settings` table holds the settings row (`main`) and one-time flags (`flag:<name>`). */
type SettingsRow = { key: string } & Partial<Settings> & { value?: boolean; updatedAt?: number };

class AncrageDb extends Dexie {
  themes!: EntityTable<Theme, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  reviews!: EntityTable<ReviewEntry, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  events!: EntityTable<AppEvent, 'id'>;
  tombstones!: EntityTable<Tombstone, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      themes: 'id',
      notes: 'id, themeId',
      cards: 'id, noteId',
      reviews: 'id, cardId, ts',
      settings: 'key',
    });
    this.version(2).stores({ events: 'id, ts' });
    this.version(3).stores({ tombstones: 'id' });
  }
}

export function createDexieRepo(name: string): Repo {
  const db = new AncrageDb(name);

  async function readSettings(): Promise<Settings> {
    const row = await db.settings.get('main');
    return {
      desiredRetention: row?.desiredRetention ?? DEFAULT_SETTINGS.desiredRetention,
      newPerDay: row?.newPerDay ?? DEFAULT_SETTINGS.newPerDay,
    };
  }

  // One read transaction: a write from another tab cannot land halfway through the export.
  const dumpAll = (): Promise<Dump> =>
    db.transaction('r', [db.themes, db.notes, db.cards, db.reviews, db.events, db.settings, db.tombstones], async () => {
      const [themes, notes, cards, reviews, events, settingsRows, settings, tombstones] = await Promise.all([
        db.themes.orderBy('id').toArray(),
        db.notes.orderBy('id').toArray(),
        db.cards.orderBy('id').toArray(),
        db.reviews.orderBy('id').toArray(),
        db.events.orderBy('id').toArray(),
        db.settings.toArray(),
        readSettings(),
        db.tombstones.orderBy('id').toArray(),
      ]);
      const flags = settingsRows.filter((r) => r.key.startsWith('flag:') && r.value).map((r) => r.key.slice(5)).sort();
      const settingsUpdatedAt = settingsRows.find((r) => r.key === 'main')?.updatedAt ?? 0;
      return { themes, notes, cards, reviews, events, settings, flags, tombstones, settingsUpdatedAt };
    });

  const restoreAll = (dump: Dump): Promise<void> =>
      db.transaction('rw', [db.themes, db.notes, db.cards, db.reviews, db.events, db.settings, db.tombstones], async () => {
        await Promise.all([db.themes.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.events.clear(), db.settings.clear(), db.tombstones.clear()]);
        await db.tombstones.bulkAdd(dump.tombstones);
        await db.themes.bulkAdd(dump.themes);
        await db.notes.bulkAdd(dump.notes);
        await db.cards.bulkAdd(dump.cards);
        await db.reviews.bulkAdd(dump.reviews);
        await db.events.bulkAdd(dump.events);
        await db.settings.bulkAdd([
          { key: 'main', desiredRetention: dump.settings.desiredRetention, newPerDay: dump.settings.newPerDay, updatedAt: dump.settingsUpdatedAt },
          ...dump.flags.map((f) => ({ key: `flag:${f}`, value: true })),
        ]);
      });

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

    deleteNote: (id, ts = Date.now()) =>
      db.transaction('rw', [db.notes, db.cards, db.reviews, db.tombstones], async () => {
        await db.tombstones.put({ id, kind: 'note', ts });
        const cardIds = (await db.cards.where('noteId').equals(id).toArray()).map((c) => c.id);
        await db.reviews.where('cardId').anyOf(cardIds).delete();
        await db.cards.bulkDelete(cardIds);
        await db.notes.delete(id);
      }),
    deleteTheme: (id, ts = Date.now()) =>
      db.transaction('rw', [db.themes, db.tombstones], async () => {
        await db.tombstones.put({ id, kind: 'theme', ts });
        await db.themes.delete(id);
      }),
    async appendEvent(event) {
      await db.events.add(event);
    },
    listEvents: () => db.events.orderBy('ts').toArray(),
    async getFlag(key) {
      return (await db.settings.get(`flag:${key}`))?.value === true;
    },
    async setFlag(key) {
      await db.settings.put({ key: `flag:${key}`, value: true });
    },

    dumpAll,
    restoreAll,
    mergeIntoLocal: (merge) =>
      db.transaction('rw', [db.themes, db.notes, db.cards, db.reviews, db.events, db.settings, db.tombstones], async () => {
        const local = await dumpAll();
        const next = merge(local);
        const changed = canonical(next) !== canonical(local);
        if (changed) await restoreAll(next);
        return { changed, dump: next };
      }),

    getSettings: readSettings,
    async putSettings(settings, ts = Date.now()) {
      await db.settings.put({ key: 'main', desiredRetention: settings.desiredRetention, newPerDay: settings.newPerDay, updatedAt: ts });
    },
  };
}
