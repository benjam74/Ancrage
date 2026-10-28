# Ancrage — spec v1 (2026-10-28)

Nom de travail. App personnelle de répétition espacée pour le coaching / PNL :
le principe d'Anki (cartes personnelles + FSRS) avec l'expérience de Duolingo
(ressenti, motivation quotidienne, exercices variés, progression visible).

## 1. Ce que l'utilisateur a dit / ce que j'ai supposé

Dit :
- Domaine : connaissances conceptuelles et procédurales (coaching, PNL).
- Cœur : création de cartes personnalisées.
- Appareils : ordinateur d'abord, mobile ensuite, synchronisés.
- Pas de compatibilité Anki requise (import .apkg = bonus futur).
- Duolingo = esthétique/ressenti, motivation quotidienne, variété d'exercices, progression visible. Pas de social.
- Création : manuelle, puis assistée par IA avec validation.
- Données : local-first, puis sync Supabase ou fichier.

Supposé (décidé par moi, délégation explicite) :
- Usage mono-utilisateur. Pas de comptes en v1.
- Séance quotidienne cible : 10–15 minutes.
- Rétention visée par défaut : 0,90.

## 2. Décisions d'architecture

- PWA : Svelte 5 + Vite + TypeScript, `vite-plugin-pwa`.
- Stockage : IndexedDB via Dexie, derrière une interface `Repo` (substituable par SQLite si emballage Capacitor/Tauri).
- Planification : `ts-fsrs` (FSRS-6). Aucune réutilisation du code Anki (AGPL non contaminant puisque rien n'est copié).
- Tests : Vitest (moteur, mapping des notes, calculs gamification), Playwright (parcours séance).
- Persistance : `navigator.storage.persist()` + export/import JSON de sauvegarde dès v1.

## 3. Modèle de données

```
Theme      { id, parentId?, name, order, color }
Note       { id, themeId, type, fields: JSON, tags[], source?, createdAt, updatedAt, fieldClock: {field: ts} }
Card       { id, noteId, variant }          // variant = index du trou, sens recto/verso…
ReviewLog  { id (ULID), cardId, ts, rating: 1..4, mode: 'recognition'|'production'|'self',
             correct: bool, durationMs, hintUsed: bool, deviceId }
CardState  cache dérivé = replay FSRS de ReviewLog trié par ts
Settings   { desiredRetention, newPerDay, dailyGoal, fsrsParams? }
Event      { id, type: 'streak_freeze_used'|'streak_freeze_earned', ts }
```

Invariants :
- `ReviewLog` est append-only. `CardState` se reconstruit à l'identique depuis le log.
- XP, streak, maîtrise sont des fonctions pures de `ReviewLog` + `Event`.
- Sync future : union des logs (sans conflit) ; notes en LWW par champ via `fieldClock`.

## 4. Types d'exercice

| Type | Champs | Cartes générées | Mode reconnaissance | Mode production |
|---|---|---|---|---|
| basic | recto, verso, inverse? | 1–2 | QCM sur le verso (distracteurs = versos du même thème) | auto-évaluation |
| cloze | texte avec `{{…}}` | 1 par trou | choix du mot parmi 4 | saisie (tolérance casse/accents, Levenshtein ≤ 1 si ≥ 6 lettres) |
| ordering | titre, étapes[] | 1 | remettre dans l'ordre avec 1ère étape donnée | ordre complet |
| classify | énoncé, catégories[], bonne | 1 par énoncé | choix parmi les catégories | idem + justification libre auto-évaluée (option) |
| mcq | question, bonne, distracteurs[] | 1 | QCM | — (reste reconnaissance) |
| scenario | situation, réponse modèle, points-clés[] | 1 | — | rappel libre puis auto-évaluation guidée par les points-clés |

Sélection du mode : reconnaissance si la carte est nouvelle, en apprentissage, ou si sa stabilité est < 7 jours ; production sinon.

## 5. Conversion en note FSRS

- Erreur → Again (1).
- Réussite en reconnaissance → Hard (2).
- Réussite en production → Good (3) ; Easy (4) si durée < médiane personnelle du type et sans indice.
- Auto-évaluation : Raté (1) / Difficile (2) / Su (3).
- Correction après coup possible (« En fait je ne savais pas » / « J'avais bon ») : réécrit la dernière entrée du log de la séance avant sa clôture.
- Confiance moyenne dans la pondération reconnaissance = Hard. Optimiseur FSRS relancé sur l'historique personnel après 400 révisions.

## 6. Boucle de séance

1. « Séance du jour » = cartes dues (entrelacées entre thèmes, plus en retard d'abord) puis une « leçon » de 5 nouvelles cartes du thème actif.
2. Découpée en manches de 10 exercices, avec barre de progression et écran de fin de manche.
3. Une carte ratée revient en fin de manche (équivalent des learning steps courts).
4. Feedback immédiat : bandeau vert/rouge en bas, réponse correcte, son court, bouton Continuer (Entrée).
5. Objectif du jour atteint = toutes les dues faites ou au moins 1 manche terminée.

## 7. Gamification (alignée sur la rétention)

- XP : 10 par carte due traitée (réussie ou non : on récompense l'effort, pas l'évitement), +5 par nouvelle carte, +20 par manche finie. 0 XP pour une carte révisée en avance (anti-bachotage).
- Streak : +1 par jour où l'objectif est atteint. Gel : 1 gagné tous les 7 jours, stock max 2, consommé automatiquement.
- Maîtrise par thème : part des cartes avec stabilité ≥ 21 j et rétrievabilité ≥ 0,9. Paliers : Découverte (< 25 %), En cours, Solide (≥ 60 %), Ancré (≥ 90 %).
- Parcours : carte des thèmes en chemin vertical, chaque nœud montre son palier.

## 8. Écrans v1

Accueil (streak, anneau objectif, CTA séance, chemin des thèmes) · Séance · Fin de manche · Thèmes · Créer (éditeur par type + aperçu en direct) · Statistiques (heatmap, prévision des dues) · Réglages (rétention, nouvelles/jour, export/import).

Identité : chaleureuse et adulte, éloignée du vert-hibou. Encre bleu-pétrole, accent corail, jaune soleil pour XP/streak. Typo arrondie (Nunito). Gros boutons à relief, transitions courtes, sons optionnels.

## 9. Hors périmètre v1

Sync (v1.1), génération IA (v1.2, clé API locale, avertissement confidentialité), notifications push, import .apkg, social.

## 10. Itérations

0. Maquette interactive (cette étape).
1. Moteur : modèle, `Repo` Dexie, wrapper FSRS, mapping des notes, replay du log. Tests Vitest.
2. Séance : les 6 exercices, feedback, manches.
3. Éditeur de notes + thèmes.
4. Accueil, XP, streak, maîtrise, stats.
5. PWA installable, persistance, sauvegarde JSON.
