import type { RemoteStore } from './remote';
import { ItemsMissing, type ItemsRemote, type RemoteItem } from './items-remote';
import type { Item } from '../core/items';

/**
 * Supabase over plain REST (no SDK): Auth (GoTrue) for e-mail + password sessions, and one row
 * per user in `ancrage_snapshots` (PostgREST), protected by row-level security. Setup: docs/sync-supabase.md.
 */
export interface SyncConfig {
  url: string;
  anonKey: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  email: string;
  /** What the account was created with (first name, who it is for…): sets up a new device. */
  meta?: Record<string, unknown>;
}

type Fetch = typeof fetch;
type Clock = () => number;
type AuthResult = { ok: true; session: AuthSession } | { ok: false; error: string; network?: boolean };

const TABLE = 'ancrage_snapshots';
const ITEMS_TABLE = 'ancrage_items';
/** Ids per request when fetching contents, to keep URLs short. */
const FETCH_CHUNK = 60;
/** Rows per listing page. */
const LIST_PAGE = 1000;
/** Bytes of JSON per write. */
const PUSH_BYTES = 1_500_000;
const REFRESH_MARGIN_MS = 60_000;
export const NETWORK_ERROR = 'Impossible de joindre le serveur. Vérifie ta connexion et l’adresse du projet.';

const base = (config: SyncConfig) => config.url.replace(/\/+$/, '');

async function call(fetchFn: Fetch, url: string, init: RequestInit): Promise<{ status: number; body: any }> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function toSession(body: any, now: Clock): AuthSession {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: now() + Number(body.expires_in ?? 3600) * 1000,
    email: body.user?.email ?? '',
    ...(body.user?.user_metadata && typeof body.user.user_metadata === 'object' ? { meta: body.user.user_metadata as Record<string, unknown> } : {}),
  };
}

function authError(body: any): string {
  const text = String(body?.error_description ?? body?.msg ?? body?.message ?? '').toLowerCase();
  if (text.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
  if (text.includes('not confirmed')) return 'Adresse e-mail pas encore confirmée : ouvre le lien reçu par e-mail.';
  if (text.includes('already registered')) return 'Un compte existe déjà avec cette adresse : connecte-toi.';
  if (text.includes('password')) return 'Mot de passe refusé : utilise au moins 6 caractères.';
  if (text.includes('api key')) return 'Clé publique du projet invalide.';
  return 'Le serveur a refusé la demande. Vérifie l’adresse et la clé du projet.';
}

async function auth(config: SyncConfig, path: string, payload: object, fetchFn: Fetch, now: Clock): Promise<AuthResult> {
  try {
    const { status, body } = await call(fetchFn, `${base(config)}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (status >= 200 && status < 300 && body?.access_token) return { ok: true, session: toSession(body, now) };
    if (status >= 200 && status < 300) {
      return { ok: false, error: 'Compte créé. Confirme ton adresse avec le lien reçu par e-mail, puis connecte-toi.' };
    }
    // A server failure (5xx, paused free project) is not a wrong password: keep the session.
    if (status >= 500) return { ok: false, error: NETWORK_ERROR, network: true };
    return { ok: false, error: authError(body) };
  } catch (e) {
    return { ok: false, error: (e as Error).message, network: true };
  }
}

export const signIn = (config: SyncConfig, email: string, password: string, fetchFn: Fetch = fetch, now: Clock = Date.now) =>
  auth(config, 'token?grant_type=password', { email, password }, fetchFn, now);

export const signUp = (config: SyncConfig, email: string, password: string, fetchFn: Fetch = fetch, now: Clock = Date.now, data: Record<string, unknown> = {}) =>
  auth(config, 'signup', { email, password, data }, fetchFn, now);

/** Sends the « reset your password » e-mail; the link opens the app's address (Site URL). */
export async function recoverPassword(config: SyncConfig, email: string, fetchFn: Fetch = fetch): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { status } = await call(fetchFn, `${base(config)}/auth/v1/recover`, {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (status >= 200 && status < 300) return { ok: true };
    if (status === 429) return { ok: false, error: 'Trop de demandes : réessaie dans une minute.' };
    return { ok: false, error: 'Le serveur a refusé la demande. Vérifie l’adresse e-mail.' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** The token of a « new password » link: the project sends the reader back to the app with it in the address. */
export function recoveryToken(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get('type') === 'recovery' ? params.get('access_token') : null;
}

/** Address fragments left by the project's links (confirmation, new password), not app pages. */
export const isAuthFragment = (hash: string) => /(^|[#&])(access_token|error_description)=/.test(hash);

export async function setPassword(config: SyncConfig, accessToken: string, password: string, fetchFn: Fetch = fetch): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { status, body } = await call(fetchFn, `${base(config)}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (status >= 200 && status < 300) return { ok: true };
    if (status === 401 || status === 403) return { ok: false, error: 'Ce lien a expiré : redemande un e-mail depuis « Mot de passe oublié ».' };
    if (status === 422) return { ok: false, error: String(body?.msg ?? '').toLowerCase().includes('different') ? 'Choisis un mot de passe différent de l’ancien.' : 'Mot de passe refusé : utilise au moins 6 caractères.' };
    return { ok: false, error: 'Le serveur a refusé la demande. Réessaie plus tard.' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Authenticated PostgREST calls on one table, refreshing the session when needed. */
function restClient(config: SyncConfig, getSession: () => AuthSession | null, saveSession: (s: AuthSession | null) => void, fetchFn: Fetch, now: Clock) {
  async function refreshNow(session: AuthSession): Promise<string> {
    const res = await auth(config, 'token?grant_type=refresh_token', { refresh_token: session.refreshToken }, fetchFn, now);
    if (res.ok) {
      saveSession({ ...res.session, email: res.session.email || session.email });
      return res.session.accessToken;
    }
    // Offline or server down: keep the session and try again later.
    if (res.network) throw new Error(NETWORK_ERROR);
    saveSession(null);
    throw new Error('Session expirée : reconnecte-toi.');
  }

  async function token(): Promise<string> {
    const session = getSession();
    if (!session) throw new Error('Connecte-toi pour synchroniser.');
    if (session.expiresAt - now() > REFRESH_MARGIN_MS) return session.accessToken;
    return refreshNow(session);
  }

  return async function rest(table: string, query: string, init: RequestInit & { prefer?: string }) {
    const send = async (accessToken: string) =>
      call(fetchFn, `${base(config)}/rest/v1/${table}${query}`, {
        ...init,
        headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: init.prefer ?? 'return=representation' },
      });
    let res = await send(await token());
    if (res.status === 401) {
      // The token may have expired earlier than this device's clock thinks: refresh once, then retry.
      const session = getSession();
      if (!session) throw new Error('Connecte-toi pour synchroniser.');
      res = await send(await refreshNow(session));
      if (res.status === 401) {
        saveSession(null);
        throw new Error('Session expirée : reconnecte-toi.');
      }
    }
    if (res.status === 404 && table === ITEMS_TABLE && /PGRST205|ancrage_items/.test(JSON.stringify(res.body))) throw new ItemsMissing();
    if (res.status === 404 && /PGRST205|ancrage_snapshots/.test(JSON.stringify(res.body))) {
      throw new Error('La table ancrage_snapshots est absente du projet : exécute le script SQL du guide de synchronisation.');
    }
    return res;
  };
}

export function createSupabaseRemote(
  config: SyncConfig,
  getSession: () => AuthSession | null,
  saveSession: (s: AuthSession | null) => void,
  fetchFn: Fetch = fetch,
  now: Clock = Date.now,
): RemoteStore {
  const call = restClient(config, getSession, saveSession, fetchFn, now);
  const rest = (query: string, init: RequestInit) => call(TABLE, query, init);
  return {
    async get() {
      const { status, body } = await rest('?select=data,version', { method: 'GET' });
      if (status !== 200 || !Array.isArray(body)) throw new Error('Lecture impossible sur le serveur de synchronisation.');
      return body.length ? { data: body[0].data as unknown, version: Number(body[0].version) } : null;
    },
    // Writes ask only for the version back: the snapshot is not echoed (bandwidth).
    async put(data, expected) {
      if (expected === null) {
        const { status } = await rest('?select=version', { method: 'POST', body: JSON.stringify({ data, version: 1 }) });
        if (status === 409) return { ok: false, conflict: true };
        if (status < 200 || status >= 300) throw new Error('Écriture impossible sur le serveur de synchronisation.');
        return { ok: true, version: 1 };
      }
      const { status, body } = await rest(`?version=eq.${expected}&select=version`, { method: 'PATCH', body: JSON.stringify({ data, version: expected + 1 }) });
      if (status < 200 || status >= 300) throw new Error('Écriture impossible sur le serveur de synchronisation.');
      return Array.isArray(body) && body.length ? { ok: true, version: expected + 1 } : { ok: false, conflict: true };
    },
  };
}

/** The `ancrage_items` table: one row per record, `seq` growing with every write (see docs/sync-supabase.md). */
export function createSupabaseItems(
  config: SyncConfig,
  getSession: () => AuthSession | null,
  saveSession: (s: AuthSession | null) => void,
  fetchFn: Fetch = fetch,
  now: Clock = Date.now,
): ItemsRemote {
  const rest = restClient(config, getSession, saveSession, fetchFn, now);
  const ok = (status: number) => status >= 200 && status < 300;
  const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return {
    async list(after) {
      const out: { kind: string; id: string; seq: number }[] = [];
      let from = after;
      for (;;) {
        const { status, body } = await rest(ITEMS_TABLE, `?select=kind,id,seq&seq=gt.${from}&order=seq.asc&limit=${LIST_PAGE}`, { method: 'GET' });
        if (!ok(status) || !Array.isArray(body)) throw new Error('Lecture impossible sur le serveur de synchronisation.');
        out.push(...body.map((r: { kind: string; id: string; seq: number | string }) => ({ kind: r.kind, id: r.id, seq: Number(r.seq) })));
        if (body.length < LIST_PAGE) return out;
        from = out[out.length - 1].seq;
      }
    },
    async fetch(keys) {
      const out: RemoteItem[] = [];
      const byKind = new Map<string, string[]>();
      for (const k of keys) byKind.set(k.kind, [...(byKind.get(k.kind) ?? []), k.id]);
      for (const [kind, ids] of byKind) {
        for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
          const list = encodeURIComponent(`(${ids.slice(i, i + FETCH_CHUNK).map(quote).join(',')})`);
          const { status, body } = await rest(ITEMS_TABLE, `?select=kind,id,data,seq&kind=eq.${encodeURIComponent(kind)}&id=in.${list}`, { method: 'GET' });
          if (!ok(status) || !Array.isArray(body)) throw new Error('Lecture impossible sur le serveur de synchronisation.');
          out.push(...body.map((r: RemoteItem & { seq: number | string }) => ({ kind: r.kind, id: r.id, data: r.data, seq: Number(r.seq) })));
        }
      }
      return out;
    },
    async push(items) {
      const out: { kind: string; id: string; seq: number }[] = [];
      let batch: Item[] = [];
      let size = 0;
      const send = async () => {
        if (!batch.length) return;
        const { status, body } = await rest(ITEMS_TABLE, '?on_conflict=user_id,kind,id&select=kind,id,seq', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: JSON.stringify(batch.map((i) => ({ kind: i.kind, id: i.id, data: i.data }))),
        });
        if (!ok(status) || !Array.isArray(body)) throw new Error('Écriture impossible sur le serveur de synchronisation.');
        out.push(...body.map((r: { kind: string; id: string; seq: number | string }) => ({ kind: r.kind, id: r.id, seq: Number(r.seq) })));
        batch = [];
        size = 0;
      };
      for (const item of items) {
        const bytes = JSON.stringify(item.data).length;
        if (size + bytes > PUSH_BYTES) await send();
        batch.push(item);
        size += bytes;
      }
      await send();
      return out;
    },
  };
}
