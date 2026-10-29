import { clozeGaps } from './cards';
import { checkChoice, normalizeAnswer } from './check';
import type { Mask, NoteFields } from './model';

/** Smallest zone side, as a fraction of the image. */
export const MIN_ZONE = 0.02;

const REQUIRED = 'Ce champ est obligatoire.';

const distinctCount = (items: string[]) => new Set(items.map(normalizeAnswer).filter(Boolean)).size;

/** One French message per invalid field, keyed by field name. Empty when the note is valid. */
export function validateFields(fields: NoteFields): Record<string, string> {
  const errors: Record<string, string> = {};
  const required = (key: string, value: string) => {
    if (!value.trim()) errors[key] = REQUIRED;
  };

  switch (fields.type) {
    case 'basic':
      required('front', fields.front);
      required('back', fields.back);
      break;
    case 'cloze': {
      const raw = [...fields.text.matchAll(/\{\{([\s\S]*?)\}\}/g)].map((m) => m[1]);
      if (raw.some((g) => g.includes('\n'))) errors.text = 'Un trou ne peut pas contenir de retour à la ligne.';
      else if (raw.some((g) => g.includes('{{'))) errors.text = 'Un trou ne peut pas contenir un autre trou.';
      else if (clozeGaps(fields.text).length === 0) errors.text = 'Ajoute au moins un trou avec {{ }}, par exemple {{Reality}}.';
      break;
    }
    case 'ordering':
      required('title', fields.title);
      if (fields.steps.length < 2) errors.steps = 'Il faut au moins 2 étapes différentes.';
      else if (distinctCount(fields.steps) !== fields.steps.length) errors.steps = 'Chaque étape doit être différente.';
      break;
    case 'classify':
      required('statement', fields.statement);
      if (distinctCount(fields.categories) < 2) errors.categories = 'Il faut au moins 2 catégories différentes.';
      else if (distinctCount(fields.categories) !== fields.categories.length) errors.categories = 'Chaque catégorie doit être différente.';
      if (!fields.answer.trim()) errors.answer = REQUIRED;
      else if (!fields.categories.some((c) => checkChoice(c, fields.answer))) errors.answer = 'La bonne catégorie doit figurer dans la liste.';
      break;
    case 'mcq':
      required('question', fields.question);
      required('answer', fields.answer);
      if (!fields.distractors.some((d) => normalizeAnswer(d) && normalizeAnswer(d) !== normalizeAnswer(fields.answer))) {
        errors.distractors = 'Ajoute au moins une mauvaise réponse différente de la bonne.';
      }
      break;
    case 'scenario':
      required('situation', fields.situation);
      required('model', fields.model);
      break;
    case 'image': {
      if (!/^data:image\//.test(fields.image)) errors.image = 'Choisis une image.';
      const inside = (m: Mask) =>
        [m.x, m.y, m.w, m.h].every(Number.isFinite) && m.x >= 0 && m.y >= 0 && m.w >= MIN_ZONE && m.h >= MIN_ZONE && m.x + m.w <= 1.0001 && m.y + m.h <= 1.0001;
      const labels = fields.masks.map((m) => normalizeAnswer(m.label)).filter(Boolean);
      if (fields.masks.length === 0) errors.masks = 'Trace au moins une zone à masquer sur l’image.';
      else if (!fields.masks.every(inside)) errors.masks = 'Une zone est trop petite ou dépasse de l’image.';
      else if (new Set(fields.masks.map((m) => m.id)).size !== fields.masks.length) errors.masks = 'Deux zones ont le même identifiant.';
      else if (new Set(labels).size !== labels.length) errors.masks = 'Deux zones ont la même réponse.';
      break;
    }
  }
  return errors;
}
