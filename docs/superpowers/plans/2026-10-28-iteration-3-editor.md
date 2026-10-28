# Itération 3 — Éditeur : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer, modifier et supprimer ses propres notes (6 types) et thèmes, avec validation et aperçu en direct, et pouvoir retirer le deck d'exemple.

**Architecture:** La validation et la conversion formulaire → `NoteFields` sont pures (`src/core/validate.ts`, `src/core/draft.ts`). Le Repo gagne les suppressions. Les services exposent les opérations de bibliothèque. L'interface ajoute une navigation (Accueil, Créer, Bibliothèque), un éditeur dont l'aperçu réutilise `buildExercise` et les composants d'exercice de la séance, et une bibliothèque.

**Tech Stack:** inchangée, sans nouvelle dépendance.

**Spec:** `docs/specs/2026-10-28-ancrage-v1-design.md` (§3 modèle, §4 types d'exercice, §8 écran Créer).

## Global Constraints

- Messages de validation en français, un par champ fautif, affichés sous le champ.
- Règles : recto/verso non vides · texte à trous avec au moins un trou non vide, sans retour à la ligne ni accolades imbriquées dans un trou · ordre : au moins 2 étapes, distinctes · classement : au moins 2 catégories distinctes, bonne catégorie présente · QCM : question et réponse non vides, au moins 1 distracteur distinct de la réponse · situation : situation et réponse modèle non vides.
- Modifier une note conserve `id` et `createdAt`, met à jour `updatedAt`, et garde l'historique des cartes dont la variante subsiste (déjà assuré par `putNote`).
- Supprimer une note supprime ses cartes et leur historique. Confirmation intégrée à la page (pas de `confirm()`).
- Un thème ne se supprime que s'il est vide.
- « Retirer les exemples » supprime les notes taguées `exemple` et les thèmes devenus vides.
- Aucune règle métier dans `src/ui/`.

## Review Focus

1. **Brouillon de saisie libre** : lignes vides, espaces, doublons dans les étapes ou catégories, virgules en fin de liste → normalisés avant validation et sauvegarde. → tests Task 1.
2. **Modifier une note à trous** en corrigeant un trou : les autres cartes gardent leur historique ; la carte du trou modifié repart à zéro (comportement connu, documenté). → test Task 2.
3. **Retirer les exemples** alors que l'utilisateur a mis une note perso dans un thème d'exemple : le thème est conservé. → test Task 2.
4. **Note créée alors que la limite de nouvelles cartes du jour est atteinte** : l'éditeur l'indique (« apparaîtra demain ») au lieu de laisser croire qu'elle est perdue. → test Task 2 (`newSlotsLeft`) et vérif e2e Task 5.
5. **Supprimer le thème sélectionné dans l'éditeur** ou un thème non vide : refus explicite, aucune note orpheline. → test Task 2.

---

### Task 1: Brouillons et validation

**Files:** Create `src/core/draft.ts`, `src/core/validate.ts` · Test `tests/core/draft.test.ts`, `tests/core/validate.test.ts`

**Interfaces:**
- Produces (`draft.ts`):
  - `type Draft = Record<string, string | boolean>` — valeurs brutes du formulaire.
  - `FIELD_SPECS: Record<NoteType, FieldSpec[]>` avec `FieldSpec = { key: string; label: string; kind: 'text' | 'longtext' | 'lines' | 'list' | 'check'; hint?: string }` (`lines` = une entrée par ligne, `list` = séparée par des virgules).
  - `emptyDraft(type: NoteType): Draft`
  - `draftToFields(type: NoteType, draft: Draft): NoteFields` — rogne, retire lignes et éléments vides, dédoublonne `lines`/`list` (comparaison normalisée, première occurrence gardée).
  - `fieldsToDraft(fields: NoteFields): Draft`
- Produces (`validate.ts`): `validateFields(fields: NoteFields): Record<string, string>` — clé = `key` du champ, valeur = message ; `{}` si valide.

- [ ] **Step 1: Tests**
  - `draftToFields('ordering', { title: ' T ', steps: 'A\n\n  B \nA\n' })` → `{ type:'ordering', title:'T', steps:['A','B'] }`.
  - `draftToFields('classify', { statement:'S', categories:'Omission, Distorsion,, omission ,', answer:' Omission ' })` → catégories `['Omission','Distorsion']`, réponse `'Omission'`.
  - `fieldsToDraft` puis `draftToFields` = identité sur une note de chaque type.
  - `validateFields` : un message pour chaque règle des Global Constraints (un test par règle) ; `{}` pour une note valide de chaque type.
  - Cloze `'{{a\nb}}'` → message sur `text` ; `'{{a {{b}} }}'` → message sur `text`.
- [ ] **Step 2–4:** RED puis GREEN (`npx vitest run tests/core/draft.test.ts tests/core/validate.test.ts`).
- [ ] **Step 5:** Commit `feat(core): note drafts and validation`.

### Task 2: Suppressions et services de bibliothèque

**Files:** Modify `src/storage/repo.ts`, `src/storage/dexie-repo.ts`, `src/app/services.ts` · Test `tests/storage/dexie-repo.test.ts`, `tests/app/library.test.ts`

**Interfaces:**
- Repo gagne : `deleteNote(id: string): Promise<void>` (note + cartes + entrées de log de ces cartes, en une transaction) ; `deleteTheme(id: string): Promise<void>` ; `getFlag(key: string): Promise<boolean>` et `setFlag(key: string): Promise<void>` (table `settings`, ligne `flag:<key>`).
- `seedIfEmpty` ne charge le deck qu'une fois dans la vie de la base (drapeau `starterSeeded`) : après « Retirer les exemples », un rechargement ne le recharge pas.
- Services gagnent :
  - `saveNote(input: { id?: string; themeId: string; fields: NoteFields; tags: string[]; source?: string }, now: number): Promise<{ ok: true; note: Note; cards: number } | { ok: false; errors: Record<string, string> }>`
  - `deleteNote(id: string): Promise<void>`
  - `createTheme(name: string): Promise<Theme>` (ordre = max + 1 ; nom rogné, non vide sinon erreur)
  - `renameTheme(id: string, name: string): Promise<void>`
  - `deleteTheme(id: string): Promise<{ ok: boolean; reason?: string }>` — refus si le thème contient des notes.
  - `removeExamples(): Promise<{ notes: number; themes: number }>`
  - `library(): Promise<{ theme: Theme; notes: { note: Note; cards: number }[] }[]>` — thèmes par ordre, notes par `createdAt`.
  - `newSlotsLeft(now: number): Promise<number>`

- [ ] **Step 1: Tests**
  - `deleteNote` retire note, cartes et log de ces cartes, sans toucher aux autres notes.
  - `saveNote` invalide → `ok:false` avec les erreurs de `validateFields`, rien d'écrit.
  - `saveNote` nouvelle → id généré, `createdAt = updatedAt = now`, `cards` = nombre de variantes.
  - `saveNote` existante → même `id`, `createdAt` conservé, `updatedAt = now` ; trou corrigé dans une cloze à 3 trous répondus → 2 anciennes cartes gardent leur id et leur log, la troisième est neuve (Review Focus 2).
  - `deleteTheme` d'un thème non vide → `ok:false`, thème toujours là ; vide → supprimé (Review Focus 5).
  - `seedIfEmpty` après `removeExamples` → `false`, aucune note recréée.
  - `removeExamples` après seed + une note perso dans `ex-meta` → notes d'exemple supprimées, `ex-meta` conservé, autres thèmes d'exemple supprimés (Review Focus 3).
  - `newSlotsLeft` : 5 après seed, 0 après 5 nouvelles cartes répondues aujourd'hui.
  - `library` : ordre des thèmes et des notes, nombre de cartes par note.
- [ ] **Step 2–4:** RED puis GREEN.
- [ ] **Step 5:** Commit `feat(app): library services and deletions`.

### Task 3: Navigation et bibliothèque

**Files:** Create `src/ui/Nav.svelte`, `src/ui/Library.svelte` · Modify `src/App.svelte`, `src/ui/app.css`

- [ ] **Step 1:** Navigation par hash (`#accueil`, `#creer`, `#bibliotheque`) : barre latérale sur ordinateur, barre d'onglets en bas sous 760 px (comme la maquette). La séance reste un calque plein écran.
- [ ] **Step 2:** Bibliothèque : pour chaque thème, nom (renommable en place), nombre de notes, liste des notes (type, première ligne, nombre de cartes, boutons Modifier / Supprimer avec confirmation en ligne), bouton « Nouveau thème », « Supprimer le thème » visible seulement si vide. Bouton « Retirer les exemples » si des notes `exemple` existent, avec confirmation en ligne et compte rendu.
- [ ] **Step 3:** `npm run typecheck && npm test && npm run build` → vert. Commit `feat(ui): navigation and library`.

### Task 4: Éditeur avec aperçu

**Files:** Create `src/ui/Editor.svelte`, `src/ui/Preview.svelte` · Modify `src/App.svelte`

- [ ] **Step 1:** Sélecteur des 6 types (icônes et libellés de la maquette), sélecteur de thème avec option « Nouveau thème… », champs générés depuis `FIELD_SPECS`, tags (virgules), source. Changer de type conserve le brouillon de chaque type.
- [ ] **Step 2:** Aperçu : `buildExercise` sur la note brouillon (`draftToFields`), avec bascule « Débutant / Avancé » (mode reconnaissance ou production), rendu par les composants d'exercice existants, non interactif. Ligne « Génère N cartes ». Erreurs de `validateFields` affichées sous chaque champ après la première tentative d'enregistrement.
- [ ] **Step 3:** Enregistrer → message « Ajouté à « Thème » : N cartes » ; si `newSlotsLeft = 0`, ajouter « Elles apparaîtront à partir de demain. » Le formulaire se vide pour la note suivante, le thème est conservé. En modification : bouton « Enregistrer les modifications », retour à la bibliothèque.
- [ ] **Step 4:** `npm run typecheck && npm test && npm run build` → vert. Commit `feat(ui): note editor with live preview`.

### Task 5: Bout en bout et clôture

**Files:** Modify `scripts/smoke.mjs`, `README.md`

- [ ] **Step 1:** Étendre le smoke : retirer les exemples → l'accueil affiche « Ajoute des cartes » ; créer un thème et une note à trous à 2 trous via l'éditeur ; l'accueil affiche 2 nouvelles cartes ; jouer la manche ; recharger → la note est dans la bibliothèque et l'accueil n'offre plus de nouvelles cartes ; modifier la note (corriger un trou) → toujours présente. Une erreur de validation volontaire est vérifiée à l'écran.
- [ ] **Step 2:** README : état itération 3.
- [ ] **Step 3:** `npm ci && npm run typecheck && npm test && npm run build && npm run smoke` → vert. Commit.
- [ ] **Step 4:** Relecture finale, corrections, push, PR, fusion après CI verte, republication de l'aperçu.
