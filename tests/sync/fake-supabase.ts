/** A small stand-in for Supabase Auth (GoTrue) and the ancrage_snapshots table (PostgREST), behind `fetch`. */
export function fakeSupabase(opts: { confirmEmail?: boolean; noTable?: boolean } = {}) {
  const users = new Map<string, { password: string; id: string; confirmed: boolean }>();
  const tokens = new Map<string, { userId: string; expiresAt: number }>();
  const refresh = new Map<string, string>();
  const rows = new Map<string, { data: unknown; version: number }>();
  let clock = 1_000_000;
  let offline = false;
  const calls: { method: string; path: string; headers: Record<string, string> }[] = [];

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const issue = (userId: string, email: string) => {
    const access = `at-${Math.random()}`;
    const ref = `rt-${Math.random()}`;
    tokens.set(access, { userId, expiresAt: clock + 3600 });
    refresh.set(ref, userId);
    return { access_token: access, refresh_token: ref, expires_in: 3600, expires_at: clock + 3600, token_type: 'bearer', user: { id: userId, email } };
  };
  const emailOf = (userId: string) => [...users.entries()].find(([, u]) => u.id === userId)![0];

  const fetchFn = async (input: string | URL | Request, init: RequestInit = {}) => {
    if (offline) throw new TypeError('Failed to fetch');
    const url = new URL(String(input));
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ method: init.method ?? 'GET', path: url.pathname + url.search, headers });
    if (headers.apikey !== 'anon-key') return json(401, { message: 'Invalid API key' });
    const body = init.body ? JSON.parse(String(init.body)) : {};

    if (url.pathname === '/auth/v1/signup') {
      if (users.has(body.email)) return json(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      const id = `u-${users.size + 1}`;
      users.set(body.email, { password: body.password, id, confirmed: !opts.confirmEmail });
      return opts.confirmEmail ? json(200, { id, email: body.email }) : json(200, issue(id, body.email));
    }
    if (url.pathname === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const u = users.get(body.email);
        if (!u || u.password !== body.password) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        if (!u.confirmed) return json(400, { error: 'invalid_grant', error_description: 'Email not confirmed' });
        return json(200, issue(u.id, body.email));
      }
      if (grant === 'refresh_token') {
        const userId = refresh.get(body.refresh_token);
        if (!userId) return json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
        refresh.delete(body.refresh_token);
        return json(200, issue(userId, emailOf(userId)));
      }
    }
    if (url.pathname === '/rest/v1/ancrage_snapshots' && opts.noTable) {
      return json(404, { code: 'PGRST205', message: "Could not find the table 'public.ancrage_snapshots' in the schema cache" });
    }
    if (url.pathname === '/rest/v1/ancrage_snapshots') {
      const auth = tokens.get((headers.authorization ?? '').replace('Bearer ', ''));
      if (!auth || auth.expiresAt <= clock) return json(401, { code: 'PGRST301', message: 'JWT expired' });
      const mine = rows.get(auth.userId);
      const method = init.method ?? 'GET';
      if (method === 'GET') return json(200, mine ? [{ data: mine.data, version: mine.version }] : []);
      if (method === 'POST') {
        if (mine) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
        rows.set(auth.userId, { data: body.data, version: body.version });
        return json(201, [{ version: body.version }]);
      }
      if (method === 'PATCH') {
        const expected = Number(url.searchParams.get('version')?.replace('eq.', ''));
        if (!mine || mine.version !== expected) return json(200, []);
        rows.set(auth.userId, { data: body.data, version: body.version });
        return json(200, [{ version: body.version }]);
      }
    }
    return json(404, { message: 'not found' });
  };

  return {
    fetchFn: fetchFn as typeof fetch,
    calls,
    rows,
    setOffline: (v: boolean) => (offline = v),
    advance: (seconds: number) => (clock += seconds),
    now: () => clock * 1000,
    confirm: (email: string) => (users.get(email)!.confirmed = true),
  };
}
