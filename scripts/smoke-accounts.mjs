// End-to-end smoke test of accounts (v1.14): a build with a Supabase project built in, against a fake
// Supabase at the network level. Builds into dist-accounts so the main smoke keeps its own build.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 4180;
const URL = `http://localhost:${PORT}/`;
const OUT = process.env.SMOKE_OUT ?? 'smoke-output';
const DIST = 'dist-accounts';
mkdirSync(OUT, { recursive: true });

const built = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], {
  stdio: 'ignore',
  env: { ...process.env, VITE_SUPABASE_URL: 'https://projet.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key' },
});
if (built.status !== 0) { console.error('smoke-accounts FAILED: build'); process.exit(1); }
const server = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const fail = (msg) => { console.error(`smoke-accounts FAILED: ${msg}`); server.kill(); process.exit(1); };

for (let i = 0; i < 50; i++) {
  try { if ((await fetch(URL)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const cloud = { users: new Map(), tokens: new Map(), rows: new Map(), recovered: [] };
const fakeSupabase = async (route) => {
  const req = route.request();
  const url = new globalThis.URL(req.url());
  const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (req.headers().apikey !== 'anon-key') return reply(401, { message: 'Invalid API key' });
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  const issue = (email) => { const t = `t-${Math.random()}`; cloud.tokens.set(t, email); return { access_token: t, refresh_token: `r-${t}`, expires_in: 3600, user: { email, user_metadata: cloud.users.get(email).meta } }; };
  const who = cloud.tokens.get((req.headers().authorization ?? '').replace('Bearer ', ''));
  if (url.pathname === '/auth/v1/signup') {
    if (cloud.users.has(body.email)) return reply(422, { msg: 'User already registered' });
    cloud.users.set(body.email, { password: body.password, meta: body.data ?? {} });
    return reply(200, issue(body.email));
  }
  if (url.pathname === '/auth/v1/token') return cloud.users.get(body.email)?.password === body.password ? reply(200, issue(body.email)) : reply(400, { error_description: 'Invalid login credentials' });
  if (url.pathname === '/auth/v1/recover') { cloud.recovered.push(body.email); return reply(200, {}); }
  if (url.pathname === '/auth/v1/user' && req.method() === 'PUT') {
    if (!who) return reply(401, { msg: 'invalid JWT' });
    cloud.users.get(who).password = body.password;
    return reply(200, { email: who });
  }
  if (url.pathname === '/rest/v1/ancrage_items') return reply(404, { code: 'PGRST205', message: "Could not find the table 'public.ancrage_items' in the schema cache" });
  if (!who) return reply(401, { message: 'JWT expired' });
  const row = cloud.rows.get(who);
  if (req.method() === 'GET') return reply(200, row ? [row] : []);
  if (req.method() === 'POST') { if (row) return reply(409, {}); cloud.rows.set(who, { data: body.data, version: body.version }); return reply(201, [{ version: body.version }]); }
  if (req.method() === 'PATCH') {
    const expected = Number(url.searchParams.get('version').replace('eq.', ''));
    if (!row || row.version !== expected) return reply(200, []);
    cloud.rows.set(who, { data: body.data, version: body.version });
    return reply(200, [{ version: body.version }]);
  }
  return reply(404, {});
};

const browser = await chromium.launch();
const errors = [];
const device = async (name, viewport = { width: 1280, height: 860 }) => {
  const c = await browser.newContext({ serviceWorkers: 'block', viewport });
  await c.route('https://projet.supabase.co/**', fakeSupabase);
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  // Expected refusals (wrong password, no items table) show as failed loads: check the responses instead.
  p.on('console', (m) => m.type() === 'error' && !/fonts\.(googleapis|gstatic)|Failed to load resource/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  p.on('response', (r) => r.status() >= 400 && !/\/rest\/v1\/ancrage_items|\/auth\/v1\/token|fonts\./.test(r.url()) && errors.push(`${name}: ${r.status()} ${r.url()}`));
  return p;
};
const notes = (p, db = 'ancrage') => p.evaluate((name) => new Promise((resolve) => {
  const req = indexedDB.open(name);
  req.onsuccess = () => { const r = req.result.transaction('notes').objectStore('notes').getAll(); r.onsuccess = () => resolve(r.result.map((n) => n.id)); };
}), db);
const profiles = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('ancrage.profiles') ?? '{"profiles":[]}'));
const welcome = (p) => p.getByRole('button', { name: 'Continuer sans compte' });

// A: a new device creates an account for Léa, collège 5e.
const a = await device('A');
await a.goto(URL);
await welcome(a).waitFor({ timeout: 5000 }).catch(() => fail('a new device opens on the welcome page'));
await a.screenshot({ path: `${OUT}/welcome.png`, fullPage: true });
await a.getByRole('button', { name: 'Créer un compte' }).click();
await a.getByRole('button', { name: 'Créer mon compte' }).click();
await a.getByText('Indique ton adresse e-mail.').waitFor();
await a.getByLabel('Prénom').fill('Léa');
await a.getByLabel('Collège, 5e').check();
await a.getByLabel('E-mail').fill('lea@exemple.fr');
await a.getByLabel('Mot de passe').fill('secret12');
await a.getByRole('button', { name: 'Créer mon compte' }).click();
await a.locator('.hero').waitFor({ timeout: 8000 }).catch(async () => fail(`sign-up should open the app: ${(await a.locator('main').innerText()).slice(0, 300)}`));
const notesA = await notes(a);
if (!notesA.length || !notesA.every((id) => id.startsWith('c5-'))) fail(`A should have the collège 5e examples, has ${notesA.slice(0, 3)}`);
if ((await profiles(a)).profiles[0]?.name !== 'Léa') fail('the profile takes the account first name');
for (let i = 0; i < 30 && !cloud.rows.get('lea@exemple.fr'); i++) await a.waitForTimeout(200);
if (!cloud.rows.get('lea@exemple.fr')) fail('the new account sends its cards');
if (cloud.users.get('lea@exemple.fr').meta.starter !== 'college5') fail('the account keeps what it is for');
await a.goto(`${URL}#reglages`);
await a.getByText('Connecté : lea@exemple.fr').waitFor();
if (await a.getByLabel('Adresse du projet').count()) fail('with a built-in project, settings ask for no address');
await a.reload();
await a.locator('.hero, .settings, main').first().waitFor();
if (await welcome(a).count()) fail('the welcome page never comes back once answered');

// B: another device signs in to the same account and gets its cards, with no examples of its own.
const b = await device('B');
await b.goto(URL);
await welcome(b).waitFor();
await b.getByLabel('E-mail').fill('lea@exemple.fr');
await b.getByLabel('Mot de passe').fill('faux');
await b.getByRole('button', { name: 'Se connecter' }).click();
await b.getByText('E-mail ou mot de passe incorrect.').waitFor({ timeout: 5000 }).catch(async () => { await b.screenshot({ path: `${OUT}/b-fail.png` }); fail(`wrong password: ${await b.locator('main').innerText()}`); });
await b.getByLabel('Mot de passe').fill('secret12');
await b.getByRole('button', { name: 'Se connecter' }).click();
await b.locator('.hero').waitFor({ timeout: 8000 });
let notesB = [];
for (let i = 0; i < 30 && notesB.length < notesA.length; i++) { await b.waitForTimeout(200); notesB = await notes(b); }
if (notesB.length !== notesA.length) fail(`B should have exactly the ${notesA.length} cards of the account, has ${notesB.length}`);
if ((await profiles(b)).profiles[0]?.name !== 'Léa') fail('B takes the account first name');
if (await b.evaluate(() => localStorage.getItem('ancrage.account.pullFirst'))) fail('after the first sync, B behaves as usual');

// C: no account; later adds Léa's account as a second profile from the settings.
const c = await device('C', { width: 390, height: 844 });
await c.goto(URL);
await welcome(c).waitFor();
const width = await c.evaluate(() => document.documentElement.scrollWidth);
if (width > 390) fail(`horizontal scroll on the mobile welcome page: ${width}px`);
await c.screenshot({ path: `${OUT}/welcome-mobile.png`, fullPage: true });
await welcome(c).click();
await c.locator('.hero').waitFor();
if (!(await notes(c)).some((id) => id.startsWith('ex-'))) fail('without an account, the usual examples are there');
await c.goto(`${URL}#reglages`);
await c.getByRole('button', { name: 'Ajouter avec un compte' }).click();
await c.getByLabel('E-mail du compte').fill('lea@exemple.fr');
await c.getByLabel('Mot de passe du compte').fill('secret12');
await c.getByRole('button', { name: 'Ouvrir ce compte' }).click();
await c.locator('.hero').waitFor({ timeout: 8000 });
const regC = await profiles(c);
const leaC = regC.profiles.find((p) => p.name === 'Léa');
if (!leaC || regC.profiles.length !== 2) fail(`C should now have two profiles, has ${regC.profiles.map((p) => p.name)}`);
let notesC = [];
for (let i = 0; i < 30 && notesC.length < notesA.length; i++) { await c.waitForTimeout(200); notesC = await notes(c, `ancrage-${leaC.id}`); }
if (notesC.length !== notesA.length) fail(`the added profile gets the account's ${notesA.length} cards, has ${notesC.length}`);
await c.goto(`${URL}#reglages`);
await c.getByRole('button', { name: 'Ajouter avec un compte' }).click();
await c.getByLabel('E-mail du compte').fill('lea@exemple.fr');
await c.getByLabel('Mot de passe du compte').fill('secret12');
await c.getByRole('button', { name: 'Ouvrir ce compte' }).click();
await c.getByText(/Ce compte est déjà ouvert ici/).waitFor({ timeout: 5000 }).catch(() => fail('the same account is not opened twice on a device'));

// D: forgotten password, then the link from the e-mail.
const d = await device('D');
await d.goto(URL);
await d.getByRole('button', { name: 'Mot de passe oublié ?' }).click();
await d.getByLabel('E-mail').fill('lea@exemple.fr');
await d.getByRole('button', { name: 'Envoyer le lien' }).click();
await d.getByText(/un e-mail vient de partir/).waitFor();
if (cloud.recovered[0] !== 'lea@exemple.fr') fail('the reset e-mail is asked for');
const token = `t-reset`;
cloud.tokens.set(token, 'lea@exemple.fr');
// The link from the e-mail opens a new page.
await d.goto('about:blank');
await d.goto(`${URL}#access_token=${token}&expires_in=3600&refresh_token=x&token_type=bearer&type=recovery`);
await d.getByRole('heading', { name: 'Nouveau mot de passe' }).waitFor();
if (d.url().includes('access_token')) fail('the token is removed from the address');
await d.getByLabel('Nouveau mot de passe').fill('nouveau12');
await d.getByLabel('Encore une fois').fill('nouveau12');
await d.getByRole('button', { name: 'Enregistrer' }).click();
await d.getByText('Mot de passe changé.', { exact: false }).waitFor();
await d.getByRole('button', { name: 'Continuer' }).click();
await welcome(d).waitFor();
await d.getByLabel('E-mail').fill('lea@exemple.fr');
await d.getByLabel('Mot de passe').fill('nouveau12');
await d.getByRole('button', { name: 'Se connecter' }).click();
await d.locator('.hero').waitFor({ timeout: 8000 }).catch(() => fail('the new password works'));

await browser.close();
server.kill();
if (errors.length) fail(`console errors: ${errors.join(' | ')}`);
console.log(`smoke-accounts OK (${notesA.length} cards travelled to B and to a second profile on C; reset password used on D)`);
