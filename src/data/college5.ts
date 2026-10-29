import type { Note, NoteFields, Theme } from '../core/model';

/** Example cards for a 5e pupil (French curriculum, cycle 4): six subjects as domains, twelve chapters. */

const domain = (id: string, name: string, order: number): Theme => ({ id, name, order, kind: 'domain' });
const chapter = (id: string, name: string, parentId: string, order: number): Theme => ({ id, name, parentId, order });

export const COLLEGE5_THEMES: Theme[] = [
  domain('c5-maths', 'Mathématiques', 0),
  chapter('c5-fractions', 'Fractions', 'c5-maths', 0),
  chapter('c5-relatifs', 'Nombres relatifs', 'c5-maths', 1),
  chapter('c5-triangles', 'Triangles et angles', 'c5-maths', 2),
  chapter('c5-priorites', 'Priorités opératoires', 'c5-maths', 3),
  domain('c5-francais', 'Français', 1),
  chapter('c5-grammaire', 'Grammaire', 'c5-francais', 0),
  chapter('c5-conjugaison', 'Conjugaison', 'c5-francais', 1),
  chapter('c5-figures', 'Figures de style', 'c5-francais', 2),
  domain('c5-hg', 'Histoire-géographie', 2),
  chapter('c5-moyen-age', 'Le Moyen Âge', 'c5-hg', 0),
  chapter('c5-geographie', 'Population et ressources', 'c5-hg', 1),
  domain('c5-svt', 'SVT', 3),
  chapter('c5-respiration', 'Respiration et circulation', 'c5-svt', 0),
  domain('c5-pc', 'Physique-chimie', 4),
  chapter('c5-etats', 'États de la matière', 'c5-pc', 0),
  domain('c5-anglais', 'Anglais', 5),
  chapter('c5-irreguliers', 'Verbes irréguliers', 'c5-anglais', 0),
];

const TRIANGLES = ['Isocèle', 'Équilatéral', 'Rectangle'];
const CLASSES = ['Nom', 'Adjectif', 'Verbe', 'Adverbe'];
const FIGURES = ['Comparaison', 'Métaphore', 'Personnification', 'Hyperbole'];
const CHANGES = ['Fusion', 'Solidification', 'Vaporisation', 'Liquéfaction'];

const CONTENT: [themeId: string, fields: NoteFields][] = [
  ['c5-fractions', { type: 'cloze', text: 'Pour additionner deux fractions, on les écrit d’abord avec le même {{dénominateur}}.' }],
  ['c5-fractions', { type: 'basic', front: '3/4 + 1/4 = ?', back: '4/4, c’est-à-dire 1.', reverse: false }],
  ['c5-fractions', { type: 'mcq', question: 'Quelle fraction est égale à 2/3 ?', answer: '4/6', distractors: ['3/4', '2/6', '6/4'] }],
  ['c5-fractions', { type: 'basic', front: 'Simplifie 12/18.', back: '2/3 (on divise le numérateur et le dénominateur par 6).', reverse: false }],
  ['c5-fractions', { type: 'mcq', question: 'Combien vaut 2/5 de 20 ?', answer: '8', distractors: ['4', '10', '40'] }],
  ['c5-relatifs', { type: 'mcq', question: '(−3) + (−5) = ?', answer: '−8', distractors: ['8', '−2', '2'] }],
  ['c5-relatifs', { type: 'basic', front: 'Quel est l’opposé de −7 ?', back: '7', reverse: false }],
  ['c5-relatifs', { type: 'ordering', title: 'Range ces nombres du plus petit au plus grand.', steps: ['−5', '−2', '0', '3', '8'] }],
  ['c5-relatifs', { type: 'cloze', text: 'Sur une droite graduée, les nombres {{négatifs}} sont placés à gauche de zéro.' }],
  ['c5-relatifs', { type: 'mcq', question: '(+4) + (−9) = ?', answer: '−5', distractors: ['5', '−13', '13'] }],
  ['c5-triangles', { type: 'cloze', text: 'La somme des angles d’un triangle vaut {{180}} degrés.' }],
  ['c5-triangles', { type: 'mcq', question: 'Un triangle a deux angles de 50° et 60°. Combien mesure le troisième ?', answer: '70°', distractors: ['80°', '90°', '60°'] }],
  ['c5-triangles', { type: 'classify', statement: 'Un triangle dont les trois côtés ont la même longueur', categories: TRIANGLES, answer: 'Équilatéral' }],
  ['c5-triangles', { type: 'classify', statement: 'Un triangle qui a un angle droit', categories: TRIANGLES, answer: 'Rectangle' }],
  ['c5-triangles', { type: 'classify', statement: 'Un triangle qui a deux côtés de même longueur', categories: TRIANGLES, answer: 'Isocèle' }],
  ['c5-triangles', { type: 'basic', front: 'Peut-on construire un triangle de côtés 2 cm, 3 cm et 6 cm ?', back: 'Non : 2 + 3 = 5, plus petit que 6. Le plus grand côté doit être plus court que la somme des deux autres (inégalité triangulaire).', reverse: false }],
  ['c5-priorites', { type: 'mcq', question: '2 + 3 × 4 = ?', answer: '14', distractors: ['20', '24', '9'] }],
  ['c5-priorites', { type: 'ordering', title: 'Dans quel ordre effectue-t-on les calculs ?', steps: ['Les calculs entre parenthèses', 'Les multiplications et les divisions', 'Les additions et les soustractions'] }],
  ['c5-priorites', { type: 'basic', front: '(2 + 3) × 4 = ?', back: '20 : on calcule d’abord la parenthèse.', reverse: false }],
  ['c5-priorites', { type: 'mcq', question: '20 − 12 ÷ 4 = ?', answer: '17', distractors: ['2', '8', '5'] }],

  ['c5-grammaire', { type: 'classify', statement: 'rapidement', categories: CLASSES, answer: 'Adverbe' }],
  ['c5-grammaire', { type: 'classify', statement: 'lumineux', categories: CLASSES, answer: 'Adjectif' }],
  ['c5-grammaire', { type: 'classify', statement: 'courir', categories: CLASSES, answer: 'Verbe' }],
  ['c5-grammaire', { type: 'cloze', text: 'Dans « Le chat mange la souris », « la souris » est le {{complément d’objet direct}}.' }],
  ['c5-grammaire', { type: 'mcq', question: 'Quelle est la fonction de « dans le jardin » dans « Les enfants jouent dans le jardin » ?', answer: 'Complément circonstanciel de lieu', distractors: ['Complément d’objet direct', 'Sujet', 'Attribut du sujet'] }],
  ['c5-conjugaison', { type: 'cloze', text: 'Passé simple de « chanter » : il {{chanta}}.' }],
  ['c5-conjugaison', { type: 'cloze', text: 'Passé simple de « finir » : nous {{finîmes}}.' }],
  ['c5-conjugaison', { type: 'mcq', question: 'Passé simple de « venir » : ils…', answer: 'vinrent', distractors: ['venèrent', 'venaient', 'viendrent'] }],
  ['c5-conjugaison', { type: 'basic', front: 'Dans un récit au passé, à quoi sert l’imparfait ?', back: 'À décrire le décor et les actions qui durent ou se répètent : l’arrière-plan.', reverse: false }],
  ['c5-conjugaison', { type: 'basic', front: 'Dans un récit au passé, à quoi sert le passé simple ?', back: 'Aux actions principales, brèves, qui font avancer l’histoire : le premier plan.', reverse: false }],
  ['c5-figures', { type: 'classify', statement: '« Cet homme est un lion. »', categories: FIGURES, answer: 'Métaphore' }],
  ['c5-figures', { type: 'classify', statement: '« Il est fort comme un lion. »', categories: FIGURES, answer: 'Comparaison' }],
  ['c5-figures', { type: 'classify', statement: '« Le vent hurlait dans la nuit. »', categories: FIGURES, answer: 'Personnification' }],
  ['c5-figures', { type: 'classify', statement: '« Je te l’ai dit mille fois ! »', categories: FIGURES, answer: 'Hyperbole' }],
  ['c5-figures', { type: 'basic', front: 'Quelle différence entre une comparaison et une métaphore ?', back: 'La comparaison utilise un outil (comme, tel, pareil à) ; la métaphore rapproche les deux éléments sans outil.', reverse: false }],

  ['c5-moyen-age', { type: 'basic', front: 'En quelle année Charlemagne est-il couronné empereur ?', back: 'En 800, à Rome.', reverse: false }],
  ['c5-moyen-age', { type: 'cloze', text: 'L’hégire, en {{622}}, marque le début du calendrier musulman.' }],
  ['c5-moyen-age', { type: 'ordering', title: 'Remets ces événements dans l’ordre chronologique.', steps: ['Couronnement de Charlemagne (800)', 'Hugues Capet devient roi (987)', 'Première croisade (1096)', 'Fin de la guerre de Cent Ans (1453)'] }],
  ['c5-moyen-age', { type: 'mcq', question: 'Comment s’appelle la cérémonie où un vassal jure fidélité à son seigneur ?', answer: 'L’hommage', distractors: ['Le sacre', 'La croisade', 'La dîme'] }],
  ['c5-moyen-age', { type: 'basic', front: 'Qu’est-ce que la dîme ?', back: 'Un impôt versé à l’Église, environ un dixième des récoltes.', reverse: false }],
  ['c5-moyen-age', { type: 'basic', front: 'Qu’est-ce qu’un fief ?', back: 'Une terre qu’un seigneur confie à son vassal en échange de sa fidélité et de son aide.', reverse: false }],
  ['c5-geographie', { type: 'cloze', text: 'Le {{développement durable}} répond aux besoins d’aujourd’hui sans empêcher les générations futures de répondre aux leurs.' }],
  ['c5-geographie', { type: 'mcq', question: 'Quel est le pays le plus peuplé du monde depuis 2023 ?', answer: 'L’Inde', distractors: ['La Chine', 'Les États-Unis', 'L’Indonésie'] }],
  ['c5-geographie', { type: 'basic', front: 'Qu’est-ce qu’une ressource renouvelable ? Donne un exemple.', back: 'Une ressource qui se reconstitue rapidement à l’échelle humaine, comme le soleil, le vent ou le bois si la forêt est gérée.', reverse: false }],
  ['c5-geographie', { type: 'mcq', question: 'Lequel de ces exemples est une ressource non renouvelable ?', answer: 'Le pétrole', distractors: ['Le vent', 'Le soleil', 'L’énergie des marées'] }],

  ['c5-respiration', { type: 'cloze', text: 'Dans les poumons, le sang se charge en {{dioxygène}} et rejette du {{dioxyde de carbone}}.' }],
  ['c5-respiration', { type: 'ordering', title: 'Remets dans l’ordre le trajet de l’air que l’on inspire.', steps: ['Fosses nasales', 'Trachée', 'Bronches', 'Bronchioles', 'Alvéoles pulmonaires'] }],
  ['c5-respiration', { type: 'mcq', question: 'Quel organe fait circuler le sang dans tout le corps ?', answer: 'Le cœur', distractors: ['Les poumons', 'Le foie', 'L’estomac'] }],
  ['c5-respiration', { type: 'basic', front: 'Pourquoi le rythme respiratoire augmente-t-il pendant un effort ?', back: 'Les muscles ont besoin de plus de dioxygène (et rejettent plus de dioxyde de carbone).', reverse: false }],

  ['c5-etats', { type: 'classify', statement: 'Le passage de l’état liquide à l’état solide', categories: CHANGES, answer: 'Solidification' }],
  ['c5-etats', { type: 'classify', statement: 'Le passage de l’état solide à l’état liquide', categories: CHANGES, answer: 'Fusion' }],
  ['c5-etats', { type: 'classify', statement: 'La buée sur un miroir après une douche', categories: CHANGES, answer: 'Liquéfaction' }],
  ['c5-etats', { type: 'cloze', text: 'Sous la pression atmosphérique normale, l’eau pure bout à {{100}} °C.' }],
  ['c5-etats', { type: 'mcq', question: 'Lors d’un changement d’état, la masse…', answer: 'se conserve', distractors: ['augmente', 'diminue', 'double'] }],

  ['c5-irreguliers', { type: 'cloze', text: 'go, {{went}}, gone' }],
  ['c5-irreguliers', { type: 'cloze', text: 'see, {{saw}}, seen' }],
  ['c5-irreguliers', { type: 'cloze', text: 'take, {{took}}, taken' }],
  ['c5-irreguliers', { type: 'cloze', text: 'buy, {{bought}}, bought' }],
  ['c5-irreguliers', { type: 'mcq', question: '« I ___ a cake yesterday. » (make)', answer: 'made', distractors: ['maked', 'make', 'did'] }],
];

export function college5Notes(now: number): Note[] {
  return CONTENT.map(([themeId, fields], i) => ({
    id: `c5-${String(i + 1).padStart(2, '0')}`,
    themeId,
    fields,
    tags: ['exemple'],
    source: 'Exemples Collège 5e',
    createdAt: now + i,
    updatedAt: 0,
  }));
}
