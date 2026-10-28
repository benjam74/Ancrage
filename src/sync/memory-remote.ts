import type { Dump } from '../core/backup';
import type { RemoteStore } from './remote';

/** In-memory remote with the same contract as the server one, for tests and demos. */
export function createMemoryRemote(opts: { latencyMs?: number } = {}): RemoteStore {
  let stored: { json: string; version: number } | null = null;
  const wait = () => new Promise((r) => setTimeout(r, opts.latencyMs ?? 0));
  return {
    async get() {
      await wait();
      return stored ? { dump: JSON.parse(stored.json) as Dump, version: stored.version } : null;
    },
    async put(dump, expected) {
      await wait();
      if ((stored?.version ?? null) !== expected) return { ok: false, conflict: true };
      stored = { json: JSON.stringify(dump), version: (stored?.version ?? 0) + 1 };
      return { ok: true, version: stored.version };
    },
  };
}
