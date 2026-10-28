import type { Dump } from './backup';
import { canonical } from './canonical';
import { cardVariants } from './cards';
import type { Card, Note, ReviewEntry, Theme, Tombstone } from './model';

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Deterministic winner between two versions of one record: later `updatedAt`, then larger canonical JSON. */
function newer<T extends { updatedAt?: number }>(x: T, y: T): T {
  const tx = x.updatedAt ?? 0;
  const ty = y.updatedAt ?? 0;
  if (tx !== ty) return tx > ty ? x : y;
  return canonical(x) >= canonical(y) ? x : y;
}

function unite<T extends { id: string }>(a: T[], b: T[], pick: (x: T, y: T) => T): T[] {
  const out = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const seen = out.get(item.id);
    out.set(item.id, seen ? pick(seen, item) : item);
  }
  return [...out.values()].sort(byId);
}

const same = <T>(x: T, y: T) => (canonical(x) >= canonical(y) ? x : y);

/**
 * Cards follow their note: one card per (note, variant), the smallest id kept and the others'
 * reviews moved to it; a variant the note no longer has stays as an orphan only if it has history.
 */
export function reconcileCards(notes: Note[], cards: Card[], reviews: ReviewEntry[]): { cards: Card[]; reviews: ReviewEntry[] } {
  const variantsByNote = new Map(notes.map((n) => [n.id, new Set(cardVariants(n.fields))]));
  const canonical = new Map<string, Card>();
  const remap = new Map<string, string>();
  for (const card of [...cards].sort(byId)) {
    if (!variantsByNote.has(card.noteId)) continue;
    const key = `${card.noteId}\u0000${card.variant}`;
    const kept = canonical.get(key);
    if (kept) remap.set(card.id, kept.id);
    else {
      canonical.set(key, card);
      remap.set(card.id, card.id);
    }
  }
  const outReviews = reviews
    .filter((r) => remap.has(r.cardId))
    .map((r) => (remap.get(r.cardId) === r.cardId ? r : { ...r, cardId: remap.get(r.cardId)! }))
    .sort(byId);
  const withHistory = new Set(outReviews.map((r) => r.cardId));
  const outCards: Card[] = [];
  for (const card of [...canonical.values()].sort(byId)) {
    const { orphan: _orphan, ...plain } = card;
    if (variantsByNote.get(card.noteId)!.has(card.variant)) outCards.push(plain);
    else if (withHistory.has(card.id)) outCards.push({ ...plain, orphan: true });
  }
  return { cards: outCards, reviews: outReviews };
}

/**
 * Merges two databases. Commutative and idempotent: reviews and rounds are united, notes,
 * themes and settings keep their latest version, and a deletion wins over older versions.
 */
export function mergeDumps(a: Dump, b: Dump): Dump {
  const tombstones = unite<Tombstone>(a.tombstones, b.tombstones, (x, y) => (x.ts !== y.ts ? (x.ts > y.ts ? x : y) : same(x, y)));
  const tombIndex = new Map(tombstones.map((t) => [`${t.kind}:${t.id}`, t.ts]));
  const deletedAt = (kind: Tombstone['kind'], id: string) => tombIndex.get(`${kind}:${id}`) ?? -Infinity;

  const notes = unite(a.notes, b.notes, newer).filter((n) => n.updatedAt > deletedAt('note', n.id));
  const referenced = new Set(notes.map((n) => n.themeId));
  // A theme survives a deletion when it is newer, or when a surviving note still lives in it.
  const themes = unite<Theme>(a.themes, b.themes, newer).filter(
    (t) => (t.updatedAt ?? 0) > deletedAt('theme', t.id) || referenced.has(t.id),
  );

  const { cards, reviews } = reconcileCards(notes, unite(a.cards, b.cards, same), unite(a.reviews, b.reviews, same));

  const settingsFromA =
    a.settingsUpdatedAt !== b.settingsUpdatedAt
      ? a.settingsUpdatedAt > b.settingsUpdatedAt
      : canonical(a.settings) >= canonical(b.settings);

  return {
    themes,
    notes,
    cards,
    reviews,
    events: unite(a.events, b.events, same),
    settings: { ...(settingsFromA ? a.settings : b.settings) },
    settingsUpdatedAt: Math.max(a.settingsUpdatedAt, b.settingsUpdatedAt),
    flags: [...new Set([...a.flags, ...b.flags])].sort(),
    tombstones,
  };
}
