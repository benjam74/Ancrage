import { FIELD_SPECS, uniqueEntries } from './draft';
import type { NoteFields, NoteType } from './model';
import { validateFields } from './validate';
import { capExplanation } from './explain';

export const MAX_SOURCE_CHARS = 30_000;
export const MAX_COUNT = 15;

const ALL_TYPES: NoteType[] = ['basic', 'cloze', 'ordering', 'classify', 'mcq', 'scenario'];

export interface GenerationRequest {
  source: string;
  themeName: string;
  /** The domain the theme belongs to, e.g. « Mathématiques ». */
  domainName?: string;
  /** Who the cards are for (the profile's « Pour qui ? »), e.g. « élève de 5e ». */
  audience?: string;
  types: NoteType[];
  count: number;
  /** An extra instruction, e.g. to reword a card the learner keeps missing. */
  instruction?: string;
}

export interface Proposal {
  fields: NoteFields;
  /** Why the answer is right, from the source text. */
  explanation: string;
  /** Why this card, in the model's words (which passage it comes from). */
  rationale: string;
}

export function checkRequest(r: GenerationRequest): string | null {
  if (!r.source.trim()) return 'Colle d’abord un texte : notes de formation, extrait de livre, transcription…';
  if (r.source.length > MAX_SOURCE_CHARS) {
    return `Le texte dépasse 30 000 caractères (${r.source.length.toLocaleString('fr-FR')}). Découpe-le et génère partie par partie.`;
  }
  if (r.types.length === 0) return 'Choisis au moins un type de carte.';
  if (!Number.isInteger(r.count) || r.count < 1 || r.count > MAX_COUNT) return 'Le nombre de cartes doit être entre 1 et 15.';
  return null;
}

const TYPE_GUIDE: Record<Exclude<NoteType, 'image'>, string> = {
  basic: 'basic — question au recto (front), réponse courte au verso (back). Pour une définition ou un fait isolé.',
  cloze: 'cloze — une phrase du texte (text) où les termes clés sont entourés de {{ }}, un à trois trous. Pour retenir un vocabulaire ou une formule.',
  ordering: 'ordering — une consigne (title) et des étapes (steps) dans le bon ordre. Seulement si le texte décrit une séquence.',
  classify: 'classify — un énoncé (statement), les catégories d’une typologie du texte (categories), la bonne catégorie (answer). Seulement si le texte présente une typologie.',
  mcq: 'mcq — une question, la bonne réponse (answer), deux ou trois mauvaises réponses plausibles tirées du même domaine (distractors).',
  scenario: 'scenario — une phrase de client (situation), la réponse modèle du coach (model), les points clés pour s’auto-évaluer (keyPoints). Seulement si le texte parle de pratique en séance.',
};

export function buildPrompt(r: GenerationRequest): { system: string; user: string } {
  const system = [
    `Tu crées des cartes de répétition espacée en français pour ${r.audience?.trim() || 'une personne qui apprend seule'}, avec des mots et des exemples à sa portée.`,
    'Chaque carte teste une seule idée, formulée clairement, et doit pouvoir se réviser seule, sans le texte sous les yeux.',
    'Tu t’appuies uniquement sur le texte fourni : n’ajoute pas de connaissances qui n’y figurent pas, et n’invente ni chiffres ni citations.',
    'Pour chaque carte, remplis seulement les champs de son type et laisse les autres vides (chaîne vide, liste vide, false). Dans rationale, indique en une phrase le passage du texte dont la carte vient.',
    'Dans explanation, écris en une ou deux phrases pourquoi la réponse est la bonne (le principe ou la règle du texte qui la justifie), pour aider à comprendre après une erreur.',
  ].join(' ');
  const user = [
    r.domainName ? `Domaine : ${r.domainName}` : '',
    `Thème : ${r.themeName}`,
    `Crée au plus ${r.count} cartes, uniquement de ces types :`,
    ...r.types.flatMap((t) => (t === 'image' ? [] : [`- ${TYPE_GUIDE[t]}`])),
    'Choisis pour chaque idée le type qui la teste le mieux. Si le texte ne justifie pas autant de cartes, crée-en moins.',
    r.instruction?.trim() ? `Consigne : ${r.instruction.trim()}` : '',
    '',
    '<source>',
    // A pasted closing tag must not end the source early.
    r.source.trim().replace(/<\/?source>/gi, ''),
    '</source>',
  ].join('\n');
  return { system, user };
}

const str = { type: 'string' } as const;
const strList = { type: 'array', items: { type: 'string' } } as const;
const NOTE_PROPERTIES = {
  type: { type: 'string', enum: ALL_TYPES },
  front: str,
  back: str,
  reverse: { type: 'boolean' },
  text: str,
  title: str,
  steps: strList,
  statement: str,
  categories: strList,
  answer: str,
  question: str,
  distractors: strList,
  situation: str,
  model: str,
  keyPoints: strList,
  rationale: str,
  explanation: str,
};

/** Flat schema: every field is present, unused ones empty. Validation happens on our side anyway. */
export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    notes: {
      type: 'array',
      items: { type: 'object', properties: NOTE_PROPERTIES, required: Object.keys(NOTE_PROPERTIES), additionalProperties: false },
    },
  },
  required: ['notes'],
  additionalProperties: false,
};

const asString = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const asList = (v: unknown) => uniqueEntries(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function toProposals(raw: unknown, allowed: NoteType[]): { proposals: Proposal[]; rejected: number } {
  const notes = raw && typeof raw === 'object' && Array.isArray((raw as { notes?: unknown }).notes) ? (raw as { notes: unknown[] }).notes : null;
  if (!notes) return { proposals: [], rejected: 0 };
  const proposals: Proposal[] = [];
  let rejected = 0;
  for (const item of notes) {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    const type = o?.type as NoteType;
    if (!o || !ALL_TYPES.includes(type) || !allowed.includes(type)) {
      rejected++;
      continue;
    }
    const values: Record<string, unknown> = { type };
    for (const spec of FIELD_SPECS[type]) {
      const v = o[spec.key];
      values[spec.key] = spec.kind === 'check' ? v === true : spec.kind === 'lines' || spec.kind === 'list' ? asList(v) : asString(v);
    }
    const fields = values as unknown as NoteFields;
    if (Object.keys(validateFields(fields)).length) {
      rejected++;
      continue;
    }
    proposals.push({ fields, rationale: asString(o.rationale), explanation: capExplanation(asString(o.explanation)) });
  }
  return { proposals, rejected };
}

/** A note as plain text, the source for rewording it. */
export function describeNote(f: NoteFields): string {
  switch (f.type) {
    case 'basic': return `Question : ${f.front}\nRéponse : ${f.back}`;
    case 'cloze': return `Phrase à trous : ${f.text.replace(/\{\{(.*?)\}\}/g, '[$1]')}`;
    case 'ordering': return `${f.title}\nÉtapes dans l’ordre :\n${f.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    case 'classify': return `Énoncé : ${f.statement}\nCatégories : ${f.categories.join(', ')}\nBonne catégorie : ${f.answer}`;
    case 'mcq': return `Question : ${f.question}\nBonne réponse : ${f.answer}\nMauvaises réponses : ${f.distractors.join(' ; ')}`;
    case 'scenario': return `Le client dit : ${f.situation}\nRéponse modèle : ${f.model}\nPoints clés : ${f.keyPoints.join(' ; ')}`;
    case 'image': return `Image : ${f.title}\nZones : ${f.masks.map((m) => m.label).filter(Boolean).join(' ; ')}`;
  }
}

export const REWORD_INSTRUCTION =
  'Cette carte est souvent oubliée. Propose 1 à 3 cartes qui testent la même connaissance plus facilement : scinde-la si elle contient plusieurs idées, rends la question plus précise, ajoute un exemple concret si cela aide. Ne change pas le contenu à retenir.';
