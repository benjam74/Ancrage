# Ancrage

Application personnelle de répétition espacée pour le coaching et la PNL.
Le principe d'Anki (cartes personnelles, planification FSRS) avec l'expérience de Duolingo
(ressenti soigné, objectif quotidien, exercices variés, progression visible par thème).

## État

Itération 1 : moteur terminé (sans interface). Il génère les cartes depuis les notes, corrige
les réponses, convertit le résultat en note FSRS et reconstruit l'état de chaque carte en rejouant
son historique de révisions.

- Spec v1 : [`docs/specs/2026-10-28-ancrage-v1-design.md`](docs/specs/2026-10-28-ancrage-v1-design.md)
- Audit rétro-ingénierie d'Anki : [`docs/research/2026-10-28-anki-audit.md`](docs/research/2026-10-28-anki-audit.md)
- Maquette interactive (HTML autonome, à ouvrir dans un navigateur) : [`prototype/maquette.html`](prototype/maquette.html)

## Développement

Prérequis : Node 22.

```bash
npm install
npm test           # tests unitaires (Vitest)
npm run typecheck  # svelte-check
npm run dev        # serveur de développement
```

Code : `src/core/` (domaine pur, sans navigateur), `src/storage/` (persistance IndexedDB via Dexie).
Plan de l'itération : [`docs/superpowers/plans/2026-10-28-iteration-1-engine.md`](docs/superpowers/plans/2026-10-28-iteration-1-engine.md).

## Stack

PWA Svelte 5 + Vite + TypeScript, IndexedDB (Dexie), `ts-fsrs` 5.4.2, Vitest. Licence MIT.
Aucun code d'Anki n'est réutilisé : seuls les principes le sont.

## Feuille de route

1. Moteur : modèle de données, stockage, FSRS rejoué depuis l'historique, mapping exercice → note.
2. Séance : les 6 types d'exercice, feedback, manches.
3. Éditeur de notes et thèmes.
4. Accueil, XP, streak, maîtrise, statistiques.
5. PWA installable, persistance, sauvegarde JSON.

Ensuite : sync (v1.1), génération de cartes par IA (v1.2).
