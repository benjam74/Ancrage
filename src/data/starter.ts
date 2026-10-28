import type { Note, NoteFields, Theme } from '../core/model';

export const STARTER_THEMES: Theme[] = [
  { id: 'ex-fond', name: 'Fondamentaux du coaching', order: 0 },
  { id: 'ex-grow', name: 'Modèle GROW', order: 1 },
  { id: 'ex-meta', name: 'Méta-modèle', order: 2 },
  { id: 'ex-dilts', name: 'Niveaux logiques de Dilts', order: 3 },
  { id: 'ex-quest', name: 'Questions puissantes', order: 4 },
];

const META = ['Généralisation', 'Distorsion', 'Omission'];
const DILTS = ['Environnement', 'Comportements', 'Capacités', 'Croyances et valeurs', 'Identité', 'Mission'];

const CONTENT: [themeId: string, fields: NoteFields][] = [
  ['ex-fond', { type: 'basic', front: "Qu'est-ce qui distingue le coaching de la thérapie ?", back: "Le coaching vise les objectifs présents et futurs du client ; la thérapie traite la souffrance et l'histoire passée.", reverse: false }],
  ['ex-fond', { type: 'ordering', title: "Remets dans l'ordre le déroulé d'une séance.", steps: ['Établir le contrat de séance', 'Explorer la situation', 'Faire émerger les options', "Définir le plan d'action", "Valider l'engagement"] }],
  ['ex-fond', { type: 'basic', front: "Présupposé de la PNL : « La carte n'est pas… »", back: '… le territoire.', reverse: false }],
  ['ex-fond', { type: 'mcq', question: 'Quelle posture le coach adopte-t-il face aux solutions ?', answer: 'Il fait émerger les solutions du client', distractors: ['Il propose ses propres solutions', 'Il valide la solution la plus rapide', "Il oriente vers la solution qu'il juge la meilleure"] }],
  ['ex-fond', { type: 'basic', front: 'Que signifie « calibrer » en PNL ?', back: "Observer finement les signaux non verbaux de l'autre pour repérer ses changements d'état.", reverse: false }],
  ['ex-fond', { type: 'cloze', text: "Le {{contrat}} de coaching fixe l'objectif, la durée et le cadre de l'accompagnement." }],
  ['ex-grow', { type: 'cloze', text: 'GROW : {{Goal}}, {{Reality}}, {{Options}}, {{Will}}.' }],
  ['ex-grow', { type: 'mcq', question: "À quelle étape de GROW demande-t-on « Sur une échelle de 1 à 10, quel est ton niveau d'engagement ? »", answer: 'Will', distractors: ['Goal', 'Reality', 'Options'] }],
  ['ex-grow', { type: 'scenario', situation: 'Je veux juste que ça aille mieux au travail.', model: '« Concrètement, à quoi verras-tu que ça va mieux ? »', keyPoints: ['Objectif flou : on est encore à l’étape Goal', 'Faire préciser un critère observable', 'Question ouverte, orientée vers le futur'] }],
  ['ex-grow', { type: 'basic', front: 'Pourquoi explorer la Réalité avant les Options ?', back: 'Pour que les options répondent à la situation réelle du client, et non à une hypothèse du coach.', reverse: false }],
  ['ex-meta', { type: 'cloze', text: "Les trois processus du méta-modèle sont la {{généralisation}}, la {{distorsion}} et l'{{omission}}." }],
  ['ex-meta', { type: 'classify', statement: "Il ne m'écoute jamais.", categories: META, answer: 'Généralisation' }],
  ['ex-meta', { type: 'classify', statement: "Elle me regarde de travers, elle doit m'en vouloir.", categories: META, answer: 'Distorsion' }],
  ['ex-meta', { type: 'classify', statement: 'Je suis contrarié.', categories: META, answer: 'Omission' }],
  ['ex-meta', { type: 'classify', statement: 'Personne ne me soutient jamais.', categories: META, answer: 'Généralisation' }],
  ['ex-meta', { type: 'scenario', situation: 'Je dois absolument réussir ce projet.', model: '« Qu’est-ce qui se passerait si tu ne le réussissais pas ? »', keyPoints: ['Repérer l’opérateur modal de nécessité : « je dois »', 'Questionner la conséquence imaginée', 'Rester neutre, sans valider ni contredire la croyance'] }],
  ['ex-meta', { type: 'scenario', situation: 'Je ne peux pas dire non à mon chef.', model: '« Qu’est-ce qui t’en empêche ? »', keyPoints: ['Repérer l’opérateur modal de possibilité : « je ne peux pas »', 'Chercher ce qui empêche, concrètement'] }],
  ['ex-dilts', { type: 'ordering', title: 'Remets les niveaux logiques de Dilts dans l’ordre, du plus concret au plus abstrait.', steps: DILTS }],
  ['ex-dilts', { type: 'mcq', question: 'Quel niveau logique répond à la question « Pourquoi ? »', answer: 'Croyances et valeurs', distractors: ['Environnement', 'Comportements', 'Capacités'] }],
  ['ex-dilts', { type: 'mcq', question: '« Je suis nul » se situe à quel niveau logique ?', answer: 'Identité', distractors: ['Capacités', 'Comportements', 'Croyances et valeurs'] }],
  ['ex-quest', { type: 'basic', front: 'Une question pour faire émerger des options', back: '« Si tu avais une totale liberté, que ferais-tu ? »', reverse: false }],
  ['ex-quest', { type: 'basic', front: "Une question pour vérifier l'engagement", back: '« Qu’est-ce qui pourrait t’empêcher de le faire, et que feras-tu alors ? »', reverse: false }],
  ['ex-quest', { type: 'scenario', situation: "J'ai déjà tout essayé.", model: '« Qu’as-tu essayé exactement, et qu’est-ce que ça t’a appris ? »', keyPoints: ['Généralisation : « tout »', 'Faire lister concrètement', "Transformer l'échec en apprentissage"] }],
];

/** Example notes, tagged `exemple`, created in order so the first lesson starts with the basics. */
export function starterNotes(now: number): Note[] {
  return CONTENT.map(([themeId, fields], i) => ({
    id: `ex-${String(i + 1).padStart(2, '0')}`,
    themeId,
    fields,
    tags: ['exemple'],
    source: 'Deck de démarrage Ancrage',
    createdAt: now + i,
    updatedAt: now + i,
  }));
}
