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

- **Synchronisation** entre appareils (v1.1) : automatique avec ton propre projet Supabase gratuit, ou par fichier sans compte. Les historiques des appareils sont fusionnés, rien ne se perd. Guide : [`docs/sync-supabase.md`](docs/sync-supabase.md).

- **Accroche** (v1.3), fondée sur un [benchmark et une revue d'études](docs/research/2026-10-29-engagement-research.md) : sons et vibrations à chaque réponse, compteur « d'affilée », fin de manche en deux écrans (bilan puis série), semaine visible jour par jour, série récupérable par 2 manches le lendemain d'un jour manqué, bonus de retour, objectif du jour réglable (1 à 3 manches) avec un anneau qui se remplit carte par carte, ta semaine comparée à ta moyenne, cartes restantes avant le palier suivant, rendez-vous quotidien à ajouter à ton agenda. Tout se règle ou se coupe dans Réglages → Motivation.
- **Cartes générées par IA** (v1.2) : Créer → « Générer depuis un texte ». Colle des notes de formation ou un extrait, Claude propose des cartes des 6 types, fidèles au texte ; tu les relis, modifies ou écartes avant tout ajout. Il faut ta propre clé API Anthropic ([console.anthropic.com](https://console.anthropic.com)), enregistrée seulement sur l'appareil. Le texte collé est envoyé à Anthropic : n'y mets pas de données de clients identifiables. Coût indicatif : quelques centimes par texte de quelques pages.

## Installer l'application

Une fois Ancrage hébergé (voir « Déploiement ») :

- **Ordinateur (Chrome, Edge)** : icône d'installation dans la barre d'adresse.
- **Android (Chrome)** : menu ⋮ → « Installer l'application ».
- **iPhone, iPad (Safari)** : bouton Partager → « Sur l'écran d'accueil ».

Tes données restent dans le navigateur de chaque appareil. Pour les partager entre appareils, active la synchronisation (Réglages → Synchronisation) ou fusionne une sauvegarde (Réglages → Ouvrir une sauvegarde → Fusionner).

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

Code : `src/core/` (domaine pur, sans navigateur), `src/storage/` (persistance IndexedDB via Dexie), `src/sync/` (fusion et Supabase), `src/app/` (services, appel à Claude), `src/ui/` (interface).
Plans des itérations : [`docs/superpowers/plans/`](docs/superpowers/plans/).

## Stack

PWA Svelte 5 + Vite + TypeScript, IndexedDB (Dexie), `ts-fsrs` 5.4.2, `vite-plugin-pwa`, `@anthropic-ai/sdk` (chargé à la demande), Vitest. Licence MIT.
Aucun code d'Anki n'est réutilisé : seuls les principes le sont.

## Feuille de route

1. Moteur : modèle de données, stockage, FSRS rejoué depuis l'historique, mapping exercice → note.
2. Séance : les 6 types d'exercice, feedback, manches.
3. Éditeur de notes et thèmes.
4. Accueil, XP, streak, maîtrise, statistiques.
5. PWA installable, persistance, sauvegarde JSON.

6. Synchronisation (v1.1).
7. Génération de cartes par IA (v1.2).
8. Accroche et régularité (v1.3).
