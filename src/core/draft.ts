import { normalizeAnswer } from './check';
import type { NoteFields, NoteType } from './model';

export type Draft = Record<string, string | boolean>;

export interface FieldSpec {
  key: string;
  label: string;
  /** `lines`: one entry per line · `list`: comma separated. */
  kind: 'text' | 'longtext' | 'lines' | 'list' | 'check';
  hint?: string;
}

export const FIELD_SPECS: Record<NoteType, FieldSpec[]> = {
  basic: [
    { key: 'front', label: 'Recto', kind: 'longtext' },
    { key: 'back', label: 'Verso', kind: 'longtext' },
    { key: 'reverse', label: 'Créer aussi la carte inverse', kind: 'check' },
  ],
  cloze: [{ key: 'text', label: 'Texte', kind: 'longtext', hint: 'Entoure chaque trou avec {{ }}. Chaque trou devient une carte.' }],
  ordering: [
    { key: 'title', label: 'Consigne', kind: 'text' },
    { key: 'steps', label: 'Étapes, dans le bon ordre', kind: 'lines', hint: 'Une étape par ligne. L’app les mélange.' },
  ],
  classify: [
    { key: 'statement', label: 'Énoncé', kind: 'text' },
    { key: 'categories', label: 'Catégories', kind: 'list', hint: 'Séparées par des virgules.' },
    { key: 'answer', label: 'Bonne catégorie', kind: 'text' },
  ],
  mcq: [
    { key: 'question', label: 'Question', kind: 'longtext' },
    { key: 'answer', label: 'Bonne réponse', kind: 'text' },
    { key: 'distractors', label: 'Mauvaises réponses', kind: 'lines', hint: 'Une par ligne.' },
  ],
  scenario: [
    { key: 'situation', label: 'Ce que dit le client', kind: 'longtext' },
    { key: 'model', label: 'Réponse modèle', kind: 'longtext' },
    { key: 'keyPoints', label: 'Points clés', kind: 'lines', hint: 'Un par ligne. Ils servent de grille pour t’auto-évaluer.' },
  ],
};

export function emptyDraft(type: NoteType): Draft {
  return Object.fromEntries(FIELD_SPECS[type].map((f) => [f.key, f.kind === 'check' ? false : '']));
}

/** Trims, drops empty entries and case/accent duplicates (first occurrence kept). */
export function uniqueEntries(items: string[]): string[] {
  const seen = new Set<string>();
  return items
    .map((s) => s.trim())
    .filter((s) => {
      const key = normalizeAnswer(s);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function draftToFields(type: NoteType, draft: Draft): NoteFields {
  const values: Record<string, unknown> = { type };
  for (const spec of FIELD_SPECS[type]) {
    const raw = draft[spec.key];
    if (spec.kind === 'check') values[spec.key] = raw === true;
    else {
      const text = typeof raw === 'string' ? raw : '';
      if (spec.kind === 'lines') values[spec.key] = uniqueEntries(text.split('\n'));
      else if (spec.kind === 'list') values[spec.key] = uniqueEntries(text.split(','));
      else values[spec.key] = text.trim();
    }
  }
  return values as NoteFields;
}

export function fieldsToDraft(fields: NoteFields): Draft {
  const record = fields as unknown as Record<string, unknown>;
  return Object.fromEntries(
    FIELD_SPECS[fields.type].map((spec) => {
      const value = record[spec.key];
      if (spec.kind === 'lines') return [spec.key, (value as string[]).join('\n')];
      if (spec.kind === 'list') return [spec.key, (value as string[]).join(', ')];
      return [spec.key, value as string | boolean];
    }),
  );
}
