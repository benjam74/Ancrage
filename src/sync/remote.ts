import type { Dump } from '../core/backup';

/** A remote copy of the whole database, written with optimistic concurrency on `version`. */
export interface RemoteStore {
  get(): Promise<{ dump: Dump; version: number } | null>;
  /** `expected`: the version read before (null when there was none). Fails on a concurrent write. */
  put(dump: Dump, expected: number | null): Promise<{ ok: true; version: number } | { ok: false; conflict: true }>;
}
