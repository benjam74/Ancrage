import type { Item } from '../core/items';

export interface RemoteItem {
  kind: string;
  id: string;
  data: unknown;
  seq: number;
}

/**
 * The server copy as one row per item. `seq` grows with every write: a device asks for what was
 * written after the last position it saw.
 */
export interface ItemsRemote {
  /** Keys and positions of the items written after `after`, in order (no content: cheap). */
  list(after: number): Promise<{ kind: string; id: string; seq: number }[]>;
  /** Contents of these items. */
  fetch(keys: { kind: string; id: string }[]): Promise<RemoteItem[]>;
  /** Writes these items (insert or replace); returns their new positions. */
  push(items: Item[]): Promise<{ kind: string; id: string; seq: number }[]>;
}

/** The project has no `ancrage_items` table yet: sync falls back to the whole-copy table. */
export class ItemsMissing extends Error {
  constructor() {
    super('Table ancrage_items absente.');
  }
}

/** In-memory server with the same contract, for tests. Several devices share one instance. */
export function createMemoryItems() {
  const rows = new Map<string, RemoteItem>();
  let seq = 0;
  const writes: Item[][] = [];
  const remote: ItemsRemote = {
    async list(after) {
      return [...rows.values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq).map(({ kind, id, seq }) => ({ kind, id, seq }));
    },
    async fetch(keys) {
      return keys.flatMap((k) => {
        const r = rows.get(`${k.kind}:${k.id}`);
        return r ? [{ ...r, data: JSON.parse(JSON.stringify(r.data)) }] : [];
      });
    },
    async push(items) {
      writes.push(items);
      return items.map((i) => {
        const row = { kind: i.kind, id: i.id, data: JSON.parse(JSON.stringify(i.data)), seq: ++seq };
        rows.set(`${i.kind}:${i.id}`, row);
        return { kind: i.kind, id: i.id, seq: row.seq };
      });
    },
  };
  return { remote, rows, writes };
}
