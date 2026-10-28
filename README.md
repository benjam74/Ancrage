# Ancrage

Application personnelle de répétition espacée pour le coaching et la PNL.
Le principe d'Anki (cartes personnelles, planification FSRS) avec l'expérience de Duolingo
(ressenti soigné, objectif quotidien, exercices variés, progression visible par thème).

## État

Itération 2 : séance jouable dans le navigateur.

- File du jour : révisions dues (entrelacées entre thèmes, plus en retard d'abord), puis 5 nouvelles cartes par jour.
- Manches de 10 exercices ; une carte ratée revient une fois en fin de manche.
- Les 6 types d'exercice, avec retour immédiat (réponse attendue, note FSRS, prochaine échéance) et correction « En fait je ne savais pas ».
- Données stockées localement (IndexedDB). Un deck de démarrage de 23 notes de coaching et de PNL, tagué `exemple`, est chargé au premier lancement.

Pas encore : éditeur de cartes (itération 3), XP, série et maîtrise (itération 4).

## Développement

Prérequis : Node 22.

```bash
npm install
npm test           # tests unitaires (Vitest)
npm run typecheck  # svelte-check
npm run dev        # serveur de développement
npm run build && npm run smoke   # parcours de bout en bout dans Chromium (Playwright requis)
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
