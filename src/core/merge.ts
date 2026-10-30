import type { Dump } from './backup';
import { canonical } from './canonical';
import { cardVariants } from './cards';
import type { Card, Note, ReviewEntry, Theme, Tombstone } from './model';

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Records are never mutated: their canonical JSON is computed once (notes may carry images of several hundred KB).
const canonicalOf = new WeakMap<object, string>();
function key(x: object): string {
  let k = canonicalOf.get(x);
  if (k === undefined) canonicalOf.set(x, (k = canonical(x)));
  return k;
}

/** Deterministic winner between two versions of one record: later `updatedAt`, then larger canonical JSON. */
function newer<T extends { updatedAt?: number }>(x: T, y: T): T {
  if (x === y) return x;
  const tx = x.updatedAt ?? 0;
  const ty = y.updatedAt ?? 0;
  if (tx !== ty) return tx > ty ? x : y;
  return key(x) >= key(y) ? x : y;
}

function unite<T extends { id: string }>(a: T[], b: T[], pick: (x: T, y: T) => T): T[] {
  const out = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const seen = out.get(item.id);
    out.set(item.id, seen ? pick(seen, item) : item);
  }
  return [...out.values()].sort(byId);
}

/** Fields of a note and of a theme that merge one by one. */
export const NOTE_FIELDS = ['themeId', 'fields', 'tags', 'source', 'explanation', 'suspended'] as const;
export const THEME_FIELDS = ['name', 'parentId', 'order', 'kind', 'lang', 'newOrder'] as const;

type Stamped = { updatedAt?: number; fieldTimes?: Record<string, number> };

/** Records when each field of `next` changed compared with `prev` (a removed field counts as a change). */
export function stampFields<T extends Stamped>(prev: T | undefined, next: T, fields: readonly string[]): T {
  if (!prev) return next;
  const times: Record<string, number> = { ...(prev.fieldTimes ?? {}), ...(next.fieldTimes ?? {}) };
  const at = next.updatedAt ?? 0;
  const p = prev as Record<string, unknown>;
  const n = next as Record<string, unknown>;
  for (const f of fields) {
    if (canonical(p[f] ?? null) !== canonical(n[f] ?? null)) times[f] = at;
    // An unchanged field keeps the time it really changed, not this write's.
    else if (p[f] !== undefined) times[f] = prev.fieldTimes?.[f] ?? prev.updatedAt ?? 0;
  }
  return withTimes(next, times, fields);
}

/** Field times equal to `updatedAt` on a present field are implied: leave them out, so equal records stay equal. */
function withTimes<T extends Stamped>(rec: T, times: Record<string, number>, fields: readonly string[]): T {
  const r = rec as Record<string, unknown>;
  const kept: Record<string, number> = {};
  for (const f of fields) {
    const t = times[f];
    if (t === undefined || (r[f] !== undefined && t === (rec.updatedAt ?? 0))) continue;
    kept[f] = t;
  }
  const { fieldTimes: _, ...rest } = rec;
  return (Object.keys(kept).length ? { ...rest, fieldTimes: kept } : rest) as T;
}

/**
 * Merges two versions of one record field by field: each field keeps its latest value. A field missing from a
 * version without a time for it (an older app that does not know it) is no opinion, never a deletion.
 * Commutative and idempotent.
 */
export function mergeRecord<T extends Stamped & { id: string }>(x: T, y: T, fields: readonly string[]): T {
  if (x === y) return x;
  const base = newer(x, y);
  const out: Record<string, unknown> = { ...base };
  const times: Record<string, number> = {};
  const rx = x as Record<string, unknown>;
  const ry = y as Record<string, unknown>;
  const timeOf = (r: Record<string, unknown>, rec: Stamped, f: string) =>
    r[f] !== undefined ? (rec.fieldTimes?.[f] ?? rec.updatedAt ?? 0) : (rec.fieldTimes?.[f] ?? -Infinity);
  for (const f of fields) {
    const tx = timeOf(rx, x, f);
    const ty = timeOf(ry, y, f);
    const fromX = tx !== ty ? tx > ty : canonical(rx[f] ?? null) >= canonical(ry[f] ?? null);
    const value = fromX ? rx[f] : ry[f];
    if (value === undefined) delete out[f];
    else out[f] = value;
    // The kept value carries its own time, so a third version later compares against the right one.
    const kept = Math.max(tx, ty);
    if (kept > -Infinity) times[f] = kept;
  }
  out.updatedAt = Math.max(x.updatedAt ?? 0, y.updatedAt ?? 0);
  if (x.updatedAt === undefined && y.updatedAt === undefined) delete out.updatedAt;
  return withTimes(out as T, times, fields);
}

const same = <T extends object>(x: T, y: T) => (x === y || key(x) >= key(y) ? x : y);

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

  const notes = unite(a.notes, b.notes, (x, y) => mergeRecord(x, y, NOTE_FIELDS)).filter((n) => n.updatedAt > deletedAt('note', n.id));
  const referenced = new Set(notes.map((n) => n.themeId));
  // A theme survives a deletion when it is newer, or when a surviving note still lives in it.
  const themes = unite<Theme>(a.themes, b.themes, (x, y) => mergeRecord(x, y, THEME_FIELDS)).filter(
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
