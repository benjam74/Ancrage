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
await app.getByText('Le nombre de nouvelles cartes doit être un entier entre 0 et 200.').waitFor({ timeout: 3000 }).catch(() => fail('invalid setting should be refused'));
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

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
mobile.on('pageerror', (e) => errors.push(e.message));
await mobile.goto(URL);
await mobile.locator('.hero').waitFor();
await mobile.screenshot({ path: `${OUT}/mobile-dark.png`, fullPage: true });
for (const view of ['accueil', 'creer', 'progres', 'bibliotheque', 'reglages']) {
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
