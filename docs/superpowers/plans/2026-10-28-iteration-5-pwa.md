# Itération 5 — PWA, hors ligne, sauvegarde : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ancrage s'installe sur ordinateur et téléphone, fonctionne sans réseau, et ses données peuvent être sauvegardées dans un fichier JSON puis restaurées. Les réglages FSRS sont modifiables.

**Architecture:** Sauvegarde = instantané complet de la base (`Repo.dumpAll` / `restoreAll`), sérialisé et validé par `src/core/backup.ts`. Réglages validés dans `src/core/settings.ts`. PWA via `vite-plugin-pwa` (manifest, service worker Workbox, précache), polices hébergées localement (`@fontsource`). Déploiement GitHub Pages préparé (workflow manuel), non activé sans accord.

**Tech Stack:** + `vite-plugin-pwa` 2.0.0, `@fontsource/nunito` 5.3.0, `@fontsource/nunito-sans` 5.3.0.

**Spec:** `docs/specs/2026-10-28-ancrage-v1-design.md` §2 (PWA, persistance, export/import JSON), §8 (Réglages), §10.5.

## Global Constraints

- Format de sauvegarde : `{ format: 'ancrage-backup', version: 1, exportedAt, themes, notes, cards, reviews, events, settings, flags }`. Nom de fichier `ancrage-AAAA-MM-JJ.json`.
- Import = remplacement complet de la base, après aperçu des comptes et confirmation intégrée à la page. Tout ou rien (une transaction).
- Un fichier invalide (JSON cassé, autre format, version future, champ manquant) est refusé avec un message en français ; la base n'est pas touchée.
- Réglages : rétention visée entre 0,70 et 0,97 ; nouvelles cartes par jour entre 0 et 50, entier. Changer la rétention replanifie tout l'historique et peut déplacer l'XP passée : la page le dit.
- PWA : nom « Ancrage », couleur de thème bleu-pétrole, icônes 192 et 512 px (dont une `maskable`), démarrage sur `#accueil`, affichage `standalone`.
- Hors ligne : après une première visite, l'app se charge et fonctionne sans réseau, polices comprises.
- Mise à jour du service worker : le bandeau « Nouvelle version disponible » propose de recharger ; pas de rechargement forcé en pleine séance.
- `base` Vite configurable (`VITE_BASE`) pour un hébergement sous `/Ancrage/`.

## Review Focus

1. **Import d'une sauvegarde d'une version future ou tronquée** : refus explicite, base intacte. → tests Task 1.
2. **Aller-retour export → import** sur une base riche (notes des 6 types, orphelines, historique, événements, drapeaux) : état identique, y compris série et XP. → test Task 1.
3. **Import qui échoue au milieu** (quota, erreur) : rien n'est remplacé. → test Task 1 (transaction).
4. **Réglage invalide saisi** (0,5 ; 1 ; « abc » ; 12,5 cartes) : refusé avec message, ancien réglage conservé. → test Task 2.
5. **Hors ligne au rechargement** : l'app démarre, la séance fonctionne, aucune requête réseau requise. → vérif e2e Task 4.

---

### Task 1: Sauvegarde et restauration

**Files:** Create `src/core/backup.ts` · Modify `src/storage/repo.ts`, `src/storage/dexie-repo.ts`, `src/app/services.ts` · Test `tests/core/backup.test.ts`, `tests/app/backup.test.ts`

**Interfaces:**
- Repo : `dumpAll(): Promise<Dump>` et `restoreAll(dump: Dump): Promise<void>` (efface puis réécrit toutes les tables en une transaction), avec `Dump = { themes; notes; cards; reviews; events; settings: Settings; flags: string[] }`.
- `backup.ts` :
  - `BACKUP_FORMAT = 'ancrage-backup'`, `BACKUP_VERSION = 1`
  - `serializeBackup(dump: Dump, now: number): string`
  - `parseBackup(text: string): { ok: true; dump: Dump; exportedAt: number } | { ok: false; error: string }`
  - `backupFileName(now: number): string`
  - `summarize(dump: Dump): { themes: number; notes: number; reviews: number }`
- Services : `exportBackup(now): Promise<{ fileName: string; text: string }>`, `importBackup(dump: Dump): Promise<void>`.

- [ ] **Step 1: Tests**
  - Aller-retour : base avec thèmes, notes des 6 types, carte orpheline, log, événements, réglages modifiés, drapeau `starterSeeded` → export → import dans une base vide → `dumpAll()` identique ; `progress(now)` identique (série, XP) (Review Focus 2).
  - `parseBackup` refuse : texte non JSON, `format` différent, `version: 2`, `notes` manquant, une note sans `fields` — chacun avec un message en français ; la base existante est intacte (Review Focus 1).
  - `restoreAll` qui échoue (entrée en double dans `reviews`) → la base d'origine est intacte (Review Focus 3).
  - `backupFileName(28 octobre 2026)` → `ancrage-2026-10-28.json`.
  - Après import, `seedIfEmpty` ne recharge pas les exemples.
- [ ] **Step 2–4:** RED puis GREEN.
- [ ] **Step 5:** Commit `feat: JSON backup export and import`.

### Task 2: Réglages

**Files:** Create `src/core/settings.ts` · Modify `src/app/services.ts` · Test `tests/core/settings.test.ts`

**Interfaces:**
- `validateSettings(input: { desiredRetention: string | number; newPerDay: string | number }): { ok: true; settings: Settings } | { ok: false; errors: Partial<Record<keyof Settings, string>> }` — accepte la virgule décimale (« 0,9 »).
- Services : `updateSettings(input): Promise<ReturnType<typeof validateSettings>>`.

- [ ] **Step 1: Tests**
  - `0,9` et `0.9` acceptés ; `0.5`, `1`, `abc`, vide refusés pour la rétention ; `12.5`, `-1`, `51` refusés pour les nouvelles cartes ; `0` accepté (pause des nouvelles cartes).
  - `updateSettings` invalide → réglages stockés inchangés (Review Focus 4) ; valide → `getSettings` renvoie les nouvelles valeurs et `today()` respecte la nouvelle limite.
- [ ] **Step 2–4:** RED puis GREEN.
- [ ] **Step 5:** Commit `feat: settings validation`.

### Task 3: Page Réglages et PWA

**Files:** Create `src/ui/Settings.svelte`, `public/icons/*`, `scripts/make-icons.mjs` · Modify `vite.config.ts`, `src/main.ts`, `src/App.svelte`, `src/ui/Nav.svelte`, `index.html`, `package.json`

- [ ] **Step 1:** Page Réglages (`#reglages`, lien dans la navigation) : rétention visée (curseur 0,70–0,97 avec valeur affichée et explication : plus haut = plus de révisions), nouvelles cartes par jour, enregistrement avec messages d'erreur ; sauvegarde (bouton « Télécharger une sauvegarde ») ; restauration (choix du fichier → aperçu « N thèmes, N notes, N révisions, exportée le … » → confirmation « Remplacer mes données ») ; état de la persistance du stockage (`navigator.storage.persisted()`).
- [ ] **Step 2:** Icônes : script qui rend l'ancre SVG en PNG 192/512 et 512 maskable avec le Chromium système ; PNG commités dans `public/icons/`.
- [ ] **Step 3:** `vite-plugin-pwa` (`registerType: 'prompt'`), manifest des Global Constraints, précache de tout le build ; polices `@fontsource` importées dans `main.ts`, lien Google Fonts retiré de `index.html` ; bandeau de mise à jour (pas pendant une séance) ; `base: process.env.VITE_BASE ?? '/'`.
- [ ] **Step 4:** `npm run typecheck && npm test && npm run build` → vert ; le build contient `manifest.webmanifest` et `sw.js`. Commit `feat: settings page, installable PWA, offline fonts`.

### Task 4: Bout en bout, déploiement préparé, clôture

**Files:** Modify `scripts/smoke.mjs`, `README.md` · Create `.github/workflows/deploy.yml`

- [ ] **Step 1:** Smoke : manifest servi et valide ; service worker actif ; contexte hors ligne → rechargement → l'accueil s'affiche et une manche se joue (Review Focus 5) ; réglages invalides refusés à l'écran ; export puis import du fichier téléchargé restaure les mêmes comptes.
- [ ] **Step 2:** Workflow GitHub Pages déclenché manuellement (`workflow_dispatch`), build avec `VITE_BASE=/Ancrage/`. Non activé : nécessite l'accord explicite et l'activation de Pages dans les réglages du dépôt.
- [ ] **Step 3:** README : installation (ordinateur, Android, iOS), sauvegarde, hors ligne, déploiement.
- [ ] **Step 4:** `npm ci && npm run typecheck && npm test && npm run build && npm run smoke` → vert. Relecture finale, corrections, PR, fusion après CI verte, republication de la page d'essai.
