# Itération 2 — Séance : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une séance jouable dans le navigateur, branchée sur le moteur : file du jour, manches de 10, les 6 types d'exercice, feedback immédiat, persistance IndexedDB, deck de démarrage.

**Architecture:** Trois modules purs et testés dans `src/core/` (`queue.ts` file du jour, `round.ts` déroulé d'une manche, `exercise.ts` note + carte + mode → exercice affichable et sa correction). Une couche `src/app/` relie Repo, moteur et deck de démarrage. L'interface Svelte (`src/ui/`) reprend l'identité de la maquette (`prototype/maquette.html`) et ne contient aucune règle métier.

**Tech Stack:** celle de l'itération 1, sans nouvelle dépendance. Vérification de bout en bout par un script Playwright local (Chromium préinstallé), hors CI.

**Spec:** `docs/specs/2026-10-28-ancrage-v1-design.md` (§4 exercices, §6 boucle de séance, §8 écrans).

## Global Constraints

- Séance = cartes dues (entrelacées entre thèmes, plus en retard d'abord) puis nouvelles cartes, dans la limite `newPerDay` (défaut 5) moins les nouvelles déjà introduites aujourd'hui.
- Journée d'étude : bascule à 4 h, heure locale.
- Manche = 10 exercices. Une carte ratée revient une fois en fin de manche ; ce second passage n'est pas enregistré dans le log (l'échec est déjà noté Again et FSRS replanifie).
- Cartes orphelines exclues de la file.
- Feedback : bandeau vert/rouge, réponse attendue si erreur, ligne moteur (mode, note FSRS, prochaine échéance), bouton Continuer (Entrée).
- Raccourcis : 1–9 choisit une option, Entrée valide puis continue, Échap quitte.
- Aucune règle métier dans `src/ui/`.
- Hors périmètre : XP, streak, maîtrise, éditeur (itérations 3–4).

## Review Focus

1. **Aucune carte due ni nouvelle** : l'accueil affiche un état « rien à réviser » avec la prochaine échéance, pas une séance vide. → test dans Task 1 (file vide) et vérif e2e Task 6.
2. **Distracteurs insuffisants** (thème avec une seule note à trous, une seule note recto/verso) : l'exercice se replie sur la saisie ou l'auto-évaluation, jamais un QCM à une option. → test dans Task 3.
3. **Rechargement de la page en pleine manche** : les réponses déjà données sont conservées et les cartes répondues ne reviennent pas comme dues. → vérif e2e Task 6.
4. **Variante cloze avec suffixe `#2`** : l'exercice masque la bonne occurrence. → test dans Task 3.
5. **Ordre des options** : la bonne réponse n'est pas toujours à la même position, mais l'ordre est stable pour un même affichage. → test dans Task 3.

---

## Structure des fichiers

```
src/core/queue.ts         file du jour + début de journée
src/core/round.ts         machine d'état d'une manche
src/core/exercise.ts      construction et correction des exercices
src/data/starter.ts       deck de démarrage (thèmes + notes)
src/app/services.ts       init (Repo, moteur, seed, persist), chargement de la file
src/ui/app.css            tokens et composants visuels de la maquette
src/ui/Home.svelte, Session.svelte, Feedback.svelte, RoundEnd.svelte
src/ui/exercises/Choice.svelte, Typed.svelte, Order.svelte, Reveal.svelte
src/App.svelte            routage accueil ↔ séance
scripts/smoke.mjs         parcours e2e Playwright local
```

---

### Task 1: File du jour

**Files:** Create `src/core/queue.ts` · Test `tests/core/queue.test.ts`

**Interfaces:**
- Consumes: `CardState` (scheduler), `ReviewEntry` (model), `State` (ts-fsrs).
- Produces:
  - `interface QueueCandidate { cardId: string; themeId: string; themeOrder: number; noteCreatedAt: number; state: CardState }`
  - `studyDayStart(now: number, rolloverHour = 4): number` — début local de la journée d'étude.
  - `countNewIntroduced(entries: ReviewEntry[], dayStart: number): number` — cartes dont la toute première révision est ≥ `dayStart`.
  - `buildDailyQueue(candidates: QueueCandidate[], now: number, newLimit: number): string[]`
  - `nextDue(candidates: QueueCandidate[], now: number): number | null` — plus proche échéance future d'une carte non nouvelle.

- [ ] **Step 1: Tests**
  - File vide → `[]` ; `nextDue([])` → `null`.
  - Dues : seules les cartes non `New` avec `due ≤ now` ; plus en retard d'abord dans un thème.
  - Entrelacement : thèmes A (3 dues) et B (2 dues) → `A1 B1 A2 B2 A3`, thèmes pris par `themeOrder`.
  - Nouvelles après les dues, triées par `themeOrder` puis `noteCreatedAt` puis `cardId`, tronquées à `newLimit` ; `newLimit ≤ 0` → aucune.
  - `countNewIntroduced` : carte revue hier puis aujourd'hui → 0 ; carte revue pour la première fois aujourd'hui (2 fois) → 1.
  - `studyDayStart` : à 3 h locale → 4 h de la veille ; à 10 h → 4 h du jour.
- [ ] **Step 2:** `npx vitest run tests/core/queue.test.ts` → FAIL.
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(core): daily queue`.

### Task 2: Manche

**Files:** Create `src/core/round.ts` · Test `tests/core/round.test.ts`

**Interfaces:**
- Produces:
  - `ROUND_SIZE = 10`
  - `interface Round { pending: string[]; retried: string[]; done: number; total: number; correct: number; answered: number }`
  - `startRound(cardIds: string[]): Round` — prend les `ROUND_SIZE` premiers.
  - `currentCard(r: Round): string | undefined`
  - `isRetry(r: Round, cardId: string): boolean` — vrai si la carte en tête est un second passage.
  - `advance(r: Round, correct: boolean): Round` — retire la tête ; erreur au premier passage → remise en fin, `total + 1`.

- [ ] **Step 1: Tests**
  - `startRound` de 14 ids → 10 en attente, `total 10`.
  - 10 réponses justes → `pending []`, `done 10`, `correct 10`.
  - Erreur sur la 1ʳᵉ carte → elle revient en dernier, `total 11`, `isRetry` vrai quand elle revient.
  - Erreur au second passage → elle ne revient pas une troisième fois.
  - `advance` ne mute pas l'objet reçu.
- [ ] **Step 2–4:** RED puis GREEN (`npx vitest run tests/core/round.test.ts`).
- [ ] **Step 5:** Commit `feat(core): round state machine`.

### Task 3: Exercices

**Files:** Create `src/core/exercise.ts` · Test `tests/core/exercise.test.ts`

**Interfaces:**
- Consumes: `Note`, `Card`, `Mode` (model) ; `checkTyped`, `checkOrder` (check) ; `clozeGaps` (cards).
- Produces:
  - `makeRng(seed: string): () => number` — PRNG déterministe.
  - `type Exercise =`
    `{ kind: 'choice'; prompt: string; quote?: string; options: string[]; answerIndex: number; explain?: string }`
    `| { kind: 'typed'; prompt: string; before: string; after: string; expected: string }`
    `| { kind: 'order'; prompt: string; steps: string[]; shuffled: number[]; given: number }`
    `| { kind: 'reveal'; prompt: string; quote?: string; front: string; back: string; keyPoints: string[] }`
  - `buildExercise(note: Note, card: Card, mode: Mode, pool: Note[], rng: () => number): Exercise` — `pool` = autres notes du même thème.
  - `type Answer = { kind: 'choice'; index: number } | { kind: 'typed'; text: string } | { kind: 'order'; order: number[] }`
  - `isCorrect(ex: Exercise, answer: Answer): boolean`
  - `expectedText(ex: Exercise): string` — texte de la réponse attendue pour le bandeau d'erreur.

- [ ] **Step 1: Tests**
  - Cloze production : `"GROW : Goal, {{Reality}}, Options, {{Will}}"`, variante `reality` → `typed`, `before "GROW : Goal, "`, `after ", Options, Will"`, `expected "Reality"`.
  - Cloze variante `x#2` sur `"{{X}} puis {{X}}"` → `before "X puis "`, `after ""`.
  - Cloze reconnaissance avec ≥ 3 distracteurs (autres trous de la note et du pool) → `choice`, 4 options distinctes, `options[answerIndex] === "Reality"`.
  - Cloze reconnaissance avec < 2 distracteurs → repli `typed` (Review Focus 2).
  - Ordering production → `given 0`, `shuffled` est une permutation différente de l'identité ; reconnaissance → `given 1` et `shuffled[0] === 0`.
  - Classify → `choice` avec `quote` = énoncé, options = catégories, bonne option = `answer`.
  - MCQ → 1 + distracteurs options ; même graine → même ordre ; sur 20 graines la bonne réponse occupe au moins 2 positions différentes (Review Focus 5).
  - Basic reconnaissance avec 3 versos dans le pool → `choice` ; basic `self` → `reveal` ; variante `back` inverse recto et verso.
  - Scenario → `reveal` avec `quote` = situation, `back` = réponse modèle, `keyPoints`.
  - `isCorrect` : choice par index, typed via `checkTyped`, order via `checkOrder` sur l'ordre complet.
- [ ] **Step 2–4:** RED puis GREEN (`npx vitest run tests/core/exercise.test.ts`).
- [ ] **Step 5:** Commit `feat(core): exercise builders and checking`.

### Task 4: Deck de démarrage et services

**Files:** Create `src/data/starter.ts`, `src/app/services.ts` · Test `tests/app/services.test.ts`

**Interfaces:**
- Consumes: `Repo`, `createDexieRepo`, `createEngine`, `buildDailyQueue`, `countNewIntroduced`, `studyDayStart`, `nextDue`.
- Produces:
  - `STARTER: { themes: Theme[]; notes: Note[] }` — 5 thèmes de la maquette, ≥ 20 notes couvrant les 6 types, tag `exemple`.
  - `interface Services { repo: Repo; engine: Engine; today(now: number): Promise<{ queue: string[]; due: number; fresh: number; nextDue: number | null }>; context(cardId: string): Promise<{ note: Note; card: Card; pool: Note[]; theme: Theme }> }`
  - `createServices(repo: Repo, deviceId: string): Services`
  - `seedIfEmpty(repo: Repo): Promise<boolean>`
  - `boot(): Promise<Services>` — Dexie `ancrage`, `deviceId` persistant en `localStorage` (try/catch), `navigator.storage.persist()` si dispo, seed.

- [ ] **Step 1: Tests** (fake-indexeddb)
  - `seedIfEmpty` sur base vide → true et crée les notes ; second appel → false, rien de dupliqué.
  - `today(now)` juste après le seed → `due 0`, `fresh 5`, `queue` de 5 cartes.
  - Après réponse juste à 2 nouvelles cartes, `today(now)` → `fresh 3`.
  - Une carte orpheline n'apparaît jamais dans la file.
  - `context(cardId)` → note, carte, thème, et `pool` sans la note elle-même.
- [ ] **Step 2–4:** RED puis GREEN.
- [ ] **Step 5:** Commit `feat(app): starter deck and services`.

### Task 5: Interface — accueil et séance

**Files:** Create `src/ui/*` · Modify `src/App.svelte`, `src/main.ts`

**Interfaces:**
- Consumes: `Services` (Task 4), `startRound/advance/currentCard/isRetry` (Task 2), `buildExercise/isCorrect/expectedText/makeRng` (Task 3), `engine.modeFor/answer/correctLast`.

- [ ] **Step 1:** `app.css` : tokens clair/sombre, boutons à relief, options, bandeau, barre de progression, repris de la maquette.
- [ ] **Step 2:** `Home.svelte` : nombre de dues et de nouvelles, durée estimée (`≈ ceil(n × 0,4) min`), bouton « Commencer la séance » ; état vide « Rien à réviser » avec la prochaine échéance formatée en français.
- [ ] **Step 3:** `Session.svelte` : manche courante, composant d'exercice selon `kind`, mesure de durée depuis l'affichage, appel `engine.answer` au premier passage uniquement, `Feedback.svelte` (verdict, réponse attendue, mode, note, échéance relative, « En fait je ne savais pas / J'avais bon » via `correctLast`), `RoundEnd.svelte` (précision, durée, bouton manche suivante si la file n'est pas vide, sinon Terminer).
- [ ] **Step 4:** Raccourcis clavier des Global Constraints ; respect de `prefers-reduced-motion`.
- [ ] **Step 5:** `npm run typecheck && npm test && npm run build` → vert. Commit `feat(ui): home and session screens`.

### Task 6: Vérification de bout en bout

**Files:** Create `scripts/smoke.mjs` · Modify `package.json` (script `smoke`)

- [ ] **Step 1:** Script : `vite preview`, Chromium, base neuve → accueil affiche 5 nouvelles ; joue la manche entière en répondant via l'UI (une erreur volontaire) ; vérifie l'écran de fin ; recharge → l'accueil n'affiche plus ces cartes en nouvelles et les échéances sont futures ; aucune erreur console ; pas de défilement horizontal à 390 px. Captures desktop et mobile sombre.
- [ ] **Step 2:** Run `npm run build && npm run smoke` → « smoke OK ».
- [ ] **Step 3:** Commit `test: e2e smoke script`.

### Task 7: Clôture

- [ ] README : état itération 2, `npm run smoke`.
- [ ] `npm ci && npm run typecheck && npm test && npm run build && npm run smoke` → vert.
- [ ] Commit, relecture finale, push, PR.
