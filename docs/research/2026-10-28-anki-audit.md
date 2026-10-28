# Audit rétro-ingénierie — Anki 26.09.3 (commit 82e5848, 2026-10-28)

Source : https://github.com/ankitects/anki (cloné en local pour l'analyse, non inclus dans ce dépôt)

## 1. Architecture en couches

| Couche | Dossier | Taille | Rôle | Réutilisable pour le fork ? |
|---|---|---|---|---|
| Cœur Rust | `rslib/` | ~80k lignes | Stockage SQLite, scheduler (SM-2 + FSRS), recherche, import/export .apkg, sync, rendu des templates, undo, stats | **Oui, c'est l'actif principal** |
| Contrat IPC | `proto/anki/*.proto` | ~3,5k lignes | 24 services protobuf (Scheduler, Decks, Notes, Stats, Sync…) | **Oui**, c'est l'API |
| Bridge Python | `pylib/rsbridge/lib.rs` | ~100 lignes | Expose `run_service_method(service, method, bytes)` | Modèle à copier (Tauri/JNI) |
| Lib Python | `pylib/anki/` | ~13k lignes | Wrapper haut niveau | Non |
| GUI Qt | `qt/aqt/` | ~39k lignes | Fenêtre principale, deck browser, reviewer, browser, add-ons | **Non** — c'est la partie « moche » |
| Web Svelte | `ts/` | ~45k lignes | Pages modernes : deck-options, graphs, editor, import, image-occlusion | Partiellement (editor, graphs) |

Point clé : toute la logique métier passe par **un seul point d'entrée binaire**
`Backend::run_service_method(service: u32, method: u32, input: &[u8]) -> Vec<u8>`.
Python, AnkiDroid (JNI) et les pages Svelte (via `POST /_anki/<method>` dans `qt/aqt/mediasrv.py`) l'utilisent tous.
Un nouveau frontend n'a besoin que de ce point d'entrée + les .proto.

## 2. Ce que le cœur fournit déjà (pas à réécrire)

- **Scheduler v3** (`rslib/src/scheduler/`) : états New/Learning/Review/Relearning, fuzz, load balancer, filtered decks, bury/suspend.
- **FSRS** via crate `fsrs = 6.6.2` : calcul des paramètres, rétention optimale, simulation de charge. RPC : `GetQueuedCards`, `AnswerCard`, `GetSchedulingStates`, `ComputeFsrsParams`, `SimulateFsrsWorkload`.
- **Stockage** : SQLite schéma v18 (`col, notes, cards, revlog, graves` + tables deck/notetype/config). `revlog` = historique complet des révisions → base idéale pour XP/streaks sans nouvelle table de vérité.
- **Import/export .apkg/.colpkg/CSV** : accès immédiat aux milliers de decks partagés.
- **Sync** : client AnkiWeb + **serveur de sync auto-hébergeable** intégré (`rslib/src/sync/http_server`).
- **Rendu de cartes** : templates Mustache-like, cloze, type-answer, MathJax, image occlusion.

## 3. Ce qui rend Anki « moche » (et où ça vit)

- `qt/aqt/deckbrowser.py`, `overview.py`, `reviewer.py` : HTML généré en Python (chaînes f-string), jQuery legacy, injecté dans une QWebEngineView. Pas de design system.
- Mélange Qt widgets natifs + webviews → incohérence visuelle structurelle. Un reskin CSS ne la corrige pas.
- Boucle d'interaction pauvre : 4 boutons (Again/Hard/Good/Easy), aucun feedback, aucune progression visible.

## 4. Contraintes dures

- **Licence AGPL-3.0** : le fork doit rester AGPL ; si exposé en service réseau, le code source doit être publié aux utilisateurs. Compatible usage perso et open source ; incompatible avec un SaaS fermé.
- **Marque** : nom et logo « Anki » non utilisables pour le produit dérivé → autre nom.
- **AnkiWeb** : utiliser le sync officiel depuis un client tiers relève des CGU d'AnkiWeb (confiance moyenne sur la tolérance ; AnkiDroid est un cas autorisé explicitement). Le serveur auto-hébergé évite la question.
- **Build** : toolchain Rust 1.99, protoc, build ninja maison. Compiler `rslib` seul en dépendance Cargo n'a **pas encore été vérifié** (exécution bloquée dans cet environnement) → spike n°1.

## 5. Tension de fond Anki × Duolingo (à arbitrer, pas à ignorer)

1. **Gamification vs mémoire** : XP/leagues récompensent le volume ; FSRS récompense la régularité au bon moment. Une XP par carte pousse à faire des cartes faciles ou du cramming. → L'XP doit dériver de la *rétention atteinte* et de la *complétion des dues*, pas du nombre de taps.
2. **Reconnaissance vs rappel** : les exercices Duolingo (QCM, appariement, remettre dans l'ordre) testent la reconnaissance, plus facile que le rappel libre. Les faire passer en note FSRS « Good » corrompt le modèle (rétention surestimée → intervalles trop longs). → Soit ces exercices n'alimentent pas FSRS, soit ils mappent vers une note pondérée, soit on garde le rappel actif comme vérité.
3. **Parcours vs échéance** : Duolingo ordonne par curriculum (unités, path) ; Anki par échéance. → Session quotidienne = dues FSRS d'abord, puis « nouvelle leçon » = paquet de nouvelles cartes regroupées par tag/sous-deck.
4. **Auto-notation** : Anki fait noter l'utilisateur (biais). Les exercices à réponse vérifiable (saisie, QCM) permettent une notation automatique → avantage réel sur Anki.

## 6. Options d'architecture

- **A. Fork complet + reskin Qt** : garde tout, mais reste prisonnier de Qt/Python et du build lourd. Gain UX limité. Déconseillé.
- **B. Nouvelle app (Tauri 2 + Svelte/React) sur `rslib` en dépendance** : réutilise scheduler/FSRS/stockage/import/sync, UI 100 % libre, desktop + mobile (Tauri 2 iOS/Android ; AnkiDroid prouve que rslib compile sur Android). **Recommandé.** Risque : coût de build de rslib (spike n°1).
- **C. App web from scratch avec `ts-fsrs`** : MVP le plus rapide, perte de compat sync/collection, réimplémentation du scheduler. Bon pour un prototype UX jetable.
- **D. Add-on Anki** : le moins cher, plafond UX bas.

## 7. Spikes proposés pour l'itération 1

1. `cargo check -p anki` hors build Anki ; puis mini-binaire Rust qui ouvre une collection, appelle `GetQueuedCards` et `AnswerCard`. Critère : une carte répondue apparaît dans `revlog`.
2. Shell Tauri qui expose `run_service_method` et un client TS généré depuis les .proto. Critère : liste des decks affichée depuis une vraie collection.
