# Ancrage

Application personnelle de répétition espacée pour le coaching et la PNL.
Le principe d'Anki (cartes personnelles, planification FSRS) avec l'expérience de Duolingo
(ressenti soigné, objectif quotidien, exercices variés, progression visible par thème).

## État

v1 complète, utilisable au quotidien.

- **Séance** : file du jour (révisions dues, puis nouvelles cartes), manches de 10, 6 types d'exercice, retour immédiat avec la note FSRS et la prochaine échéance.
- **Créer et Bibliothèque** : tes propres notes et thèmes, validation et aperçu en direct.
- **Motivation** : XP alignée sur la rétention, série avec gels, objectif du jour, maîtrise par thème, page Progrès.
- **Réglages** : rétention visée (0,70 à 0,97), nouvelles cartes par jour, sauvegarde et restauration JSON.
- **Application installable** (PWA), qui fonctionne hors ligne après la première visite.

Prochaines versions : synchronisation entre appareils (v1.1), génération de cartes par IA (v1.2).

## Installer l'application

Une fois Ancrage hébergé (voir « Déploiement ») :

- **Ordinateur (Chrome, Edge)** : icône d'installation dans la barre d'adresse.
- **Android (Chrome)** : menu ⋮ → « Installer l'application ».
- **iPhone, iPad (Safari)** : bouton Partager → « Sur l'écran d'accueil ».

Tes données restent dans le navigateur de chaque appareil. Télécharge une sauvegarde depuis Réglages, régulièrement, et avant de changer d'appareil.

## Déploiement

Le workflow `.github/workflows/deploy.yml` publie l'application sur GitHub Pages, à l'adresse `https://<compte>.github.io/Ancrage/`. Il se lance à la main :

1. Dans le dépôt, Settings → Pages → Source : « GitHub Actions ».
2. Onglet Actions → « Deploy to GitHub Pages » → « Run workflow ».

## Développement

Prérequis : Node 22.

```bash
npm install
npm test           # tests unitaires (Vitest)
npm run typecheck  # svelte-check
npm run dev        # serveur de développement
npm run build && npm run smoke   # parcours de bout en bout dans Chromium (Playwright requis)
node scripts/make-icons.mjs      # régénère les icônes de l'application
```

Code : `src/core/` (domaine pur, sans navigateur), `src/storage/` (persistance IndexedDB via Dexie).
Plan de l'itération : [`docs/superpowers/plans/2026-10-28-iteration-1-engine.md`](docs/superpowers/plans/2026-10-28-iteration-1-engine.md).

## Stack

PWA Svelte 5 + Vite + TypeScript, IndexedDB (Dexie), `ts-fsrs` 5.4.2, `vite-plugin-pwa`, Vitest. Licence MIT.
Aucun code d'Anki n'est réutilisé : seuls les principes le sont.

## Feuille de route

1. Moteur : modèle de données, stockage, FSRS rejoué depuis l'historique, mapping exercice → note.
2. Séance : les 6 types d'exercice, feedback, manches.
3. Éditeur de notes et thèmes.
4. Accueil, XP, streak, maîtrise, statistiques.
5. PWA installable, persistance, sauvegarde JSON.

Ensuite : sync (v1.1), génération de cartes par IA (v1.2).
