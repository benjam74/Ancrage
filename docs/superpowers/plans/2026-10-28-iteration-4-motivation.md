# Itération 4 — Motivation : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** XP, série de jours avec gels, objectif du jour, maîtrise par thème et page Progrès, tous calculés à partir de l'historique, sans nouvelle source de vérité hormis les fins de manche.

**Architecture:** Fonctions pures dans `src/core/progress.ts` (XP, jours d'objectif, série, gels) et `src/core/stats.ts` (maîtrise, régularité, prévision, rétention). Une table `events` (Dexie v2) enregistre les fins de manche. `services.progress(now)` assemble tout pour l'interface ; `services.completeRound(start, now)` enregistre une fin de manche et renvoie l'XP gagnée. L'interface reprend l'accueil, le parcours et la page Progrès de la maquette.

**Tech Stack:** inchangée.

**Spec:** `docs/specs/2026-10-28-ancrage-v1-design.md` §7 (gamification), §8 (écrans Accueil, Statistiques).

## Global Constraints

- XP : 10 par carte due traitée, réussie ou non ; 5 par nouvelle carte ; 20 par manche finie ; 0 pour une carte révisée avant son échéance.
- Une entrée est « nouvelle » si la carte était `New` juste avant, « due » si son échéance était passée, « en avance » sinon, l'état étant rejoué depuis le log.
- Objectif du jour atteint = au moins une manche finie dans la journée d'étude (bascule à 4 h). Une manche finit aussi quand la file du jour est épuisée, ce qui couvre « toutes les dues faites ».
- Série : +1 par jour d'objectif atteint. Un jour manqué consomme un gel s'il en reste, sinon la série retombe à 0. Un gel gagné à chaque 7ᵉ jour de série, stock maximum 2. Aujourd'hui non encore atteint ne casse pas la série.
- Gels dérivés de la suite des jours (pas d'événement stocké) : le calcul reste déterministe.
- Maîtrise d'un thème = part des cartes actives avec stabilité ≥ 21 j et rétrievabilité ≥ 0,9. Paliers : Nouveau (aucune carte révisée), Découverte (< 25 %), En cours (25–59 %), Solide (60–89 %), Ancré (≥ 90 %).
- Semaine d'XP : du lundi 4 h au lundi suivant 4 h, heure locale.

## Review Focus

1. **Changement d'heure** (fin octobre) : un jour de 25 h ne doit ni créer ni sauter de jour dans la série. → test Task 1.
2. **Deux manches le même jour** : la série n'augmente qu'une fois ; l'XP de manche compte deux fois. → test Task 1.
3. **Carte ratée revue 10 min plus tard dans la manche suivante** : elle est due (10 XP), pas en avance. → test Task 1.
4. **Correction après coup** (« J'avais bon ») : l'XP ne change pas (l'XP récompense le traitement, pas la réussite). → test Task 3.
5. **Base vide ou thème sans carte** : série 0, palier « Nouveau », pas de division par zéro, page Progrès lisible. → tests Task 2 et Task 3.

---

### Task 1: XP, jours d'objectif, série

**Files:** Create `src/core/progress.ts` · Test `tests/core/progress.test.ts`

**Interfaces:**
- Consumes: `ReviewEntry`, `Scheduler`, `studyDayStart`.
- Produces:
  - `type EntryKind = 'new' | 'due' | 'early'`
  - `XP = { due: 10, new: 5, early: 0, round: 20 }`
  - `classifyEntries(cards: { cardId: string; createdAt: number }[], entries: ReviewEntry[], scheduler: Scheduler): Map<string, EntryKind>` — clé = id d'entrée.
  - `xpBetween(entries: ReviewEntry[], kinds: Map<string, EntryKind>, roundEnds: number[], from: number, to: number): number` — `[from, to)`.
  - `nextStudyDay(dayStart: number): number` — début de la journée d'étude suivante (gère le changement d'heure).
  - `goalDays(roundEnds: number[]): number[]` — débuts de journée distincts, triés.
  - `streakState(goalDays: number[], todayStart: number): { current: number; freezes: number; todayDone: boolean }`
  - `weekStart(now: number): number` — lundi 4 h local.

- [ ] **Step 1: Tests**
  - `classifyEntries` : première réponse → `new` ; réponse à l'échéance → `due` ; réponse avant l'échéance → `early` ; carte ratée (Again, échéance 1–10 min) revue 15 min plus tard → `due` (Review Focus 3).
  - `xpBetween` : 2 dues + 1 nouvelle + 1 en avance + 2 fins de manche → 2×10 + 5 + 0 + 2×20 = 65 ; bornes `[from, to)` respectées.
  - `goalDays` : deux manches le même jour → un seul jour (Review Focus 2) ; manche à 3 h → compte pour la veille.
  - `streakState` : 3 jours consécutifs jusqu'à aujourd'hui → `current 3, todayDone true` ; jusqu'à hier → `current 3, todayDone false` ; trou d'un jour sans gel → série repart de la dernière portion ; 7 jours d'affilée → 1 gel ; 14 → 2 ; 21 → toujours 2 ; 7 jours, un trou, 3 jours → `current 10`, gel consommé (`freezes 0`) ; deux jours manqués d'affilée avec 1 gel → série cassée.
  - Changement d'heure : jours d'objectif du 24 au 27 octobre 2026 inclus (passage à l'heure d'hiver le 25) → `current 4` (Review Focus 1). Les tests fixent `process.env.TZ = 'Europe/Paris'`.
  - `weekStart(mercredi 28 octobre 2026 10 h)` = lundi 26 octobre 4 h.
- [ ] **Step 2–4:** RED puis GREEN (`npx vitest run tests/core/progress.test.ts`).
- [ ] **Step 5:** Commit `feat(core): XP, goal days and streak with freezes`.

### Task 2: Maîtrise et statistiques

**Files:** Create `src/core/stats.ts` · Test `tests/core/stats.test.ts`

**Interfaces:**
- Consumes: `CardState`, `Scheduler`, `ReviewEntry`, `EntryKind`, `studyDayStart`, `nextStudyDay`.
- Produces:
  - `MASTERED_STABILITY = 21`, `MASTERED_RETRIEVABILITY = 0.9`
  - `type Level = 'Nouveau' | 'Découverte' | 'En cours' | 'Solide' | 'Ancré'`
  - `mastery(states: CardState[], now: number, scheduler: Scheduler): { cards: number; mastered: number; pct: number; level: Level }`
  - `dailyCounts(entries: ReviewEntry[], todayStart: number, days: number): number[]` — du plus ancien à aujourd'hui.
  - `forecast(states: CardState[], now: number, days: number): number[]` — index 0 = dues d'ici la fin de la journée d'étude (retard compris), puis par journée.
  - `retention(entries: ReviewEntry[], kinds: Map<string, EntryKind>, from: number): number | null` — part de réussites parmi les entrées `due` depuis `from` ; `null` sans données.
  - `stateBreakdown(states: CardState[]): { nouvelles: number; apprentissage: number; jeunes: number; ancrees: number }` (ancrées = stabilité ≥ 21).

- [ ] **Step 1: Tests**
  - `mastery([])` → `cards 0, pct 0, level 'Nouveau'` ; uniquement des cartes `New` → `Nouveau` ; seuils de palier à 24/25 %, 59/60 %, 89/90 %.
  - Carte stabilité 30 j revue il y a 1 j → maîtrisée ; même carte évaluée 200 j plus tard → non maîtrisée (rétrievabilité < 0,9).
  - `dailyCounts` : entrées sur 3 jours dont une à 3 h → comptée la veille ; longueur = `days`.
  - `forecast` : carte en retard → index 0 ; carte due après-demain → index 2 ; cartes `New` ignorées.
  - `retention` : 3 dues dont 2 justes → 2/3 ; uniquement des nouvelles → `null`.
  - `stateBreakdown` sur un mélange des 4 états.
- [ ] **Step 2–4:** RED puis GREEN.
- [ ] **Step 5:** Commit `feat(core): mastery and progress statistics`.

### Task 3: Événements et services de progression

**Files:** Modify `src/storage/repo.ts`, `src/storage/dexie-repo.ts`, `src/core/model.ts`, `src/app/services.ts` · Test `tests/storage/dexie-repo.test.ts`, `tests/app/progress.test.ts`

**Interfaces:**
- `model.ts` : `interface AppEvent { id: string; type: 'round_completed'; ts: number }`.
- Repo : `appendEvent(e: AppEvent): Promise<void>`, `listEvents(): Promise<AppEvent[]>` ; Dexie version 2 ajoute `events: 'id, ts'` (les bases v1 se migrent sans perte).
- Services :
  - `completeRound(startedAt: number, now: number): Promise<{ xp: number; streak: number; firstGoalToday: boolean }>`
  - `progress(now: number): Promise<Progress>` avec `Progress = { streak: number; freezes: number; todayDone: boolean; xpToday: number; xpWeek: number; themes: { theme: Theme; cards: number; due: number; mastery: number; level: Level }[]; heatmap: number[]; forecast: number[]; retention: number | null; breakdown: ReturnType<typeof stateBreakdown> }`.

- [ ] **Step 1: Tests**
  - Base v1 existante (schéma sans `events`) rouverte avec le code v2 → notes et log intacts, `listEvents()` → `[]`.
  - `progress(now)` sur base vide → `streak 0, xpToday 0, themes [], retention null`, `heatmap` de 140 zéros, `forecast` de 7 zéros (Review Focus 5).
  - Après seed, 5 nouvelles cartes répondues puis `completeRound` → `xp 5×5 + 20 = 45`, `streak 1`, `firstGoalToday true` ; second `completeRound` le même jour → `firstGoalToday false`, `streak 1`.
  - `correctLast` sur une réponse → `xpToday` inchangé (Review Focus 4).
  - Thème du seed sans révision → palier `Nouveau`.
- [ ] **Step 2–4:** RED puis GREEN.
- [ ] **Step 5:** Commit `feat(app): round events and progress services`.

### Task 4: Interface

**Files:** Modify `src/ui/Home.svelte`, `src/ui/Session.svelte`, `src/ui/Nav.svelte`, `src/App.svelte`, `src/ui/app.css` · Create `src/ui/Progress.svelte`, `src/ui/ThemePath.svelte`

- [ ] **Step 1:** Accueil : pastilles série, XP de la semaine, gels ; anneau d'objectif (0/1 → 1/1) ; carte « Séance du jour » ; parcours vertical des thèmes (nœud par thème, anneau de maîtrise, palier, nœud du premier thème non ancré mis en avant) ; détail d'un thème au clic (maîtrise, cartes, dues).
- [ ] **Step 2:** Séance : à la fin de manche, appeler `completeRound` ; afficher XP gagnée (compteur animé), précision, durée, et « Série : N jours » (+ mention « Objectif du jour atteint » si `firstGoalToday`).
- [ ] **Step 3:** Page Progrès (`#progres`, 4ᵉ lien de la navigation) : rétention réelle vs objectif 90 %, cartes ancrées, régularité 20 semaines (carte de chaleur), prévision 7 jours (barres SVG à l'échelle, aujourd'hui en corail), état des cartes. Libellés lisibles en thème clair et sombre.
- [ ] **Step 4:** `npm run typecheck && npm test && npm run build` → vert. Commit `feat(ui): streak, XP, goal ring, theme path and progress page`.

### Task 5: Bout en bout et clôture

- [ ] Smoke : après la première manche, l'écran de fin affiche « +45 XP » et « Série : 1 jour » ; l'accueil affiche la série 1, l'anneau 1/1 et l'XP de la semaine 45 ; rechargement → valeurs identiques ; la page Progrès s'affiche sans erreur ni défilement horizontal à 390 px.
- [ ] README : état itération 4.
- [ ] `npm ci && npm run typecheck && npm test && npm run build && npm run smoke` → vert. Commit.
- [ ] Relecture finale, corrections, push, PR, fusion après CI verte, republication de la page d'essai.
