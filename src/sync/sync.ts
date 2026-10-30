import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup, serializeBackup, type Dump } from '../core/backup';
import { changedItems, checkItem, dumpToItems, itemHash, itemKey, itemsToDump, type Item } from '../core/items';
import type { ItemsRemote } from './items-remote';
import { canonical } from '../core/canonical';
import { cardVariants } from '../core/cards';
import { mergeDumps } from '../core/merge';
import type { Repo } from '../storage/repo';
import type { RemoteStore } from './remote';

const MAX_ATTEMPTS = 3;

const equal = (a: Dump, b: Dump) => canonical(a) === canonical(b);

/** Creates the cards that merged notes need (one per variant that has no card yet). */
async function completeCards(repo: Repo, merged: Dump): Promise<void> {
  for (const note of merged.notes) {
    const have = new Set(merged.cards.filter((c) => c.noteId === note.id && !c.orphan).map((c) => c.variant));
    if (cardVariants(note.fields).some((v) => !have.has(v))) await repo.putNote(note);
  }
}

/** Merges `incoming` into local data in one transaction, then completes the cards. Returns whether anything changed. */
export async function mergeIntoLocal(repo: Repo, incoming: Dump): Promise<boolean> {
  const result = await repo.mergeIntoLocal((local) => mergeDumps(local, incoming));
  if (result.changed) await completeCards(repo, result.dump);
  return result.changed;
}

/** Reads a remote document through the backup parser: a damaged or newer snapshot is refused in French. */
function readRemote(data: unknown): Dump {
  if (isMarker(data)) throw new Error('Cette copie a été remplacée par la synchronisation rapide. Mets l’application à jour.');
  const parsed = parseBackup(JSON.stringify(data));
  if (!parsed.ok) throw new Error(`Copie du serveur refusée. ${parsed.error}`);
  return parsed.dump;
}

/**
 * One sync round: read the remote copy, merge it with local data, push the result if the remote
 * lacks something (retrying on a concurrent write), then merge it into the local data of that moment,
 * in one transaction, so answers given meanwhile are kept.
 */
export async function syncOnce(repo: Repo, remote: RemoteStore, now: () => number = Date.now): Promise<{ pulled: boolean; pushed: boolean }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const local = await repo.dumpAll();
    const current = await remote.get();
    const remoteDump = current ? readRemote(current.data) : null;
    const merged = mergeDumps(local, remoteDump ?? local);
    const pushed = !remoteDump || !equal(merged, remoteDump);
    if (pushed) {
      const res = await remote.put(JSON.parse(serializeBackup(merged, now())), current?.version ?? null);
      if (!res.ok) continue;
    }
    const pulled = await mergeIntoLocal(repo, merged);
    return { pulled, pushed };
  }
  throw new Error('Synchronisation impossible : conflit persistant avec le serveur. Réessaie dans un instant.');
}

const ITEMS_STATE = 'sync:items';
/** Positions re-listed at each sync: a write still committing when we last listed is usually not missed. */
const OVERLAP = 500;
/** A full listing at least this often catches anything missed (late commits, restored or revived data). */
const FULL_EVERY = 24 * 3_600_000;
/** Failed markings of the whole copy before the sync reports an error. */
const MAX_TAKEOVER_FAILURES = 5;

interface ItemsState {
  /** Last server position seen. */
  seq: number;
  /** Fingerprint of each item as the server holds it and this device has it. */
  known: Record<string, string>;
  /** Server position of the version of each item this device has (written or downloaded): listing it again needs no download. */
  seen: Record<string, number>;
  /** Last full listing. */
  lastFull: number;
  /** The former whole copy is not marked as moved yet: re-read and merged at every sync until it is. */
  takeover: boolean;
  /** Failed attempts to mark the whole copy: reported after a few. */
  takeoverFailures?: number;
  /** Items downloaded but not kept by the merge (cards and history of deleted notes, merged duplicates), at that position: not downloaded again unless rewritten. */
  dropped?: Record<string, number>;
}

/** Where the sync state lives: the device database, so it survives quotas and is reset by a restore. */
export interface SyncStateStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
}

export const repoSyncState = (repo: Repo, space: string): SyncStateStore => ({
  get: () => repo.getMeta(`${ITEMS_STATE}:${space}`),
  set: (v) => repo.setMeta(`${ITEMS_STATE}:${space}`, v),
});

async function loadState(store: SyncStateStore): Promise<ItemsState> {
  try {
    const s = JSON.parse((await store.get()) ?? 'null');
    if (s && typeof s.seq === 'number' && s.known && s.seen) return { lastFull: 0, takeover: false, ...s } as ItemsState;
  } catch {
    // A damaged state only costs a full listing.
  }
  return { seq: 0, known: {}, seen: {}, lastFull: 0, takeover: false };
}

/** The whole-copy row once a device moved to items: older apps read a newer version and ask to be updated. */
const isMarker = (data: unknown) => !!data && typeof data === 'object' && (data as { movedTo?: unknown }).movedTo === 'ancrage_items';

/**
 * Incremental sync: download the items written since last time (contents only for those we did not write
 * ourselves, or that this device lacks on a full listing), merge them into local data, then send the items
 * whose content differs from the server's. The former whole copy is merged until it is marked as moved.
 */
export async function syncItems(repo: Repo, remote: ItemsRemote, store: SyncStateStore, snapshot?: RemoteStore, now: () => number = Date.now): Promise<{ pulled: boolean; pushed: number }> {
  const st = await loadState(store);
  const firstTime = st.seq === 0;
  const full = firstTime || now() - st.lastFull > FULL_EVERY;
  const before = await repo.dumpAll();
  const localKeys = new Set(dumpToItems(before).map(itemKey));
  const deleted = new Set(before.tombstones.map((t) => `${t.kind}:${t.id}`));

  const listed = await remote.list(full ? 0 : Math.max(0, st.seq - OVERLAP));
  const wanted = listed.filter((l) => {
    const key = itemKey(l);
    // A version this device has not seen yet, or (full listing) an item it lacks, except a note or theme deleted here.
    return st.seen[key] !== l.seq || (full && !localKeys.has(key) && !deleted.has(key) && st.dropped?.[key] !== l.seq);
  });
  const seqOf = new Map(listed.map((l) => [itemKey(l), l.seq]));
  const fetched = wanted.length ? await remote.fetch(wanted) : [];
  const valid: Item[] = [];
  for (const it of fetched) {
    const ok = checkItem(it);
    if (ok === false) throw new Error('Copie du serveur refusée : un élément est abîmé ou vient d’une version plus récente d’Ancrage. Mets l’application à jour.');
    if (ok) valid.push({ kind: it.kind as Item['kind'], id: it.id, data: it.data });
  }

  let pulled = false;
  let takeoverVersion: number | null = null;
  if ((firstTime || st.takeover) && snapshot) {
    const current = await snapshot.get();
    if (current && !isMarker(current.data)) {
      pulled = (await mergeIntoLocal(repo, readRemote(current.data))) || pulled;
      takeoverVersion = current.version;
      st.takeover = true;
    } else st.takeover = false;
  }
  if (valid.length) pulled = (await mergeIntoLocal(repo, itemsToDump(valid))) || pulled;

  const local = dumpToItems(await repo.dumpAll());
  const after = new Map(local.map((i) => [itemKey(i), i]));
  for (const it of fetched) st.seen[itemKey(it)] = seqOf.get(itemKey(it)) ?? it.seq;
  // A note or theme that came back after a deletion here: its cards and history are older items, fetched by a full listing next time.
  const revived = valid.some((i) => (i.kind === 'note' || i.kind === 'theme') && deleted.has(itemKey(i)) && !localKeys.has(itemKey(i)) && after.has(itemKey(i)));
  st.dropped ??= {};
  if (revived) st.dropped = {};
  for (const it of valid) {
    const key = itemKey(it);
    if (after.has(key)) {
      st.known[key] = itemHash(it.data);
      delete st.dropped[key];
    } else {
      // Not kept by the merge: remembered at this position so a full listing does not fetch it every day.
      delete st.known[key];
      st.dropped[key] = seqOf.get(key) ?? 0;
    }
  }

  const changed = changedItems(local, st.known);
  const written = changed.length ? await remote.push(changed) : [];
  const byKey = new Map(changed.map((i) => [itemKey(i), i]));
  for (const w of written) {
    const key = itemKey(w);
    st.seen[key] = w.seq;
    const item = byKey.get(key);
    if (item) st.known[key] = itemHash(item.data);
  }
  st.seq = Math.max(st.seq, ...listed.map((l) => l.seq));
  if (full) st.lastFull = now();
  if (revived) st.lastFull = 0;
  if (takeoverVersion !== null && snapshot) {
    // Everything is on the items now: mark the whole copy. On a conflict (an older app wrote it meanwhile), try again next sync.
    const res = await snapshot.put({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, exportedAt: now(), movedTo: 'ancrage_items' }, takeoverVersion).catch(() => ({ ok: false as const }));
    st.takeover = !res.ok;
    st.takeoverFailures = res.ok ? 0 : (st.takeoverFailures ?? 0) + 1;
  }
  await store.set(JSON.stringify(st));
  if (st.takeover && (st.takeoverFailures ?? 0) >= MAX_TAKEOVER_FAILURES) {
    throw new Error('Synchronisation rapide : impossible de marquer l’ancienne copie comme remplacée. Vérifie les droits de la table ancrage_snapshots (guide de synchronisation), puis réessaie.');
  }
  return { pulled, pushed: written.length };
}
