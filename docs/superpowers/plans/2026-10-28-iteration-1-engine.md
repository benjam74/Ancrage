# Itération 1 — Moteur : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un moteur sans interface qui génère les cartes depuis les notes, corrige les réponses, convertit le résultat en note FSRS, planifie avec FSRS et persiste un historique append-only dont l'état des cartes se reconstruit à l'identique.

**Architecture:** Cœur pur en TypeScript (`src/core/`, aucune dépendance au navigateur) + couche de stockage (`src/storage/`) derrière une interface `Repo`, implémentée avec Dexie. `src/core/engine.ts` orchestre : correction → note FSRS → entrée de log → état mis à jour. L'app Svelte ne contient qu'un écran de démarrage à cette itération.

**Tech Stack:** TypeScript 7.0.2, Svelte 5.57.2, Vite 8.3.4, Vitest 5.0.4, ts-fsrs 5.4.2, Dexie 4.4.6, fake-indexeddb 6.2.5 (tests). Versions épinglées exactes, toutes publiées depuis plus de deux semaines.

**Spec:** `docs/specs/2026-10-28-ancrage-v1-design.md` (§3 modèle, §4 exercices, §5 conversion FSRS).

## Global Constraints

- Rétention visée par défaut : `0.9`. Fuzz FSRS activé.
- `ReviewLog` est append-only, à une exception près : la correction de note de la dernière réponse (spec §5).
- `CardState` = replay FSRS du log trié par `(ts, id)` ; aucune autre source de vérité.
- Mode : reconnaissance si carte New/Learning/Relearning ou stabilité < 7 jours ; production sinon.
- Notes : erreur → Again(1) ; reconnaissance réussie → Hard(2) ; production réussie → Good(3), Easy(4) si durée < médiane personnelle du type et sans indice ; auto-évaluation Raté/Difficile/Su → 1/2/3.
- Saisie : insensible à la casse et aux accents ; Levenshtein ≤ 1 accepté si la réponse attendue fait ≥ 6 lettres.
- Le cœur (`src/core/`) n'importe ni Dexie ni API navigateur.
- Licence MIT.

## Review Focus

1. **Logs arrivant dans le désordre** (future sync) : le replay doit trier par `ts` puis `id`, et donner le même état quel que soit l'ordre d'insertion. → test dans Task 5.
2. **Édition d'une note à trous** qui insère un trou avant les autres : les cartes existantes doivent garder leur identité (sinon l'historique est rattaché au mauvais trou). → clés de variante basées sur le texte du trou, test dans Task 2.
3. **Saisies avec apostrophes, espaces multiples, majuscules accentuées** (« L'Omission ») : doivent être acceptées. → test dans Task 3.
4. **Durées aberrantes** (0 ms, négatives, app laissée ouverte 2 h) et historique vide pour la médiane : jamais de Easy sans au moins 5 mesures ; durées hors [300 ms, 10 min] ignorées pour la médiane et ne donnent jamais Easy. → test dans Task 4.
5. **Correction après coup sur une carte déjà replanifiée** : l'état doit être recalculé depuis le log corrigé, pas patché. → test dans Task 7.

---

## Structure des fichiers

```
LICENSE                         MIT
package.json, tsconfig.json, vite.config.ts, index.html
.github/workflows/ci.yml        npm ci + typecheck + tests
src/main.ts, src/App.svelte     écran de démarrage
src/core/model.ts               types du domaine
src/core/ids.ts                 identifiants triables dans le temps
src/core/cards.ts               note → cartes (variantes)
src/core/check.ts               correction des réponses
src/core/grading.ts             mode + note FSRS
src/core/scheduler.ts           wrapper ts-fsrs : apply, replay
src/core/engine.ts              orchestration d'une réponse
src/storage/repo.ts             interface Repo
src/storage/dexie-repo.ts       implémentation IndexedDB
tests/**/*.test.ts              miroir de src/
```

---

### Task 1: Squelette, outillage, licence, CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/App.svelte`, `LICENSE`, `.github/workflows/ci.yml`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: scripts npm `dev`, `build`, `test` (`vitest run`), `typecheck` (`tsc --noEmit` + `svelte-check`).

- [ ] **Step 1:** `tests/smoke.test.ts` : `expect(1 + 1).toBe(2)` (valide la chaîne d'outils, sera supprimé quand d'autres tests existeront).
- [ ] **Step 2:** Créer la config. `vite.config.ts` contient le bloc `test: { environment: 'node', include: ['tests/**/*.test.ts'] }`. `tsconfig.json` en `strict: true`, `moduleResolution: "bundler"`. `App.svelte` affiche « Ancrage — moteur en construction ».
- [ ] **Step 3:** Run `npm install && npm test && npm run typecheck && npm run build` → tout passe.
- [ ] **Step 4:** CI GitHub Actions sur `push` et `pull_request` : Node 22, `npm ci`, `npm run typecheck`, `npm test`.
- [ ] **Step 5:** Commit `chore: scaffold Svelte + Vite + Vitest, MIT license, CI`.

### Task 2: Modèle, identifiants et génération des cartes

**Files:**
- Create: `src/core/model.ts`, `src/core/ids.ts`, `src/core/cards.ts`
- Test: `tests/core/ids.test.ts`, `tests/core/cards.test.ts`

**Interfaces:**
- Produces (`model.ts`):
  - `type NoteType = 'basic' | 'cloze' | 'ordering' | 'classify' | 'mcq' | 'scenario'`
  - `type NoteFields` union discriminée par `type` :
    `basic {front, back, reverse: boolean}` · `cloze {text}` · `ordering {title, steps: string[]}` · `classify {statement, categories: string[], answer: string}` · `mcq {question, answer, distractors: string[]}` · `scenario {situation, model, keyPoints: string[]}`
  - `interface Note { id; themeId; fields: NoteFields; tags: string[]; source?: string; createdAt: number; updatedAt: number }`
  - `interface Card { id; noteId; variant: string }`
  - `type Mode = 'recognition' | 'production' | 'self'`
  - `interface ReviewEntry { id; cardId; ts: number; rating: 1|2|3|4; mode: Mode; correct: boolean; durationMs: number; hintUsed: boolean; deviceId: string }`
  - `interface Theme { id; parentId?: string; name; order: number }`
  - `interface Settings { desiredRetention: number; newPerDay: number }` et `DEFAULT_SETTINGS = { desiredRetention: 0.9, newPerDay: 5 }`
- Produces (`ids.ts`): `newId(now?: number): string` — 26 caractères, ordre lexicographique = ordre chronologique, unique même pour deux appels à la même milliseconde.
- Produces (`cards.ts`): `cardVariants(fields: NoteFields): string[]` et `clozeGaps(text: string): string[]`.

- [ ] **Step 1: Tests**
  - `newId(1000) < newId(2000)` ; 1000 appels `newId(5)` donnent 1000 valeurs distinctes et triées ; longueur 26.
  - `cardVariants({type:'basic', front, back, reverse:false})` → `['front']` ; avec `reverse:true` → `['front','back']`.
  - `cardVariants(cloze "La {{généralisation}}, la {{distorsion}} et l'{{omission}}")` → `['généralisation','distorsion','omission']`.
  - Ajouter un trou en tête (`"{{Le méta-modèle}} : la {{généralisation}}…"`) conserve les variantes précédentes telles quelles (Review Focus 2).
  - Deux trous identiques `{{X}} … {{X}}` → `['x', 'x#2']`.
  - Cloze sans trou ou avec `{{   }}` → `[]`.
  - `ordering`, `classify`, `mcq`, `scenario` → `['main']`.
- [ ] **Step 2:** Run `npx vitest run tests/core` → FAIL (modules absents).
- [ ] **Step 3:** Implémenter. Variante cloze = texte du trou normalisé (minuscules, espaces réduits, accents conservés), suffixe `#n` à partir de la deuxième occurrence. `newId` : 10 caractères de temps en base32 Crockford + 16 caractères aléatoires, avec incrément monotone si même milliseconde.
- [ ] **Step 4:** Run `npx vitest run tests/core` → PASS.
- [ ] **Step 5:** Commit `feat(core): domain model, time-sortable ids, card variants`.

### Task 3: Correction des réponses

**Files:**
- Create: `src/core/check.ts`
- Test: `tests/core/check.test.ts`

**Interfaces:**
- Produces: `normalizeAnswer(s: string): string`, `checkTyped(input: string, expected: string): boolean`, `checkOrder(given: number[], length: number): boolean`, `checkChoice(given: string, expected: string): boolean`.

- [ ] **Step 1: Tests**
  - `checkTyped('realite', 'Réalité')` → true ; `checkTyped('  L’Omission ', "l'omission")` → true (apostrophe typographique, Review Focus 3).
  - `checkTyped('generalisaton', 'généralisation')` → true (1 suppression, ≥ 6 lettres) ; `checkTyped('generalisatoin', 'généralisation')` → false (transposition = distance 2).
  - `checkTyped('wil', 'Will')` → false (moins de 6 lettres, pas de tolérance).
  - `checkTyped('', 'Will')` → false.
  - `checkOrder([0,1,2,3], 4)` → true ; `[1,0,2,3]` → false ; `[0,1,2]` avec length 4 → false.
  - `checkChoice('Généralisation ', 'generalisation')` → true.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** `normalizeAnswer` : NFD, suppression des diacritiques, minuscules, `’` → `'`, espaces réduits et rognés. Levenshtein sur les chaînes normalisées.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(core): answer checking with accent/case tolerance`.

### Task 4: Mode d'exercice et note FSRS

**Files:**
- Create: `src/core/grading.ts`
- Test: `tests/core/grading.test.ts`

**Interfaces:**
- Consumes: `Mode`, `NoteType` (Task 2) ; `State` de ts-fsrs.
- Produces:
  - `selectMode(type: NoteType, card: { state: State; stability: number }, opts?: { basicDistractors: number }): Mode`
  - `type Outcome = { kind: 'auto'; correct: boolean; durationMs: number; hintUsed: boolean } | { kind: 'self'; grade: 1 | 2 | 3 }`
  - `toRating(mode: Mode, outcome: Outcome, easyThresholdMs: number | null): 1|2|3|4`
  - `easyThreshold(durationsMs: number[]): number | null`
  - Constantes `RECOGNITION_MAX_STABILITY = 7`, `MIN_SAMPLES = 5`, `DURATION_MIN_MS = 300`, `DURATION_MAX_MS = 600_000`.

- [ ] **Step 1: Tests**
  - `selectMode('cloze', {state: New, stability: 0})` → `'recognition'` ; `{state: Review, stability: 6.9}` → `'recognition'` ; `{state: Review, stability: 7}` → `'production'`.
  - `selectMode('mcq', {state: Review, stability: 30})` → `'recognition'` (toujours).
  - `selectMode('scenario', …)` → `'self'` (toujours).
  - `selectMode('basic', {state: New, stability: 0}, {basicDistractors: 3})` → `'recognition'` ; avec `basicDistractors: 2` → `'self'` ; `{state: Review, stability: 10}` → `'self'`.
  - `selectMode('ordering' | 'classify', …)` suit la règle de stabilité.
  - `toRating('recognition', auto correct)` → 2 ; `toRating(any auto, incorrect)` → 1.
  - `toRating('production', {correct, durationMs: 3000, hintUsed: false}, 5000)` → 4 ; même chose avec `hintUsed: true` → 3 ; avec seuil `null` → 3 ; avec `durationMs: 0` → 3 (Review Focus 4).
  - `toRating('self', {kind:'self', grade: 2}, null)` → 2.
  - `easyThreshold([1000,2000,3000,4000])` → null ; `easyThreshold([1000,2000,3000,4000,5000])` → 3000 ; `easyThreshold([0, 100, 7_200_000, 1000, 2000, 3000, 4000])` → null (seules 4 mesures valides).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implémenter. Médiane des mesures valides (moyenne des deux centrales si nombre pair). Easy exige `DURATION_MIN_MS ≤ durationMs < seuil`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(core): exercise mode selection and FSRS rating mapping`.

### Task 5: Planificateur FSRS et replay

**Files:**
- Create: `src/core/scheduler.ts`
- Test: `tests/core/scheduler.test.ts`

**Interfaces:**
- Consumes: `ReviewEntry`, `Settings` (Task 2) ; `fsrs`, `createEmptyCard`, `Card as FsrsCard`, `State` de ts-fsrs.
- Produces:
  - `type CardState = FsrsCard` (réexport)
  - `makeScheduler(settings: Settings): Scheduler`
  - `interface Scheduler { initial(createdAt: number): CardState; apply(state: CardState, rating: 1|2|3|4, ts: number): CardState; replay(createdAt: number, entries: ReviewEntry[]): CardState; retrievability(state: CardState, now: number): number }`

- [ ] **Step 1: Tests**
  - Nouvelle carte : `initial(t0).state === State.New`.
  - `apply(initial, 3, t0)` puis `3` le lendemain → `state === Review` (avec les learning steps par défaut 1m/10m, vérifier l'état obtenu et l'écrire tel quel dans l'assertion une fois observé).
  - **Replay = application incrémentale** : 12 notes pseudo-aléatoires (graine fixe) espacées selon `due` ; `replay(t0, entries)` deep-equal à l'état obtenu par `apply` successifs.
  - **Ordre d'insertion indifférent** (Review Focus 1) : `replay` des mêmes entrées mélangées → même état.
  - Deux entrées au même `ts` : départage par `id`, résultat stable.
  - `retrievability` d'une carte New → 0 ; d'une carte revue à t, évaluée à t → proche de 1.
  - `desiredRetention: 0.8` donne un `scheduled_days` ≥ celui de `0.9` pour la même séquence.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implémenter avec `fsrs({ request_retention, enable_fuzz: true })`. `replay` copie, trie par `(ts, id)`, réduit avec `apply`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(core): FSRS scheduler with deterministic replay`.

### Task 6: Interface Repo et implémentation Dexie

**Files:**
- Create: `src/storage/repo.ts`, `src/storage/dexie-repo.ts`
- Test: `tests/storage/dexie-repo.test.ts` (avec `import 'fake-indexeddb/auto'`)

**Interfaces:**
- Consumes: types de Task 2.
- Produces:
  - `interface Repo {`
    `putTheme(t: Theme): Promise<void>; listThemes(): Promise<Theme[]>;`
    `putNote(n: Note): Promise<Card[]>;` — upsert ; crée les cartes des nouvelles variantes, conserve celles qui existent, supprime celles dont la variante a disparu **et qui n'ont aucun log** (sinon les garde, marquées `orphan: true`)
    `getNote(id): Promise<Note | undefined>; listCards(noteId?): Promise<Card[]>;`
    `appendReview(e: ReviewEntry): Promise<void>; listReviews(cardId?): Promise<ReviewEntry[]>;`
    `amendReview(id: string, patch: Pick<ReviewEntry,'rating'|'correct'>): Promise<void>;`
    `getSettings(): Promise<Settings>; putSettings(s: Settings): Promise<void>; }`
  - `Card` gagne `orphan?: boolean` (modifier `model.ts`).
  - `createDexieRepo(name: string): Repo`

- [ ] **Step 1: Tests**
  - `putNote` d'une cloze à 3 trous → 3 cartes ; ré-`putNote` avec un trou ajouté en tête → 4 cartes, les 3 anciens `id` inchangés.
  - Retrait d'un trou sans log → carte supprimée ; retrait d'un trou ayant un log → carte conservée avec `orphan: true`.
  - `appendReview` ×3 puis `listReviews(cardId)` → 3 entrées triées par `(ts, id)`.
  - `appendReview` avec un `id` existant → rejet (append-only).
  - `amendReview` change `rating` et `correct`, rien d'autre.
  - `getSettings()` sur base vide → `DEFAULT_SETTINGS`.
  - Chaque test utilise un nom de base unique (`newId()`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implémenter. Schéma Dexie v1 : `themes: 'id'`, `notes: 'id, themeId'`, `cards: 'id, noteId'`, `reviews: 'id, cardId, ts'`, `settings: 'key'`. `appendReview` utilise `add` (échoue sur clé existante). `putNote` dans une transaction `rw` sur `notes, cards, reviews`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(storage): Repo interface and Dexie implementation`.

### Task 7: Moteur — enregistrer une réponse

**Files:**
- Create: `src/core/engine.ts`
- Test: `tests/core/engine.test.ts` (Repo Dexie + fake-indexeddb)

**Interfaces:**
- Consumes: `Repo` (Task 6), `makeScheduler` (Task 5), `toRating`, `easyThreshold`, `selectMode` (Task 4).
- Produces:
  - `createEngine(repo: Repo, deviceId: string): Engine`
  - `interface Engine {`
    `cardState(cardId: string): Promise<CardState>;` — replay depuis le log
    `modeFor(cardId: string): Promise<Mode>;`
    `answer(cardId: string, mode: Mode, outcome: Outcome, now: number): Promise<{ entry: ReviewEntry; state: CardState }>;`
    `correctLast(entryId: string, correct: boolean, now: number): Promise<CardState>; }` — recalcule la note avec la même règle, `amendReview`, renvoie l'état rejoué.
  - Le seuil Easy utilise les `durationMs` des entrées passées en mode `production`, réussies, pour les cartes du même `NoteType`.

- [ ] **Step 1: Tests**
  - Cloze nouvelle : `modeFor` → `'recognition'` ; `answer(…, auto correct)` → entrée `rating 2`, `mode 'recognition'`.
  - Après 5 réponses en production de 2 000 à 6 000 ms sur des cloze, une réponse à 1 500 ms → `rating 4`.
  - Réponse fausse → `rating 1` et `state.state` ∈ {Learning, Relearning}.
  - `correctLast(id, false)` sur une réponse Good → l'entrée stockée passe à `rating 1`, et l'état renvoyé est deep-equal à `replay` du log corrigé (Review Focus 5).
  - `cardState` après N réponses deep-equal à l'état renvoyé par la dernière `answer`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implémenter. La date de création d'une carte = `createdAt` de sa note.
- [ ] **Step 4:** Run `npm test && npm run typecheck` → PASS. Supprimer `tests/smoke.test.ts`.
- [ ] **Step 5:** Commit `feat(core): engine recording answers with correction support`.

### Task 8: Clôture de l'itération

- [ ] Mettre à jour `README.md` : section « Développement » (`npm install`, `npm test`, `npm run dev`), état = itération 1 terminée.
- [ ] Run `npm ci && npm run typecheck && npm test && npm run build` → tout vert.
- [ ] Commit, push de la branche `iteration-1-engine`, ouverture de la PR.
