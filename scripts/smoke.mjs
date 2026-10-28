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

await page.getByRole('button', { name: 'Commencer la séance' }).click();
await page.locator('.s-inner').first().waitFor();
await page.screenshot({ path: `${OUT}/exercise.png` });
const steps = await playRound(page);
await page.screenshot({ path: `${OUT}/round-end.png` });

const finish = page.getByRole('button', { name: /Terminer|Manche suivante/ });
if ((await finish.innerText()).includes('Terminer')) await finish.click(); else await page.keyboard.press('Escape');
await page.reload();
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
await page.getByRole('button', { name: 'Commencer la séance' }).click();
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

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
mobile.on('pageerror', (e) => errors.push(e.message));
await mobile.goto(URL);
await mobile.locator('.hero').waitFor();
await mobile.screenshot({ path: `${OUT}/mobile-dark.png` });
const width = await mobile.evaluate(() => document.documentElement.scrollWidth);
if (width > 390) fail(`horizontal scroll on mobile: ${width}px`);

await browser.close();
server.kill();
const relevant = errors.filter((e) => !/fonts\.(googleapis|gstatic)/.test(e));
if (relevant.length) fail(`console errors: ${relevant.join(' | ')}`);
console.log(`smoke OK (${steps} steps, ${reviews} reviews persisted, after reload: ${after.replace(/\s+/g, ' ').trim()})`);
