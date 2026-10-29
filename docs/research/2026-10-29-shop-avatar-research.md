# Boutique, personnages et parcours : benchmark et études

Synthèse du 29 octobre 2026, pour la v1.5. Deux recherches web en parallèle : un benchmark (Duolingo, Finch, Habitica, Khan Academy, Forest, Fortnite) et une revue d'études. « Secondaire » : chiffre lu dans un résumé ou un wiki de fans, non vérifié à la source.

## Études

| # | Constat | Source | Confiance | Conséquence |
|---|---|---|---|---|
| A1 | Personnaliser son avatar augmente l'identification, qui va avec plus d'autonomie, d'effort, de plaisir et de temps de jeu | Birk, Atkins, Bowey & Mandryk 2016, CHI, doi:10.1145/2858036.2858062 | Moyenne | Choisir et nommer son personnage dès le départ, pas seulement via les achats. |
| A2 | Dans des tâches répétitives d'entraînement, l'avatar personnalisé réduit l'abandon et améliore l'attention | Birk & Mandryk 2018, CHI, doi:10.1145/3173574.3174234 ; 2019, JMIR 21(1):e10133 | Moyenne | C'est le cas le plus proche de la révision quotidienne. |
| A3 | L'identification à l'avatar améliore motivation intrinsèque et sentiment d'efficacité, indépendamment des badges | Kao & Harrell 2018, CHI (n = 2 189) | Moyenne | Des personnages auxquels on s'attache ; le pyjama fait sourire sans humilier. |
| A4 | On tend à se comporter comme son avatar (effet Proteus, r ≈ 0,22–0,26 sur ~46 études) | Yee & Bailenson 2007 ; Ratan et al. 2020, *Media Psychology* (secondaire) | Moyenne | Les objets les plus chers donnent une allure de coach compétent. |
| A5 | Les récompenses attendues liées à la participation baissent la motivation intrinsèque (d = −0,40) ; le retour informatif l'augmente | Deci, Koestner & Ryan 1999 | Haute | L'XP reste la trace d'un acquis ; la boutique ne dit jamais « révise pour gagner ». |
| A6 | La gamification aide un peu ; l'effet sur la motivation est fragile | Sailer & Homner 2020 | Haute | La boutique est un plus, pas le moteur. |
| A7 | Badges imposés et comparaisons sociales peuvent faire baisser la motivation | Hanus & Fox 2015 | Moyenne | Boutique facultative, jamais une barrière au contenu. |
| A8 | Les biens virtuels ont de la valeur s'ils se voient quelque part | Hamari & Keronen 2017, *Computers in Human Behavior* | Moyenne | Le personnage apparaît sur le parcours, l'accueil et la fin de manche. |
| A9 | Une jauge déjà entamée et la proximité du but accélèrent l'effort ; l'effort chute juste après la récompense | Nunes & Drèze 2006 ; Kivetz et al. 2006 | Haute / moyenne | « Objectif » d'achat avec jauge préremplie par le solde ; proposer l'objectif suivant après un achat. |
| A10 | Trop de choix peut paralyser, surtout sans repères | Scheibehenne et al. 2010 (effet moyen nul, très variable) ; Chernev et al. 2015 | Moyenne | 50 objets rangés par catégorie, avec un objet suggéré. |
| A11 | « Gaming the system » nuit à l'apprentissage | Baker et al. 2004, CHI | Haute | Pas d'XP pour ce qui se farme : réviser en avance (déjà 0) et ajouter des cartes en masse (plafond). |
| A12 | Aucune étude solide sur une carte de chapitres | — | — | Le déplacement suit la maîtrise réelle, pas l'XP. |

## Benchmark

| App | Mécanique | Chiffres | Leçon pour Ancrage |
|---|---|---|---|
| Duolingo | Gemmes séparées de l'XP ; tenues de Duo de 400 à 1 000 gemmes, retirées en 2022 | Wiki de fans (secondaire) ; aucune donnée publique d'impact | Monnaie distincte du score ; ne jamais retirer ce qui a été acheté. |
| Finch | Pierres gagnées par objectifs ; boutique tournante ; revente à moitié prix ; peluches à 15–20 000 | Wiki de fans (secondaire) | Revente à 50 % ; quelques objectifs très longs. |
| Habitica | Or par tâche × difficulté, et moins pour une tâche répétée à l'infini ; équipement 20 à 380 d'or | Wiki (secondaire) | Ne pas payer la répétition facile. |
| Khan Academy | Avatars débloqués à 10 k, 50 k, 100 k, 250 k points | Wiki (secondaire) | Les très gros joueurs manquent de buts : prévoir des objets très chers. |
| Fortnite | Paliers de rareté, le plus cher ≈ 3–4 × le moins cher | Boutiques passées (secondaire) | Paliers lisibles ; écart plus grand ici, faute d'argent réel. |
| Candy Crush, Duolingo | Repère du joueur sur une carte de niveaux, animé | Pas de donnée | Personnage plus grand et animé sur le nœud courant. |

## Décisions qui en découlent

- **Deux compteurs.** L'XP gagnée reste intacte (semaine, moyenne, progrès). Le porte-monnaie vaut : XP gagnée depuis le début − achats + reventes. Acheter ne fait jamais baisser l'XP affichée ailleurs.
- **Quatre paliers.** Commun 60–150 XP (premier achat en 1 à 2 jours), Rare 300–600 (une semaine), Épique 1 000–1 800 (2 à 4 semaines), Légendaire 3 000–6 000 (1 à 3 mois), pour environ 80 XP par jour.
- **Pas de farm.** Au-delà de 20 nouvelles cartes dans une journée, les suivantes ne rapportent plus d'XP. Réviser en avance reste à 0.
- **Rien d'aléatoire, rien qui expire, pas de minuteur.** Pas de coffre ni de tirage.
- **Revente à 50 %** à tout moment.
- **Le personnage avance quand la maîtrise avance** : il se tient sur le chapitre en cours (le thème commencé le plus proche de son palier suivant) et marche jusqu'au suivant quand ce chapitre change.
