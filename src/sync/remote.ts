/**
 * A remote copy of the whole database, as a backup document (format + version, see core/backup),
 * written with optimistic concurrency on `version`.
 */
export interface RemoteStore {
  get(): Promise<{ data: unknown; version: number } | null>;
  /** `expected`: the version read before (null when there was none). Fails on a concurrent write. */
  put(data: unknown, expected: number | null): Promise<{ ok: true; version: number } | { ok: false; conflict: true }>;
}
