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
- **Affûter le coaching** (v1.13) : Générer → « Cartes de contraste » relit tes cartes d'un domaine et crée des cartes qui obligent à distinguer les notions proches (recadrage ou reformulation…), rangées dans un thème « Contrastes ». En séance, « Sûr de moi ? » avant de vérifier : une erreur commise en étant sûr est signalée, son explication s'ouvre, et Progrès compte ces erreurs.
- **Synchronisation fiable** (v1.11) : les modifications d'une même carte sur deux appareils sont fusionnées champ par champ ; avec la table du guide (« Synchronisation rapide »), seuls les changements voyagent.
- **Explications** (v1.10) : chaque carte peut porter un « Pourquoi ? » d'une ou deux phrases (éditeur), affiché après la réponse, ouvert d'office en cas d'erreur. Les cartes générées l'ont d'office ; les cartes d'exemple ont des explications écrites à la main. Avec ta clé : « Expliquer avec Claude » en séance, ou « Compléter les explications » d'un thème dans la Bibliothèque, toujours relues avant d'être enregistrées.
- **Mélange** (v1.9) : par domaine (Bibliothèque → « Nouvelles cartes : tout mélanger / chapitre par chapitre »), les nouvelles cartes alternent entre les thèmes ; par défaut tout se mélange, sauf les matières du collège. L'accueil montre alors « Tes thèmes » (une carte de progression) au lieu d'un parcours. Dans « Choisir quoi réviser » : « Mélange » (à réviser, nouvelles et fragiles en alternance) et « Situations mêlées » (mises en situation et classements de tous les thèmes, pour s'entraîner à choisir le bon outil).
- **Images masquées et voix** (v1.8) : Créer → « Image masquée ». Choisis une photo ou un schéma, trace une zone sur chaque partie à retrouver et écris sa réponse ; chaque zone devient une carte (choix parmi les autres réponses tant qu'elle est jeune, puis réponse à taper). En séance, le haut-parleur lit la carte dans la langue du thème (Bibliothèque → « Lecture : Anglais », etc.), et le micro dicte ta réponse dans les navigateurs qui le permettent. Réglages → Voix : lecture automatique.
- **Qualité des cartes et efficacité** (v1.7) : Créer → Générer → « Importer des fichiers » (Markdown, un export Obsidian par exemple, texte ou PDF, plusieurs à la fois) ; chaque titre devient une section et chaque section un thème, créé au premier ajout. Une carte oubliée 4 fois apparaît dans Bibliothèque → « Cartes difficiles » : la modifier, la faire reformuler par Claude, ou la mettre de côté (hors révisions, historique gardé, reprise possible). Sur une mise en situation, écris ta réponse puis demande le « Retour de Claude » : point clé par point clé, une formulation améliorée, et la note suggérée (c'est toi qui choisis). Le parcours montre la mémoire de chaque thème, maintenant et dans 30 jours sans réviser ; Progrès → « Est-ce que ça marche ? » donne la réussite des révisions dues sur 30 et 90 jours, par type d'exercice et par domaine.
- **Famille** (v1.6) : un profil par personne (Réglages → Profils), chacun avec ses cartes, ses progrès, sa série, sa boutique et sa synchronisation. Code à 4 chiffres facultatif. Avec plusieurs profils, l'appli s'ouvre sur « Qui révise ? ». Les thèmes se rangent dans des **domaines** (ex. Mathématiques → Fractions, Nombres relatifs) ; les tiens sont dans « Coaching et PNL ». Cartes de départ « Collège 5e » (6 matières, 12 chapitres, 59 cartes) au choix à la création d'un profil. Pour synchroniser un profil enfant sur son propre appareil, crée-lui un compte (son adresse e-mail) dans le même projet Supabase.
- **Boutique et personnages** (v1.5), fondés sur un [benchmark et une revue d'études](docs/research/2026-10-29-shop-avatar-research.md) : choisis Renard, Loutre, Ourson ou Lapin et donne-lui un nom ; tout le monde commence en pyjama moche. 50 objets en 8 catégories (hauts, bas, chapeaux, lunettes, cou, objets, compagnons, décors) et 4 paliers, de 60 à 6 000 XP, à essayer avant d'acheter et revendables à moitié prix. Acheter ne retire rien à l'XP de la semaine ni aux progrès : le porte-monnaie est l'XP gagnée depuis le début, moins les achats. Ton personnage se tient sur le chapitre en cours du parcours et marche jusqu'au suivant quand ta maîtrise avance. Au-delà de 20 nouvelles cartes dans la journée, les suivantes ne rapportent plus d'XP.
- **Réviser ce que tu veux** (v1.4) : Accueil → « Choisir quoi réviser », ou « Réviser ce thème » dans le parcours. Choisis un ou plusieurs thèmes, puis les cartes à réviser, autant de nouvelles cartes que tu veux (elles comptent dans la limite du jour, à faire après ta séance), ou un entraînement libre sur les cartes déjà vues (les plus fragiles d'abord), par 10, 20, 50 ou toutes. L'entraînement libre ne rapporte pas d'XP et ne compte pas pour la série.
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
9. Séances à la carte (v1.4).
10. Boutique, personnages, parcours animé (v1.5).
11. Profils familiaux et domaines (v1.6).
12. Import de documents, cartes difficiles, retour de Claude sur les mises en situation, tableau d'efficacité (v1.7).
13. Images masquées, lecture à voix haute et dictée (v1.8).
14. Mélange des thèmes et situations mêlées (v1.9).
15. Explications des réponses (v1.10).
16. Synchronisation fiable : fusion champ par champ, synchronisation rapide (v1.11).
17. Cartes de contraste et « Sûr de moi » (v1.13). La v1.12 (famille : défis, notifications) est reportée.
