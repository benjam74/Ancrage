// End-to-end smoke test: plays a full round in Chromium against `vite preview`, reloads,
// and checks that answers persisted. Uses the system Playwright; not run in CI.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
const OUT = process.env.SMOKE_OUT ?? 'smoke-output';
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const fail = (msg) => { console.error(`smoke FAILED: ${msg}`); server.kill(); process.exit(1); };

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(URL)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  fail('preview server did not start');
}

async function playRound(page) {
  let firstReveal = true;
  for (let step = 0; step < 40; step++) {
    if (await page.getByText('Manche terminée').isVisible()) return step;
    const cont = page.getByRole('button', { name: 'Continuer' });
    if (await cont.isVisible()) {
      await cont.click();
      // The round end has its own « Continuer »: stop there.
      await Promise.race([cont.waitFor({ state: 'hidden' }), page.getByText('Manche terminée').waitFor()]);
      continue;
    }
    const reveal = page.getByRole('button', { name: 'Afficher la réponse' });
    if (await reveal.isVisible()) {
      await reveal.click();
      // Keyboard path: Enter on a focused grade button must grade (regression guard).
      await page.getByRole('button', { name: firstReveal ? 'Raté' : 'Su' }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Continuer' }).waitFor();
      firstReveal = false;
      continue;
    }
    const input = page.locator('.cloze input');
    if (await input.isVisible()) await input.fill('zzz');
    const opt = page.locator('.opt:not([disabled])').first();
    if (await opt.isVisible()) await opt.click();
    while (await page.locator('.bank .tile:not([disabled])').count()) await page.locator('.bank .tile:not([disabled])').first().click();
    const check = page.getByRole('button', { name: 'Vérifier' });
    if ((await check.isVisible()) && (await check.isEnabled())) await check.click();
    try {
      await page.getByRole('button', { name: 'Continuer' }).waitFor({ timeout: 3000 });
    } catch {
      await page.screenshot({ path: `${OUT}/stuck.png` });
      fail(`stuck at step ${step}: ${(await page.locator('.session').innerText()).replace(/\s+/g, ' ')}`);
    }
  }
  fail('round did not finish within 40 steps');
}

/** Leaves the round end: summary, then the streak screen when shown, then exit. */
async function leaveRound(p) {
  const cont = p.getByRole('button', { name: 'Continuer' });
  if (await cont.isVisible()) { await cont.click(); await p.locator('.streak-hero').waitFor(); }
  const end = p.getByRole('button', { name: /Terminer|Manche suivante/ });
  if ((await end.innerText()).includes('Terminer')) await end.click(); else await p.keyboard.press('Escape');
}

await waitForServer();
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL);
await page.getByText('Séance du jour').waitFor();
const meta = await page.locator('.hero-meta').innerText();
if (!/5\s+nouvelles cartes/.test(meta)) fail(`expected 5 new cards on first launch, got "${meta}"`);
await page.screenshot({ path: `${OUT}/home.png` });

await page.locator('.hero .btn.sun').click();
await page.locator('.s-inner').first().waitFor();
await page.screenshot({ path: `${OUT}/exercise.png` });
const steps = await playRound(page);
await page.getByLabel('45 XP').waitFor({ timeout: 3000 }).catch(() => fail('round end should show 45 XP'));
if (!/\d+\/\d+/.test(await page.locator('.stat-tile').nth(1).innerText())) fail('round end should show « Justes x/y »');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/round-end.png` });
await page.getByRole('button', { name: 'Continuer' }).click();
await page.locator('.streak-hero').waitFor({ timeout: 3000 }).catch(() => fail('the streak screen should follow the summary'));
if ((await page.locator('.streak-hero .n').innerText()) !== '1') fail('streak screen should show 1 day');
await page.getByText('Journée validée.').waitFor();
if ((await page.locator('.end .wd.done').count()) !== 1) fail('streak screen week strip should show today done');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/round-streak.png` });
const finish = page.getByRole('button', { name: /Terminer|Manche suivante/ });
if ((await finish.innerText()).includes('Terminer')) await finish.click(); else await page.keyboard.press('Escape');
const checkMotivation = async (when) => {
  await page.locator('.chip.streak').waitFor();
  const streak = (await page.locator('.chip.streak').innerText()).replace(/\s+/g, ' ');
  const xp = (await page.locator('.chip.xp').innerText()).replace(/\s+/g, ' ');
  const ring = await page.locator('.ring').getAttribute('aria-label');
  if (!streak.startsWith('1') || !xp.startsWith('45') || ring !== 'Objectif du jour atteint') fail(`${when}: expected streak 1, 45 XP, goal reached; got "${streak}", "${xp}", "${ring}"`);
  if ((await page.locator('.week-card .wd.done').count()) !== 1) fail(`${when}: the week strip should show today done`);
};
await checkMotivation('home after round');
await page.reload();
await checkMotivation('home after reload');
await page.screenshot({ path: `${OUT}/home-after.png`, fullPage: true });
await page.goto(`${URL}#progres`);
await page.getByRole('heading', { name: 'Progrès' }).waitFor();
await page.screenshot({ path: `${OUT}/progress.png`, fullPage: true });
await page.goto(`${URL}#accueil`);
await page.locator('.hero').waitFor();
const after = await page.locator('.hero').innerText();
if (/[1-9]\s*\n?\s*nouvelles? cartes?/.test(after)) fail(`new cards still offered after reload: "${after}"`);
const reviews = await page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('ancrage');
  req.onsuccess = () => { const r = req.result.transaction('reviews').objectStore('reviews').count(); r.onsuccess = () => resolve(r.result); r.onerror = reject; };
  req.onerror = reject;
}));
if (reviews < 5) fail(`expected at least 5 persisted reviews, got ${reviews}`);

// --- iteration 3: remove examples, create a theme and a note, play it, edit it ---
await page.goto(`${URL}#bibliotheque`);
await page.getByRole('button', { name: 'Retirer les exemples' }).click();
await page.getByRole('button', { name: 'Oui, retirer' }).click();
await page.getByText(/Exemples retirés/).waitFor();
await page.goto(`${URL}#accueil`);
await page.getByText('Ajoute des cartes pour commencer.').waitFor();

await page.goto(`${URL}#creer`);
await page.getByLabel('Thème', { exact: true }).selectOption('__new');
await page.getByLabel('Nom du nouveau thème').fill('Écoute active');
await page.getByLabel('Nom du nouveau thème').press('Enter');
await page
  .waitForFunction(() => document.querySelector('#f-theme')?.selectedOptions[0]?.textContent === 'Écoute active', null, { timeout: 3000 })
  .catch(() => fail('Enter in the new theme field should create the theme'));
await page.getByRole('button', { name: 'Texte à trous' }).click();
await page.getByLabel('Texte', { exact: true }).fill('Reformuler sans gap');
await page.getByRole('button', { name: 'Ajouter au thème' }).click();
await page.locator('.field .error').first().waitFor();
if (!/trou/i.test(await page.locator('.field .error').first().innerText())) fail('expected a cloze validation message');
await page.getByLabel('Texte', { exact: true }).fill("L'écoute active repose sur la {{reformulation}} et le {{questionnement}}.");
await page.screenshot({ path: `${OUT}/editor.png`, fullPage: true });
await page.getByRole('button', { name: 'Ajouter au thème' }).click();
await page.getByText(/Ajouté à « Écoute active » : 2 cartes\. Tu les verras dans la séance du jour\./).waitFor();

await page.goto(`${URL}#accueil`);
const mine = await page.locator('.hero-meta').innerText();
if (!/2\s+nouvelles cartes/.test(mine)) fail(`expected the 2 new cards of my note on home, got "${mine}"`);
await page.locator('.hero .btn.sun').click();
await page.locator('.s-inner').first().waitFor();
await playRound(page);
await leaveRound(page);

await page.reload();
await page.goto(`${URL}#bibliotheque`);
await page.getByText("L'écoute active repose sur la [reformulation]").waitFor();
await page.getByRole('button', { name: 'Modifier' }).click();
await page.getByLabel('Texte', { exact: true }).fill("L'écoute active repose sur la {{reformulation}} et le {{silence}}.");
await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
await page.getByText("L'écoute active repose sur la [reformulation] et le [silence].").waitFor();
await page.screenshot({ path: `${OUT}/library.png`, fullPage: true });
await page.getByRole('button', { name: 'Modifier' }).click();
await page.getByRole('heading', { name: 'Modifier une carte' }).waitFor();
await page.getByRole('link', { name: 'Créer' }).click();
await page.getByRole('heading', { name: 'Créer une carte' }).waitFor({ timeout: 3000 }).catch(() => fail('nav "Créer" should leave edit mode'));

// --- iteration 5: PWA, offline, settings, backup ---
const manifest = await (await fetch(`${URL}manifest.webmanifest`)).json();
if (manifest.name !== 'Ancrage' || manifest.display !== 'standalone' || !manifest.icons?.some((i) => i.purpose === 'maskable')) fail('manifest is incomplete');

const ctx = await browser.newContext({ acceptDownloads: true });
const app = await ctx.newPage();
app.on('pageerror', (e) => errors.push(e.message));
await app.goto(URL);
await app.locator('.hero').waitFor();
await app.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await app.reload();
await app.locator('.hero').waitFor();
if (!(await app.evaluate(() => !!navigator.serviceWorker.controller))) fail('service worker does not control the page');
await ctx.setOffline(true);
await app.reload();
await app.locator('.hero').waitFor({ timeout: 5000 }).catch(() => fail('app does not load offline'));
await app.locator('.hero .btn.sun').click();
await app.locator('.s-inner').first().waitFor();
await playRound(app);
await app.keyboard.press('Escape');
await ctx.setOffline(false);

await app.goto(`${URL}#reglages`);
await app.getByRole('heading', { name: 'Synchronisation' }).waitFor({ timeout: 3000 }).catch(() => fail('settings should show the sync section'));
const slider = app.locator('#s-retention');
await slider.focus();
for (let i = 0; i < 5; i++) await app.keyboard.press('ArrowLeft');
await app.getByText('Rétention visée : 0,85').waitFor({ timeout: 3000 }).catch(() => fail('slider label should follow the value (0,85)'));
await app.getByRole('button', { name: 'Enregistrer' }).click();
await app.getByText('Réglages enregistrés.').waitFor({ timeout: 3000 }).catch(() => fail('saving the slider value should confirm'));
await app.getByLabel('Nouvelles cartes par jour').fill('12,5');
await app.getByRole('button', { name: 'Enregistrer' }).click();
await app.getByText('Le nombre de nouvelles cartes doit être un entier entre 0 et 50.').waitFor({ timeout: 3000 }).catch(() => fail('invalid setting should be refused'));
await app.getByLabel('Nouvelles cartes par jour').fill('8');
await app.getByRole('button', { name: 'Enregistrer' }).click();
await app.getByText('Réglages enregistrés.').waitFor();

const [download] = await Promise.all([app.waitForEvent('download'), app.getByRole('button', { name: 'Télécharger une sauvegarde' }).click()]);
if (!/^ancrage-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename())) fail(`unexpected backup name ${download.suggestedFilename()}`);
const backupPath = `${OUT}/${download.suggestedFilename()}`;
await download.saveAs(backupPath);
const countReviews = (p) => p.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('ancrage');
  req.onsuccess = () => { const r = req.result.transaction('reviews').objectStore('reviews').count(); r.onsuccess = () => resolve(r.result); };
}));
const reviewsBefore = await countReviews(app);

const fresh = await (await browser.newContext()).newPage();
await fresh.goto(`${URL}#reglages`);
await fresh.getByLabel('Ouvrir une sauvegarde').setInputFiles(backupPath);
await fresh.getByRole('button', { name: 'Remplacer mes données' }).click();
await fresh.getByText('Données restaurées.').waitFor({ timeout: 5000 }).catch(async () => fail(`restore failed: ${(await fresh.locator('main').innerText()).replace(/\s+/g, ' ').slice(-400)}`));
if ((await countReviews(fresh)) !== reviewsBefore) fail('restored review count differs');
if ((await fresh.getByLabel('Nouvelles cartes par jour').inputValue()) !== '8') fail('restored settings differ');
await fresh.getByLabel('Ouvrir une sauvegarde').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"autre"}') });
await fresh.getByText('Ce fichier n’est pas une sauvegarde Ancrage.').waitFor();
await fresh.screenshot({ path: `${OUT}/settings.png`, fullPage: true });

// --- v1.1: sync through a fake Supabase (network-level), and merge by file ---
const cloud = { users: new Map(), tokens: new Map(), rows: new Map() };
const fakeSupabase = async (route) => {
  const req = route.request();
  const url = new globalThis.URL(req.url());
  const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (req.headers().apikey !== 'anon-key') return reply(401, { message: 'Invalid API key' });
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  const issue = (email) => { const t = `t-${Math.random()}`; cloud.tokens.set(t, email); return { access_token: t, refresh_token: `r-${t}`, expires_in: 3600, user: { email } }; };
  if (url.pathname === '/auth/v1/signup') { cloud.users.set(body.email, body.password); return reply(200, issue(body.email)); }
  if (url.pathname === '/auth/v1/token') return cloud.users.get(body.email) === body.password ? reply(200, issue(body.email)) : reply(400, { error_description: 'Invalid login credentials' });
  // A project created before v1.11: no items table, the app falls back to the whole copy.
  if (url.pathname === '/rest/v1/ancrage_items') return reply(404, { code: 'PGRST205', message: "Could not find the table 'public.ancrage_items' in the schema cache" });
  const who = cloud.tokens.get((req.headers().authorization ?? '').replace('Bearer ', ''));
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
const syncDevice = async (name) => {
  const c = await browser.newContext({ serviceWorkers: 'block' });
  await c.route('https://projet.supabase.co/**', fakeSupabase);
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  return p;
};
const fillSync = async (p) => {
  await p.goto(`${URL}#reglages`);
  await p.getByLabel('Adresse du projet').fill('https://projet.supabase.co');
  await p.getByLabel('Clé publique (anon)').fill('anon-key');
  await p.getByLabel('E-mail').fill('benjamin@exemple.fr');
  await p.getByLabel('Mot de passe').fill('secret12');
};
const devA = await syncDevice('A');
await devA.goto(URL);
await devA.locator('.hero .btn.sun').click();
await devA.locator('.s-inner').first().waitFor();
await playRound(devA);
await leaveRound(devA);
await fillSync(devA);
await devA.getByRole('button', { name: 'Créer le compte' }).click();
await devA.getByText('Connecté : benjamin@exemple.fr').waitFor({ timeout: 5000 }).catch(async () => fail(`sync sign-up failed: ${(await devA.locator('main').innerText()).slice(-300)}`));
await devA.getByText('Synchronisé.').waitFor({ timeout: 5000 }).catch(() => fail('first sync should succeed'));
const reviewsA = await countReviews(devA);

const devB = await syncDevice('B');
await devB.goto(URL);
await devB.locator('.hero').waitFor();
await fillSync(devB);
await devB.getByRole('button', { name: 'Se connecter' }).click();
await devB.getByText('Synchronisé.').waitFor({ timeout: 5000 }).catch(async () => fail(`device B sync failed: ${(await devB.locator('main').innerText()).slice(-300)}`));
await devB.getByText(/Synchronisation complète : toute ta base voyage/).waitFor({ timeout: 3000 }).catch(() => fail('without the items table, settings should suggest the fast sync script'));
if ((await countReviews(devB)) !== reviewsA || reviewsA < 5) fail(`device B should have the ${reviewsA} reviews of A, has ${await countReviews(devB)}`);
await devB.goto(`${URL}#accueil`);
await devB.locator('.chip.streak').waitFor();
if (!(await devB.locator('.chip.streak').innerText()).startsWith('1')) fail('device B should show the streak earned on A');
await devB.screenshot({ path: `${OUT}/device-b-synced.png`, fullPage: true });

// Merge by file: a third profile with its own round merges the backup of A.
const devC = await (await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' })).newPage();
await devC.goto(URL);
await devC.locator('.hero .btn.sun').click();
await devC.locator('.s-inner').first().waitFor();
await playRound(devC);
await leaveRound(devC);
const reviewsC = await countReviews(devC);
await devA.goto(`${URL}#reglages`);
const [fileA] = await Promise.all([devA.waitForEvent('download'), devA.getByRole('button', { name: 'Télécharger une sauvegarde' }).click()]);
const pathA = `${OUT}/device-a.json`;
await fileA.saveAs(pathA);
await devC.goto(`${URL}#reglages`);
await devC.getByLabel('Ouvrir une sauvegarde').setInputFiles(pathA);
await devC.getByRole('button', { name: 'Fusionner avec mes données' }).click();
await devC.getByText('Sauvegarde fusionnée avec tes données.').waitFor();
if ((await countReviews(devC)) !== reviewsA + reviewsC) fail(`merge should keep ${reviewsA} + ${reviewsC} reviews, has ${await countReviews(devC)}`);

// --- v1.2: card generation against an intercepted Anthropic API ---
const blank = (type) => ({ type, front: '', back: '', reverse: false, text: '', title: '', steps: [], statement: '', categories: [], answer: '', question: '', distractors: [], situation: '', model: '', keyPoints: [], rationale: '' });
const aiNotes = [
  { ...blank('basic'), front: 'Que signifie VAKOG ?', back: 'Visuel, Auditif, Kinesthésique, Olfactif, Gustatif', rationale: 'Définition centrale du texte.' },
  { ...blank('mcq'), question: 'Quel est le but du recadrage ?', answer: 'Changer le sens donné à une situation', distractors: ['Changer la situation', 'Ignorer le problème'], rationale: 'Distinction clé.' },
  { ...blank('mcq'), question: 'QCM sans distracteur', answer: 'Seule réponse', distractors: [], rationale: 'Invalide.' },
];
let aiCalls = 0;
const aiCtx = await browser.newContext({ serviceWorkers: 'block' });
await aiCtx.route('https://api.anthropic.com/**', async (route) => {
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  aiCalls++;
  const body = { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ notes: aiNotes }) }], usage: { input_tokens: 10, output_tokens: 10 } };
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
});
const ai = await aiCtx.newPage();
ai.on('pageerror', (e) => errors.push(`ai: ${e.message}`));
await ai.goto(`${URL}#creer`);
await ai.getByRole('button', { name: 'Générer depuis un texte' }).click();
await ai.getByLabel('Texte', { exact: true }).fill('Le VAKOG décrit les canaux sensoriels. Le recadrage change le sens donné à une situation.');
await ai.getByLabel('Source').fill('Module 3');
await ai.getByRole('button', { name: 'Générer les cartes' }).click();
await ai.getByText('Ajoute ta clé API Anthropic pour générer des cartes.').waitFor({ timeout: 3000 }).catch(() => fail('generating without a key should explain a key is needed'));
if (aiCalls !== 0) fail('no API call should happen without a key');
await ai.getByLabel('Clé API Anthropic').fill('sk-ant-test');
await ai.getByRole('button', { name: 'Générer les cartes' }).click();
await ai.getByRole('heading', { name: '2 cartes proposées' }).waitFor({ timeout: 10000 }).catch(async () => fail(`generation failed: ${(await ai.locator('main').innerText()).replace(/\s+/g, ' ').slice(-300)}`));
await ai.getByText('1 proposition écartée').waitFor();
await ai.screenshot({ path: `${OUT}/generate.png`, fullPage: true });
await ai.goto(`${URL}#accueil`);
await ai.locator('.hero').waitFor();
await ai.goto(`${URL}#creer`);
await ai.getByRole('heading', { name: '2 cartes proposées' }).waitFor({ timeout: 3000 }).catch(() => fail('proposals should survive navigation'));
await ai.locator('.proposal').nth(0).getByRole('button', { name: 'Ajouter' }).click();
await ai.locator('.proposal').nth(0).getByText('Ajoutée.').waitFor();
await ai.locator('.proposal').nth(1).getByRole('button', { name: 'Modifier' }).click();
const q = ai.getByLabel('Question');
await q.waitFor();
await q.fill('Quel est le but du recadrage en PNL ?');
await ai.getByRole('button', { name: 'Ajouter au thème' }).click();
await ai.getByRole('heading', { name: '2 cartes proposées' }).waitFor();
if ((await ai.locator('.proposal .notice').count()) !== 2) fail('both proposals should be marked added');
const aiSaved = await ai.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('ancrage');
  req.onsuccess = () => { const r = req.result.transaction('notes').objectStore('notes').getAll(); r.onsuccess = () => resolve(r.result.filter((n) => n.tags.includes('ia')).map((n) => ({ q: n.fields.question ?? n.fields.front, source: n.source }))); };
}));
if (aiSaved.length !== 2) fail(`library should hold 2 notes tagged ia, has ${aiSaved.length}`);
if (!aiSaved.some((n) => n.q === 'Quel est le but du recadrage en PNL ?')) fail('the edited version should be saved');
if (aiSaved.some((n) => n.q === 'Quel est le but du recadrage ?')) fail('the unedited version should not be saved');
if (!aiSaved.every((n) => n.source === 'Module 3')) fail('generated notes should keep the source title');
if (aiCalls !== 1) fail(`expected exactly 1 API call, got ${aiCalls}`);

// --- v1.3: motivation settings, plan, a fresh home before any round ---
const fresh13 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
fresh13.on('pageerror', (e) => errors.push(`v1.3: ${e.message}`));
await fresh13.goto(URL);
await fresh13.locator('.hero').waitFor();
if ((await fresh13.locator('.ring').getAttribute('aria-label')) !== 'Objectif du jour : 0 cartes sur 5') fail(`fresh ring should read 0/5, got ${await fresh13.locator('.ring').getAttribute('aria-label')}`);
if ((await fresh13.locator('.week-card .wd.today').count()) !== 1) fail('fresh week strip should mark today');
await fresh13.screenshot({ path: `${OUT}/home-fresh.png`, fullPage: true });

// --- v1.4: study as much as wanted, the themes wanted ---
await fresh13.locator('.hero .btn.sun').click();
await fresh13.locator('.s-inner').first().waitFor();
await playRound(fresh13);
await leaveRound(fresh13);
await fresh13.getByRole('button', { name: 'Choisir quoi réviser' }).or(fresh13.getByRole('button', { name: 'S’entraîner ou apprendre plus' })).click();
await fresh13.getByRole('heading', { name: 'Choisir quoi réviser' }).waitFor();
if (!(await fresh13.getByRole('radio', { name: /Nouvelles cartes/ }).isChecked())) fail('with the daily new cards done, the picker should suggest new cards');
await fresh13.getByRole('button', { name: '10', exact: true }).click();
await fresh13.screenshot({ path: `${OUT}/custom.png`, fullPage: true });
const reviewsBeforeCustom = await countReviews(fresh13);
await fresh13.getByRole('button', { name: /Commencer \(10 cartes\)/ }).click();
await fresh13.locator('.s-inner').first().waitFor();
await playRound(fresh13);
await fresh13.getByText('Il reste des cartes dans ta sélection.').or(fresh13.getByText('Ta sélection est terminée.')).waitFor({ timeout: 3000 }).catch(() => fail('a custom round should say what is left of the selection'));
await leaveRound(fresh13);
if ((await countReviews(fresh13)) < reviewsBeforeCustom + 10) fail('a custom round of 10 new cards should record at least 10 answers beyond the daily limit');
await fresh13.goto(`${URL}#reviser`);
await fresh13.getByRole('radio', { name: /Entraînement libre/ }).check({ force: true });
await fresh13.getByRole('button', { name: /Commencer \(\d+ cartes?\)/ }).click();
await fresh13.locator('.s-inner .pill', { hasText: 'Entraînement' }).first().waitFor({ timeout: 3000 }).catch(() => fail('practice cards should be labelled'));
await fresh13.keyboard.press('Escape');
await fresh13.goto(`${URL}#accueil`);
await fresh13.locator('.node').nth(1).click();
await fresh13.getByRole('button', { name: 'Réviser ce thème' }).click();
await fresh13.getByRole('heading', { name: 'Choisir quoi réviser' }).waitFor();
if ((await fresh13.locator('.pick input:checked').count()) !== 1) fail('« Réviser ce thème » should preselect that theme only');

// --- v1.5: character, shop, character on the path ---
// v1.9: a mixed domain (the default for coaching) shows a map of its themes; chapter by chapter brings the path back.
await fresh13.goto(`${URL}#accueil`);
await fresh13.locator('.path.map').waitFor({ timeout: 3000 }).catch(() => fail('a mixed domain shows a progress map'));
if (await fresh13.locator('.walker').count()) fail('no character walks on a mixed domain');
await fresh13.getByRole('heading', { name: 'Tes thèmes' }).waitFor();
await fresh13.goto(`${URL}#bibliotheque`);
await fresh13.getByLabel(/Ordre des nouvelles cartes du domaine/).first().selectOption('chapter');
await fresh13.getByText(/les nouvelles cartes viennent chapitre par chapitre/).waitFor();
await fresh13.goto(`${URL}#accueil`);
await fresh13.locator('.walker').waitFor({ timeout: 3000 }).catch(() => fail('the character should stand on the current chapter'));
await fresh13.getByRole('heading', { name: 'Ton parcours' }).waitFor();
await fresh13.getByRole('link', { name: 'Choisir mon personnage' }).click();
await fresh13.getByRole('heading', { name: 'Choisis ton personnage' }).waitFor();
await fresh13.screenshot({ path: `${OUT}/shop-pick.png`, fullPage: true });
await fresh13.locator('label.char', { hasText: 'Lapin' }).click();
await fresh13.getByLabel('Son nom').fill('Pompon');
await fresh13.getByRole('button', { name: 'C’est parti' }).click();
await fresh13.getByRole('heading', { name: 'Pompon' }).waitFor({ timeout: 3000 }).catch(() => fail('the chosen name should head the shop'));
const balanceText = async () => Number((await fresh13.locator('.wallet-n').innerText()).replace(/\D/g, ''));
const balance0 = await balanceText();
if (balance0 < 60) fail(`expected enough XP for a common item, got ${balance0}`);
await fresh13.getByRole('button', { name: 'Chapeaux' }).click();
await fresh13.getByRole('button', { name: 'Essayer Couronne dorée' }).click();
await fresh13.getByText('Essayage : Couronne dorée. Rien n’est acheté.').waitFor();
if (await fresh13.getByRole('button', { name: 'Acheter Couronne dorée' }).isEnabled()) fail('an item too expensive should not be buyable');
await fresh13.screenshot({ path: `${OUT}/shop.png`, fullPage: true });
const bonnet = fresh13.locator('.item', { hasText: 'Bonnet de laine' });
await bonnet.getByRole('button', { name: 'Acheter Bonnet de laine' }).click();
await bonnet.getByRole('button', { name: 'Oui' }).dblclick();
await fresh13.getByText(/Acheté et porté.*Bonnet de laine/).waitFor({ timeout: 3000 }).catch(() => fail('buying should confirm'));
const purchases = await fresh13.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('ancrage');
  req.onsuccess = () => { const r = req.result.transaction('events').objectStore('events').getAll(); r.onsuccess = () => resolve(r.result.filter((e) => e.type === 'purchase').length); };
}));
if (purchases !== 1) fail(`a double click should buy once, got ${purchases} purchases`);
if ((await balanceText()) !== balance0 - 60) fail('the balance should drop by the price');
await fresh13.reload();
await fresh13.getByRole('button', { name: 'Chapeaux' }).click();
if (!(await bonnet.getByText('Porté').isVisible())) fail('the bought item should be worn after reload');
await bonnet.getByRole('button', { name: 'Revendre Bonnet de laine' }).click();
await bonnet.getByRole('button', { name: 'Oui' }).click();
await fresh13.getByText(/Revente.*Bonnet de laine, \+30 XP/).waitFor();
if ((await balanceText()) !== balance0 - 30) fail('selling should give half back');
await fresh13.goto(`${URL}#accueil`);
await fresh13.locator('.goal-card').waitFor();
await fresh13.waitForTimeout(800);
await fresh13.screenshot({ path: `${OUT}/home-character.png`, fullPage: true });
await app.goto(`${URL}#accueil`);
await app.getByRole('button', { name: 'Fixer un rendez-vous' }).click();
await app.getByLabel('Heure').fill('07:30');
await app.getByLabel('Moment').fill('après le café');
await app.getByRole('button', { name: 'Fixer le rendez-vous' }).click();
await app.getByText('Chaque jour à 7 h 30').waitFor({ timeout: 3000 }).catch(() => fail('the plan should be shown once set'));
const [ics] = await Promise.all([app.waitForEvent('download'), app.getByRole('button', { name: 'Ajouter à mon agenda' }).click()]);
const icsPath = `${OUT}/${ics.suggestedFilename()}`;
await ics.saveAs(icsPath);
const icsText = (await import('node:fs')).readFileSync(icsPath, 'utf8');
if (!icsText.includes('RRULE:FREQ=DAILY') || !icsText.includes('T073000') || !icsText.includes('après le café')) fail('calendar file is wrong');
await app.reload();
await app.getByText('Chaque jour à 7 h 30').waitFor({ timeout: 3000 }).catch(() => fail('the plan should persist'));
await app.goto(`${URL}#reglages`);
await app.getByLabel('Sons').uncheck();
await app.getByLabel('Afficher la série').uncheck();
await app.getByLabel('Objectif du jour').selectOption('2');
await app.reload();
await app.getByRole('heading', { name: 'Motivation' }).waitFor();
if (await app.getByLabel('Sons').isChecked()) fail('sound off should persist');
if ((await app.getByLabel('Objectif du jour').inputValue()) !== '2') fail('daily goal should persist');
await app.goto(`${URL}#accueil`);
await app.locator('.hero').waitFor();
if ((await app.locator('.chip.streak').count()) || (await app.locator('.week-days').count())) fail('hidden streak should hide chips and strip');
if (!(await app.locator('.hero .eyebrow').textContent()).includes('2 manches')) fail('home should show the 2-round goal');
await app.goto(`${URL}#reglages`);
await app.getByLabel('Afficher la série').check();

// --- v1.6: family profiles and domains ---
const fam = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } })).newPage();
fam.on('pageerror', (e) => errors.push(`family: ${e.message}`));
await fam.goto(`${URL}#bibliotheque`);
await fam.getByRole('heading', { name: 'Coaching et PNL', level: 2 }).waitFor({ timeout: 5000 }).catch(() => fail('existing themes should be grouped under « Coaching et PNL »'));
await fam.goto(`${URL}#reglages`);
await fam.getByRole('button', { name: 'Ajouter un profil' }).click();
await fam.getByLabel('Prénom').fill('Léa');
await fam.getByLabel('Pour qui ?').fill('élève de 5e');
await fam.getByLabel('Code (4 chiffres, facultatif)').fill('1234');
await fam.getByRole('button', { name: 'Créer le profil' }).click();
await fam.getByText(/Profil «.Léa.» créé/).waitFor();
await fam.getByRole('button', { name: 'Ouvrir maintenant' }).waitFor();
await fam.locator('.profile-row', { hasText: 'Léa' }).getByRole('button', { name: 'Ouvrir', exact: true }).click();
// Opening another profile from Réglages asks for its code too.
await fam.getByLabel('Code de Léa').fill('1234');
await fam.getByRole('button', { name: 'Valider' }).click();
await fam.waitForLoadState('load');
await fam.goto(`${URL}#accueil`);
await fam.locator('.domain-tabs').waitFor({ timeout: 5000 }).catch(() => fail('Léa should see her subjects as domain tabs'));
const tabsText = await fam.locator('.domain-tabs').innerText();
if (!/Mathématiques/.test(tabsText) || !/Anglais/.test(tabsText) || /Coaching/.test(tabsText)) fail(`unexpected domains for Léa: ${tabsText}`);
await fam.getByRole('button', { name: 'Français' }).click();
await fam.locator('.node', { hasText: 'Grammaire' }).waitFor();
await fam.screenshot({ path: `${OUT}/family-lea.png`, fullPage: true });
await fam.locator('.hero .btn.sun').click();
await fam.locator('.s-inner').first().waitFor();
await playRound(fam);
await leaveRound(fam);
const leaXp = Number((await fam.locator('.chip.xp').innerText()).replace(/\D/g, ''));
if (!(leaXp > 0)) fail('Léa should have earned XP');
await fam.locator('.profile-chip').click();
await fam.getByRole('heading', { name: 'Qui révise ?' }).waitFor({ timeout: 5000 }).catch(() => fail('switching should ask who reviews'));
await fam.screenshot({ path: `${OUT}/family-who.png` });
await fam.getByRole('button', { name: /Principal/ }).click();
await fam.locator('.chip.xp').waitFor();
if (!(await fam.locator('.chip.xp').innerText()).startsWith('0')) fail('the main profile should not get Léa’s XP');
await fam.locator('.profile-chip').click();
await fam.getByRole('button', { name: /Léa/ }).click();
await fam.getByLabel('Entre ton code').fill('0000');
await fam.getByRole('button', { name: 'Ouvrir' }).click();
await fam.getByText('Ce n’est pas le bon code.').waitFor();
await fam.getByLabel('Entre ton code').fill('1234');
await fam.getByRole('button', { name: 'Ouvrir' }).click();
await fam.locator('.chip.xp').waitFor();
if (Number((await fam.locator('.chip.xp').innerText()).replace(/\D/g, '')) !== leaXp) fail('Léa should find her own XP again');
// Each tab keeps its own profile: choosing the main profile in a second tab leaves this one on Léa.
const tab2 = await fam.context().newPage();
await tab2.goto(URL);
await tab2.getByRole('heading', { name: 'Qui révise ?' }).waitFor();
await tab2.getByRole('button', { name: /Principal/ }).click();
await tab2.locator('.hero').waitFor();
await fam.reload();
await fam.locator('.profile-chip').waitFor();
if (!(await fam.locator('.profile-chip').innerText()).includes('Léa')) fail('another tab’s choice must not switch this tab’s profile');
await tab2.close();
await fam.locator('.profile-chip').click();
await fam.getByRole('button', { name: /Principal/ }).click();
await fam.locator('.hero').waitFor();
await fam.goto(`${URL}#reglages`);
await fam.locator('.profile-row', { hasText: 'Léa' }).getByRole('button', { name: 'Supprimer' }).click();
await fam.getByLabel('Code de Léa').fill('1234');
await fam.getByRole('button', { name: 'Valider' }).click();
await fam.getByLabel(/Tape «.Léa.»/).fill('Léa');
await fam.getByRole('button', { name: 'Supprimer définitivement' }).click();
await fam.getByText(/Profil «.Léa.» (supprimé|retiré)/).waitFor();

// --- v1.7: import documents, hard cards, AI feedback on scenarios, memory and effectiveness ---
function tinyPdf(text) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const calls17 = { gen: [], evals: 0 };
const ctx17 = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
await ctx17.route('https://api.anthropic.com/**', async (route) => {
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  const req = JSON.parse(route.request().postData() ?? '{}');
  let payload;
  if (String(req.system).includes('superviseur')) {
    calls17.evals++;
    payload = { verdict: 'partiel', points: [{ covered: true, comment: 'Question ouverte.' }, { covered: false, comment: 'Le mot du client n’est pas repris.' }], feedback: 'Bonne piste, reprends ses mots.', improved: 'Jamais ? Qu’est-ce qui te fait dire jamais ?' };
  } else {
    const user = req.messages[0].content;
    calls17.gen.push(user);
    payload = user.includes('Calibrer')
      ? { notes: [{ ...blank('scenario'), situation: 'Je n’y arriverai jamais.', model: 'Qu’est-ce qui te fait dire « jamais » ?', keyPoints: ['Question ouverte', 'Reprend le mot du client'], rationale: 'Pratique.' }] }
      : { notes: [{ ...blank('basic'), front: `Carte ${calls17.gen.length}`, back: 'Réponse', rationale: 'Texte.' }] };
  }
  const body = { id: 'msg_17', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(payload) }], usage: { input_tokens: 10, output_tokens: 10 } };
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
});
const v17 = await ctx17.newPage();
v17.on('pageerror', (e) => errors.push(`v1.7: ${e.message}`));
await v17.goto(`${URL}#creer`);
await v17.getByRole('button', { name: 'Générer depuis un texte' }).click();
await v17.locator('.file-btn input').setInputFiles([
  { name: 'Ancrage PNL.md', mimeType: 'text/markdown', buffer: Buffer.from('---\ntags: pnl\n---\n# Ancrage\nUn [[stimulus|déclencheur]] associé à un état.\n## Étapes\n1. Calibrer\n2. Installer\n# Vide\n') },
  { name: 'metamodele.pdf', mimeType: 'application/pdf', buffer: tinyPdf('Le metamodele questionne les generalisations.') },
]);
await v17.locator('.section-row').nth(2).waitFor({ timeout: 15000 }).catch(async () => fail(`imported sections not listed: ${(await v17.locator('main').innerText()).slice(0, 400)}`));
const titles = await v17.locator('.section-row b').allTextContents();
if (JSON.stringify(titles) !== JSON.stringify(['Ancrage', 'Étapes', 'metamodele'])) fail(`unexpected sections: ${titles.join(' | ')}`);
if (!(await v17.locator('.section-row', { hasText: 'metamodele' }).innerText()).match(/\d+ caractères/)) fail('a section shows its size');
await v17.getByLabel('Clé API Anthropic').fill('sk-ant-test');
await v17.getByRole('button', { name: 'Générer pour 3 sections' }).click();
await v17.getByRole('heading', { name: '3 cartes proposées' }).waitFor({ timeout: 15000 }).catch(async () => fail(`import generation failed: ${(await v17.locator('main').innerText()).replace(/\s+/g, ' ').slice(-300)}`));
if (calls17.gen.length !== 3) fail(`expected one call per section, got ${calls17.gen.length}`);
if (!calls17.gen.some((u) => u.includes('Le metamodele questionne'))) fail('the PDF text should be sent');
if (!calls17.gen.some((u) => u.includes('Un déclencheur associé'))) fail('wiki links should be reduced to their text');
if ((await v17.locator('.group-title').count()) !== 3) fail('proposals grouped by section');
await v17.screenshot({ path: `${OUT}/import.png`, fullPage: true });
const themesBefore = await v17.evaluate(() => new Promise((res) => { const r = indexedDB.open('ancrage'); r.onsuccess = () => { const q = r.result.transaction('themes').objectStore('themes').getAll(); q.onsuccess = () => res(q.result.length); }; }));
await v17.getByRole('button', { name: 'Tout ajouter (3)' }).click();
await v17.getByText('3 cartes ajoutées à ta bibliothèque.').waitFor();
const imported = await v17.evaluate(() => new Promise((res) => { const r = indexedDB.open('ancrage'); r.onsuccess = () => { const tx = r.result.transaction(['themes', 'notes']); const t = tx.objectStore('themes').getAll(); const n = tx.objectStore('notes').getAll(); tx.oncomplete = () => res({ themes: t.result, notes: n.result.filter((x) => x.tags.includes('ia')) }); }; }));
if (imported.themes.length !== themesBefore + 3) fail(`one new theme per section expected, got ${imported.themes.length - themesBefore}`);
for (const name of ['Ancrage', 'Étapes', 'metamodele']) if (!imported.themes.some((t) => t.name === name && t.parentId)) fail(`theme ${name} should be created in a domain`);
if (!imported.notes.some((n) => n.source === 'Ancrage PNL — Étapes')) fail(`source should name the file and section: ${imported.notes.map((n) => n.source).join(', ')}`);

// The scenario card, answered in writing, gets Claude's feedback and a suggested grade.
await v17.goto(`${URL}#reviser`);
await v17.getByRole('button', { name: 'Aucun', exact: true }).click();
await v17.locator('label.pick', { hasText: 'Étapes' }).locator('input').check();
await v17.getByRole('button', { name: /Commencer \(1 carte\)/ }).click();
await v17.getByText('Je n’y arriverai jamais.').waitFor();
await v17.getByPlaceholder('Écris ta réponse, comme en séance…').fill('Qu’est-ce qui te bloque ?');
await v17.getByRole('button', { name: 'Afficher la réponse' }).click();
await v17.getByRole('button', { name: 'Retour de Claude sur ma réponse' }).click();
await v17.locator('.ai-eval').getByText('Partiel').waitFor({ timeout: 5000 }).catch(() => fail('the AI verdict should show'));
if ((await v17.locator('.eval-points li').count()) !== 2) fail('one line per key point');
if (!(await v17.locator('.self .btn.suggested').textContent()).includes('Difficile')) fail('a partial answer should suggest « Difficile »');
if (calls17.evals !== 1) fail(`expected one evaluation call, got ${calls17.evals}`);
await v17.screenshot({ path: `${OUT}/scenario-feedback.png`, fullPage: true });
await v17.getByRole('button', { name: 'Difficile' }).click();
await v17.getByRole('button', { name: 'Continuer' }).click();
await v17.getByText('Manche terminée').waitFor();
// Summary, then the streak screen.
await v17.getByRole('button', { name: 'Continuer' }).click();
await v17.getByRole('button', { name: 'Terminer' }).click();
await v17.locator('.session').waitFor({ state: 'detached' });

// A card forgotten 4 times shows in the library: reword it, put it aside, resume it.
await v17.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('ancrage');
  r.onsuccess = () => {
    const db = r.result;
    const tx = db.transaction(['notes', 'cards', 'reviews'], 'readwrite');
    const notes = tx.objectStore('notes').getAll();
    const cards = tx.objectStore('cards').getAll();
    tx.oncomplete = () => {
      const note = notes.result.find((n) => n.fields.front === 'Carte 1');
      const card = cards.result.find((c) => c.noteId === note.id);
      const w = db.transaction('reviews', 'readwrite');
      let t = Date.now() - 180 * 86_400_000;
      let i = 0;
      const add = (rating, ts) => w.objectStore('reviews').put({ id: `hard-${i++}`, cardId: card.id, ts, rating, mode: 'self', correct: rating > 1, durationMs: 3000, hintUsed: false, deviceId: 'smoke' });
      for (let k = 0; k < 4; k++) { add(3, t); add(3, (t += 3 * 86_400_000)); add(3, (t += 10 * 86_400_000)); add(1, (t += 30 * 86_400_000)); t += 86_400_000; }
      w.oncomplete = () => res();
    };
  };
}));
await v17.goto(`${URL}#bibliotheque`);
await v17.reload();
await v17.getByRole('heading', { name: 'Cartes difficiles' }).waitFor({ timeout: 5000 }).catch(() => fail('a card forgotten 4 times should be listed as hard'));
const hardItem = v17.locator('section', { has: v17.getByRole('heading', { name: 'Cartes difficiles' }) }).locator('.note-item', { hasText: 'Carte 1' });
if (!(await hardItem.innerText()).match(/Oubliée \d+ fois/)) fail('hard card shows how often it was forgotten');
await hardItem.getByRole('button', { name: 'Reformuler avec l’IA' }).click();
await v17.getByText(/Reformulation de «.Carte 1/).waitFor({ timeout: 3000 }).catch(() => fail('reword opens Generate prefilled'));
if (!(await v17.getByLabel('Texte', { exact: true }).inputValue()).includes('Question : Carte 1')) fail('reword prefills the card text');
await v17.getByRole('button', { name: 'Générer les cartes' }).click();
await v17.getByRole('heading', { name: '1 carte proposée' }).waitFor();
if (!calls17.gen[calls17.gen.length - 1].includes('Consigne : Cette carte est souvent oubliée')) fail('reword sends the instruction');
await v17.locator('.proposal').getByRole('button', { name: 'Ajouter' }).click();
await v17.getByRole('button', { name: 'Mettre l’ancienne carte de côté' }).click();
await v17.getByText('Ancienne carte mise de côté.').waitFor();
await v17.goto(`${URL}#bibliotheque`);
await v17.getByRole('heading', { name: 'Mises de côté' }).waitFor();
if (await v17.getByRole('heading', { name: 'Cartes difficiles' }).isVisible()) fail('a suspended note is no longer listed as hard');
await v17.screenshot({ path: `${OUT}/library-hard.png`, fullPage: true });
await v17.locator('section', { has: v17.getByRole('heading', { name: 'Mises de côté' }) }).getByRole('button', { name: 'Reprendre' }).click();
await v17.getByText('Note reprise : elle revient dans tes révisions.').waitFor();
await v17.getByRole('heading', { name: 'Cartes difficiles' }).waitFor();

// Memory on the path, and the dashboard on Progrès.
await v17.goto(`${URL}#accueil`);
await v17.locator('.node[aria-label^="Étapes"]').click();
await v17.locator('.memory-line').waitFor({ timeout: 3000 }).catch(() => fail('a studied theme shows its memory'));
if (!/Mémoire actuelle : \d+\u202f%/.test(await v17.locator('.memory-line').innerText())) fail('memory shown as a percentage');
await v17.goto(`${URL}#progres`);
await v17.getByRole('heading', { name: 'Est-ce que ça marche ?' }).waitFor();
const works = await v17.locator('.works').innerText();
if (!/Cartes difficiles\s*1/i.test(works)) fail(`dashboard counts the hard card: ${works.replace(/\s+/g, ' ').slice(0, 300)}`);
if (!works.includes('Par type d’exercice')) fail('dashboard breaks success down by type');
await v17.screenshot({ path: `${OUT}/progress-works.png`, fullPage: true });
await ctx17.close();

// --- v1.8: masked images, reading aloud, reading language ---
function tinyPng(w, h) {
  const zlib = require('node:zlib');
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = []; for (let y = 0; y < h; y++) { const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { row[1 + x * 3] = (x * 255) / w; row[2 + x * 3] = 120; row[3 + x * 3] = (y * 255) / h; } rows.push(row); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const v18 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
v18.on('pageerror', (e) => errors.push(`v1.8: ${e.message}`));
await v18.goto(`${URL}#bibliotheque`);
await v18.locator('#new-theme').fill('Schémas');
await v18.locator('form', { has: v18.locator('#new-theme') }).getByRole('button', { name: 'Créer' }).click();
await v18.getByText('Thème « Schémas » créé.').waitFor();
await v18.goto(`${URL}#creer`);
await v18.getByRole('button', { name: 'Image masquée' }).click();
await v18.getByLabel('Thème').selectOption({ label: 'Schémas' });
await v18.locator('.file-btn input[type=file]').setInputFiles({ name: 'coeur.png', mimeType: 'image/png', buffer: tinyPng(600, 400) });
const masker = v18.locator('.masker');
await masker.locator('img').waitFor({ timeout: 5000 }).catch(() => fail('the chosen image should show in the zone editor'));
const src = await masker.locator('img').getAttribute('src');
if (!/^data:image\/(webp|jpeg)/.test(src ?? '')) fail(`image should be compressed to webp or jpeg, got ${src?.slice(0, 30)}`);
for (const [x, y] of [[0.1, 0.1], [0.5, 0.2], [0.2, 0.6]]) {
  await masker.scrollIntoViewIfNeeded();
  const box = await masker.boundingBox();
  await v18.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await v18.mouse.down();
  await v18.mouse.move(box.x + box.width * (x + 0.2), box.y + box.height * (y + 0.15), { steps: 5 });
  await v18.mouse.up();
}
if ((await masker.locator('.zone.edit').count()) !== 3) fail(`three zones should be drawn, got ${await masker.locator('.zone.edit').count()}`);
for (const [i, label] of ['Oreillette droite', 'Aorte', 'Ventricule gauche'].entries()) await v18.getByLabel(`Réponse de la zone ${i + 1}`).fill(label);
await v18.getByLabel('Consigne').fill('Légende le schéma du cœur');
await v18.screenshot({ path: `${OUT}/image-editor.png`, fullPage: true });
await v18.getByRole('button', { name: 'Ajouter au thème' }).click();
await v18.getByText(/Ajouté à «.Schémas.» : 3 cartes/).waitFor({ timeout: 5000 }).catch(async () => fail(`saving the image note failed: ${(await v18.locator('main').innerText()).slice(0, 300)}`));

await v18.goto(`${URL}#reviser`);
await v18.getByRole('button', { name: 'Aucun', exact: true }).click();
await v18.locator('label.pick', { hasText: 'Schémas' }).locator('input').check();
await v18.getByRole('button', { name: /Commencer \(3 cartes\)/ }).click();
await v18.getByRole('heading', { name: 'Légende le schéma du cœur' }).waitFor();
if (!(await v18.locator('.figure .zone.target').textContent()).includes('?')) fail('the zone to find is hidden behind ?');
if (!(await v18.getByRole('button', { name: 'Écouter la question' }).isVisible())) fail('the listen button shows where speech is available');
await v18.getByRole('button', { name: 'Écouter la question' }).click();
if ((await v18.locator('.opts .opt').count()) !== 3) fail('a young zone is a choice among the 3 answers');
await v18.locator('.opts .opt').first().click();
await v18.getByRole('button', { name: 'Vérifier' }).click();
await v18.locator('.figure .zone.target.uncovered').waitFor();
await v18.locator('.figure .zone-label').waitFor();
await v18.screenshot({ path: `${OUT}/image-session.png`, fullPage: true });
await v18.keyboard.press('Escape');
await v18.locator('.session').waitFor({ state: 'detached' });

// Reading language per domain, and the device setting.
await v18.goto(`${URL}#bibliotheque`);
const dsel = v18.getByLabel(/Langue de lecture du domaine/).first();
await dsel.selectOption('en-GB');
await v18.getByText(/Lecture à voix haute de .* : Anglais/).waitFor();
await v18.reload();
if ((await v18.getByLabel(/Langue de lecture du domaine/).first().inputValue()) !== 'en-GB') fail('the domain language should persist');
await v18.goto(`${URL}#reglages`);
await v18.getByLabel('Lire chaque carte automatiquement, puis sa réponse').check();
await v18.reload();
if (!(await v18.getByLabel('Lire chaque carte automatiquement, puis sa réponse').isChecked())) fail('the read aloud setting should persist');
await v18.close();

// --- v1.9: mix and situations ---
const v19 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
v19.on('pageerror', (e) => errors.push(`v1.9: ${e.message}`));
await v19.goto(`${URL}#reviser`);
await v19.getByRole('heading', { name: 'Choisir quoi réviser' }).waitFor();
await v19.locator('label.mode', { hasText: 'Situations mêlées' }).click();
const sitBtn = v19.getByRole('button', { name: /Commencer \(\d+ cartes?\)/ });
const nSit = Number((await sitBtn.innerText()).match(/\d+/)[0]);
if (nSit < 3) fail(`the coaching examples should give several situations, got ${nSit}`);
await sitBtn.click();
const kinds = [];
for (let i = 0; i < 4; i++) {
  const reveal = v19.getByRole('button', { name: 'Afficher la réponse' });
  const opt = v19.locator('.opts .opt:not([disabled])').first();
  const end = v19.getByText('Manche terminée');
  await reveal.or(opt).or(end).first().waitFor();
  if (await end.isVisible()) break;
  kinds.push(await v19.locator('.s-inner h2.ex-title').first().innerText());
  if (await reveal.isVisible()) {
    await v19.getByRole('button', { name: 'Afficher la réponse' }).click();
    await v19.getByRole('button', { name: 'Su' }).click();
  } else {
    await v19.locator('.opts .opt').first().click();
    await v19.getByRole('button', { name: 'Vérifier' }).click();
  }
  await v19.getByRole('button', { name: 'Continuer' }).click();
}
if (!kinds.every((k) => /client|catégorie/i.test(k))) fail(`situations should only be scenarios and classifications: ${kinds.join(' | ')}`);
// Actions in flight (the next card loading) come first: wait for it, then leave.
await v19.locator('.s-inner').first().waitFor();
await v19.waitForTimeout(400);
await v19.getByRole('button', { name: 'Quitter la séance' }).click();
await v19.locator('.session').waitFor({ state: 'detached' });
await v19.goto(`${URL}#reviser`);
await v19.locator('label.mode', { hasText: 'Mélange' }).click();
await v19.getByRole('button', { name: /Commencer \(\d+ cartes?\)/ }).waitFor();
await v19.screenshot({ path: `${OUT}/custom-mix.png`, fullPage: true });
await v19.goto(`${URL}#accueil`);
await v19.locator('.path.map').waitFor();
await v19.screenshot({ path: `${OUT}/home-map.png`, fullPage: true });
await v19.close();

// --- v1.10: explanations ---
let explainCalls = 0;
const ctx110 = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
await ctx110.addInitScript(() => localStorage.setItem('ancrage.ai.key', 'sk-ant-test'));
await ctx110.route('https://api.anthropic.com/**', async (route) => {
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  explainCalls++;
  const req = JSON.parse(route.request().postData() ?? '{}');
  const ids = [...req.messages[0].content.matchAll(/<carte id="([^"]+)">/g)].map((m) => m[1]);
  const payload = { items: ids.map((id) => ({ id, explanation: `Explication de Claude pour ${id}.` })) };
  const body = { id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(payload) }], usage: { input_tokens: 1, output_tokens: 1 } };
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
});
const v110 = await ctx110.newPage();
v110.on('pageerror', (e) => errors.push(`v1.10: ${e.message}`));
// A wrong answer on an example card opens its built-in explanation.
await v110.goto(`${URL}#reviser`);
await v110.getByRole('button', { name: 'Aucun', exact: true }).click();
await v110.locator('label.pick', { hasText: 'Méta-modèle' }).locator('input').check();
await v110.locator('label.mode', { has: v110.locator('input[value=new]') }).click();
await v110.getByRole('button', { name: /Commencer \(\d+ cartes?\)/ }).click();
const firstOpt = v110.locator('.opts .opt').first();
const typedIn = v110.locator('.cloze input');
await firstOpt.or(typedIn).first().waitFor();
if (await typedIn.isVisible()) await typedIn.fill('mauvaise réponse');
else {
  // Pick an option that is not the answer: check every option text against the card's answer after checking.
  await firstOpt.click();
}
await v110.getByRole('button', { name: 'Vérifier' }).click();
const verdict = await v110.locator('.verdict h3').innerText();
if (verdict.includes('Pas tout à fait')) {
  await v110.locator('details.why[open]').waitFor({ timeout: 3000 }).catch(() => fail('a wrong answer opens « Pourquoi ? »'));
} else {
  await v110.locator('details.why:not([open])').waitFor({ timeout: 3000 }).catch(() => fail('a right answer keeps « Pourquoi ? » closed'));
}
await v110.waitForTimeout(800);
await v110.screenshot({ path: `${OUT}/why-session.png`, fullPage: true });
await v110.getByRole('button', { name: 'Quitter la séance' }).click();
await v110.locator('.session').waitFor({ state: 'detached' });

// Own cards without explanation: Claude explains one in session, then completes the theme from the library.
await v110.goto(`${URL}#bibliotheque`);
await v110.locator('#new-theme').fill('Explications');
await v110.locator('form', { has: v110.locator('#new-theme') }).getByRole('button', { name: 'Créer' }).click();
await v110.getByText('Thème « Explications » créé.').waitFor();
for (const [front, back] of [['Capitale du Japon ?', 'Tokyo'], ['Capitale du Canada ?', 'Ottawa']]) {
  await v110.goto(`${URL}#creer`);
  await v110.getByRole('button', { name: 'Recto / verso' }).click();
  await v110.getByLabel('Thème').selectOption({ label: 'Explications' });
  await v110.getByLabel('Recto').fill(front);
  await v110.getByLabel('Verso').fill(back);
  await v110.getByRole('button', { name: 'Ajouter au thème' }).click();
  await v110.getByText(/Ajouté à «.Explications.»/).waitFor();
}
await v110.goto(`${URL}#reviser`);
await v110.getByRole('button', { name: 'Aucun', exact: true }).click();
await v110.locator('label.pick', { hasText: 'Explications' }).locator('input').check();
await v110.locator('label.mode', { has: v110.locator('input[value=new]') }).click();
await v110.getByRole('button', { name: /Commencer \(2 cartes\)/ }).click();
await v110.getByRole('button', { name: 'Afficher la réponse' }).click();
await v110.getByRole('button', { name: 'Expliquer avec Claude' }).click();
await v110.getByLabel('Explication proposée').waitFor();
await v110.getByRole('button', { name: 'Enregistrer dans la carte' }).click();
await v110.getByText('Explication enregistrée dans la carte.').waitFor();
await v110.getByRole('button', { name: 'Quitter la séance' }).click();
await v110.locator('.session').waitFor({ state: 'detached' });
await v110.goto(`${URL}#bibliotheque`);
const lot = v110.locator('section.panel', { has: v110.getByRole('heading', { name: 'Explications', exact: true }) });
await lot.getByRole('button', { name: 'Compléter les explications (1)' }).click();
await lot.getByRole('button', { name: /Enregistrer les explications cochées \(1\)/ }).click();
await v110.getByText('1 explication enregistrée dans « Explications ».').waitFor();
const saved110 = await v110.evaluate(() => new Promise((res) => { const r = indexedDB.open('ancrage'); r.onsuccess = () => { const q = r.result.transaction('notes').objectStore('notes').getAll(); q.onsuccess = () => res(q.result.filter((n) => n.fields.front?.startsWith('Capitale')).map((n) => n.explanation)); }; }));
if (!saved110.every((e) => typeof e === 'string' && e.startsWith('Explication de Claude'))) fail(`both own cards should now have an explanation: ${JSON.stringify(saved110)}`);
if (explainCalls !== 2) fail(`expected 2 explanation calls, got ${explainCalls}`);
await v110.screenshot({ path: `${OUT}/why-library.png`, fullPage: true });
await ctx110.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
mobile.on('pageerror', (e) => errors.push(e.message));
await mobile.goto(URL);
await mobile.locator('.hero').waitFor();
await mobile.screenshot({ path: `${OUT}/mobile-dark.png`, fullPage: true });
for (const view of ['accueil', 'creer', 'progres', 'bibliotheque', 'boutique', 'reglages']) {
  await mobile.goto(`${URL}#${view}`);
  await mobile.waitForTimeout(300);
  const width = await mobile.evaluate(() => document.documentElement.scrollWidth);
  if (width > 390) fail(`horizontal scroll on mobile #${view}: ${width}px`);
  const clipped = await mobile.evaluate(() => [...document.querySelectorAll('.nav a')].filter((a) => a.scrollWidth > a.clientWidth + 1 || a.getBoundingClientRect().right > innerWidth).map((a) => a.textContent));
  if (clipped.length) fail(`mobile nav labels clipped on #${view}: ${clipped.join(', ')}`);
}
await mobile.goto(`${URL}#progres`);
await mobile.waitForTimeout(300);
await mobile.screenshot({ path: `${OUT}/mobile-progress-dark.png`, fullPage: true });

await browser.close();
server.kill();
const relevant = errors.filter((e) => !/fonts\.(googleapis|gstatic)/.test(e));
if (relevant.length) fail(`console errors: ${relevant.join(' | ')}`);
console.log(`smoke OK (${steps} steps, ${reviews} reviews persisted, after reload: ${after.replace(/\s+/g, ' ').trim()})`);
