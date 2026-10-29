import { parseBackup, serializeBackup, type Dump } from '../core/backup';
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
