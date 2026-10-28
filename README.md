# Ancrage

Application personnelle de répétition espacée pour le coaching et la PNL.
Le principe d'Anki (cartes personnelles, planification FSRS) avec l'expérience de Duolingo
(ressenti soigné, objectif quotidien, exercices variés, progression visible par thème).

## État

Itération 4 : la motivation façon Duolingo, alignée sur la rétention.

- **XP** : 10 par carte due traitée (réussie ou non), 5 par nouvelle carte, 20 par manche ; 0 pour une révision en avance.
- **Série** : +1 par jour où une manche est finie ; un gel gagné tous les 7 jours (2 au maximum) couvre un jour manqué.
- **Accueil** : série, XP de la semaine, gels, anneau d'objectif du jour, parcours des thèmes avec leur palier de maîtrise.
- **Maîtrise** : part des cartes d'un thème avec stabilité ≥ 21 jours et rappel ≥ 90 % (Nouveau, Découverte, En cours, Solide, Ancré).
- **Progrès** : rétention réelle, cartes ancrées, régularité sur 20 semaines, révisions prévues sur 7 jours, état des cartes.
- Déjà là : éditeur des 6 types d'exercice, bibliothèque, séance en manches de 10, données locales (IndexedDB).

Pas encore : installation PWA, fonctionnement hors ligne, sauvegarde JSON (itération 5), sync (v1.1), génération IA (v1.2).

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
