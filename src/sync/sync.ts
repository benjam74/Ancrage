import type { Dump } from '../core/backup';
import { cardVariants } from '../core/cards';
import { mergeDumps } from '../core/merge';
import type { Repo } from '../storage/repo';
import type { RemoteStore } from './remote';

const MAX_ATTEMPTS = 3;

/** JSON with sorted keys, so two equal dumps compare equal whatever their key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  );
}
const equal = (a: Dump, b: Dump) => canonical(a) === canonical(b);

/** Writes a merged snapshot, then creates the cards its notes need (one per new variant). */
export async function applyMerged(repo: Repo, merged: Dump): Promise<void> {
  await repo.restoreAll(merged);
  for (const note of merged.notes) {
    const have = new Set(merged.cards.filter((c) => c.noteId === note.id && !c.orphan).map((c) => c.variant));
    if (cardVariants(note.fields).some((v) => !have.has(v))) await repo.putNote(note);
  }
}

/**
 * One sync round: read the remote copy, merge it with local data, push the result if the remote
 * lacks something (retrying on a concurrent write), then merge again with the local state of
 * that moment so answers given meanwhile are kept.
 */
export async function syncOnce(repo: Repo, remote: RemoteStore): Promise<{ pulled: boolean; pushed: boolean }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const local = await repo.dumpAll();
    const current = await remote.get();
    const merged = mergeDumps(local, current?.dump ?? local);
    const pushed = !current || !equal(merged, current.dump);
    if (pushed) {
      const res = await remote.put(merged, current?.version ?? null);
      if (!res.ok) continue;
    }
    const now = await repo.dumpAll();
    const final = mergeDumps(now, merged);
    const pulled = !equal(final, mergeDumps(now, now));
    if (pulled) await applyMerged(repo, final);
    return { pulled, pushed };
  }
  throw new Error('Synchronisation impossible : conflit persistant avec le serveur. Réessaie dans un instant.');
}
