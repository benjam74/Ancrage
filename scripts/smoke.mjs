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
    if (await cont.isVisible()) { await cont.click(); await cont.waitFor({ state: 'hidden' }); continue; }
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

await page.locator('.hero .btn').click();
await page.locator('.s-inner').first().waitFor();
await page.screenshot({ path: `${OUT}/exercise.png` });
const steps = await playRound(page);
await page.getByText('Série : 1 jour.').waitFor({ timeout: 3000 }).catch(() => fail('round end should show « Série : 1 jour. »'));
await page.getByLabel('45 XP').waitFor({ timeout: 3000 }).catch(() => fail('round end should show 45 XP'));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/round-end.png` });

const finish = page.getByRole('button', { name: /Terminer|Manche suivante/ });
if ((await finish.innerText()).includes('Terminer')) await finish.click(); else await page.keyboard.press('Escape');
const checkMotivation = async (when) => {
  await page.locator('.chip.streak').waitFor();
  await page.waitForFunction(() => document.querySelector('.ring text')?.textContent === '1/1', null, { timeout: 3000 }).catch(() => {});
  const streak = (await page.locator('.chip.streak').innerText()).replace(/\s+/g, ' ');
  const xp = (await page.locator('.chip.xp').innerText()).replace(/\s+/g, ' ');
  const ring = await page.locator('.ring text').textContent();
  if (!streak.startsWith('1') || !xp.startsWith('45') || ring !== '1/1') fail(`${when}: expected streak 1, 45 XP, ring 1/1; got "${streak}", "${xp}", "${ring}"`);
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
await page.locator('.hero .btn').click();
await page.locator('.s-inner').first().waitFor();
await playRound(page);
const end = page.getByRole('button', { name: /Terminer|Manche suivante/ });
if ((await end.innerText()).includes('Terminer')) await end.click(); else await page.keyboard.press('Escape');

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
await app.locator('.hero .btn').click();
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
}
await mobile.goto(`${URL}#progres`);
await mobile.waitForTimeout(300);
await mobile.screenshot({ path: `${OUT}/mobile-progress-dark.png`, fullPage: true });

await browser.close();
server.kill();
const relevant = errors.filter((e) => !/fonts\.(googleapis|gstatic)/.test(e));
if (relevant.length) fail(`console errors: ${relevant.join(' | ')}`);
console.log(`smoke OK (${steps} steps, ${reviews} reviews persisted, after reload: ${after.replace(/\s+/g, ' ').trim()})`);
