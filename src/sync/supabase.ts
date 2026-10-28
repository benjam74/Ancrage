import type { RemoteStore } from './remote';

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
}

type Fetch = typeof fetch;
type Clock = () => number;
type AuthResult = { ok: true; session: AuthSession } | { ok: false; error: string; network?: boolean };

const TABLE = 'ancrage_snapshots';
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

export const signUp = (config: SyncConfig, email: string, password: string, fetchFn: Fetch = fetch, now: Clock = Date.now) =>
  auth(config, 'signup', { email, password }, fetchFn, now);

export function createSupabaseRemote(
  config: SyncConfig,
  getSession: () => AuthSession | null,
  saveSession: (s: AuthSession | null) => void,
  fetchFn: Fetch = fetch,
  now: Clock = Date.now,
): RemoteStore {
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

  async function rest(query: string, init: RequestInit) {
    const send = async (accessToken: string) =>
      call(fetchFn, `${base(config)}/rest/v1/${TABLE}${query}`, {
        ...init,
        headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
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
    if (res.status === 404 && /PGRST205|ancrage_snapshots/.test(JSON.stringify(res.body))) {
      throw new Error('La table ancrage_snapshots est absente du projet : exécute le script SQL du guide de synchronisation.');
    }
    return res;
  }

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
