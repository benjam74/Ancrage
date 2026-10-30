import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup, serializeBackup, type Dump } from '../core/backup';
import { changedItems, checkItem, dumpToItems, itemHash, itemKey, itemsToDump, type Item } from '../core/items';
import type { ItemsRemote } from './items-remote';
import type { KeyValue } from '../app/cloud';
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

const ITEMS_STATE = 'ancrage.sync.items';
/** Positions re-listed at each sync: a write still committing when we last listed is not missed. */
const OVERLAP = 500;

interface ItemsState {
  /** Last server position seen. */
  seq: number;
  /** Fingerprint of each item as the server holds it. */
  known: Record<string, string>;
  /** Position of our own last write of each item: listing it again needs no download. */
  mine: Record<string, number>;
}

function loadState(store: KeyValue): ItemsState {
  try {
    const s = JSON.parse(store.get(ITEMS_STATE) ?? 'null');
    if (s && typeof s.seq === 'number' && s.known && s.mine) return s as ItemsState;
  } catch {
    // A damaged state only costs a full resend.
  }
  return { seq: 0, known: {}, mine: {} };
}

/** The whole-copy row once a device moved to items: older apps read version 6 and ask to be updated. */
const isMarker = (data: unknown) => !!data && typeof data === 'object' && (data as { movedTo?: unknown }).movedTo === 'ancrage_items';

/**
 * Incremental sync: download the items written since last time (contents only for those we did not write
 * ourselves), merge them into local data, then send the items whose content differs from the server's.
 * The first time on a device, the former whole copy (if any) is merged too, then marked as moved.
 */
export async function syncItems(repo: Repo, remote: ItemsRemote, state: KeyValue, snapshot?: RemoteStore, now: () => number = Date.now): Promise<{ pulled: boolean; pushed: number }> {
  const st = loadState(state);
  const firstTime = st.seq === 0;
  const listed = await remote.list(Math.max(0, st.seq - OVERLAP));
  const wanted = listed.filter((l) => st.mine[itemKey(l)] !== l.seq);
  const fetched = wanted.length ? await remote.fetch(wanted) : [];
  const valid: Item[] = [];
  for (const it of fetched) {
    const ok = checkItem(it);
    if (ok === false) throw new Error('Copie du serveur refusée : un élément est abîmé ou vient d’une version plus récente d’Ancrage. Mets l’application à jour.');
    if (ok) valid.push({ kind: it.kind as Item['kind'], id: it.id, data: it.data });
  }
  let pulled = false;
  let moved: { version: number } | null = null;
  if (firstTime && snapshot) {
    const current = await snapshot.get();
    if (current && !isMarker(current.data)) {
      pulled = (await mergeIntoLocal(repo, readRemote(current.data))) || pulled;
      moved = { version: current.version };
    }
  }
  if (valid.length) pulled = (await mergeIntoLocal(repo, itemsToDump(valid))) || pulled;
  for (const it of valid) st.known[itemKey(it)] = itemHash(it.data);

  const changed = changedItems(dumpToItems(await repo.dumpAll()), st.known);
  const written = changed.length ? await remote.push(changed) : [];
  const byKey = new Map(changed.map((i) => [itemKey(i), i]));
  for (const w of written) {
    const key = itemKey(w);
    st.mine[key] = w.seq;
    const item = byKey.get(key);
    if (item) st.known[key] = itemHash(item.data);
  }
  st.seq = Math.max(st.seq, ...listed.map((l) => l.seq));
  for (const [key, seq] of Object.entries(st.mine)) if (seq < st.seq - OVERLAP) delete st.mine[key];
  state.set(ITEMS_STATE, JSON.stringify(st));
  if (moved && snapshot) {
    // Best effort: another device may have marked it meanwhile.
    await snapshot.put({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, exportedAt: now(), movedTo: 'ancrage_items' }, moved.version).catch(() => {});
  }
  return { pulled, pushed: written.length };
}
