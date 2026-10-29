/** AI feedback on a written answer to a coaching scenario. */

export const MAX_ANSWER_CHARS = 2000;

export type Verdict = 'reussi' | 'partiel' | 'a_revoir';
const VERDICTS: Verdict[] = ['reussi', 'partiel', 'a_revoir'];

export interface EvalInput {
  situation: string;
  model: string;
  keyPoints: string[];
  answer: string;
  /** Who is learning (the profile's « Pour qui ? »). */
  audience?: string;
}

export interface Evaluation {
  verdict: Verdict;
  points: { point: string; covered: boolean; comment: string }[];
  feedback: string;
  improved: string;
}

export function checkEvalInput(i: EvalInput): string | null {
  if (!i.answer.trim()) return 'Écris d’abord ta réponse pour recevoir un retour.';
  if (i.answer.length > MAX_ANSWER_CHARS) return 'Réponse trop longue pour être évaluée (2 000 caractères au plus).';
  return null;
}

const clean = (s: string) => s.trim().replace(/<\/?(situation|modele|points|reponse)>/gi, '');

export function buildEvalPrompt(i: EvalInput): { system: string; user: string } {
  const system = [
    `Tu es superviseur en coaching et tu fais un retour bref et bienveillant à ${i.audience?.trim() || 'une personne qui se forme au coaching'}, qui s’entraîne sur une mise en situation.`,
    'Tu compares sa réponse à la réponse modèle et aux points clés : ce qui compte est l’intention et la technique, pas les mots exacts.',
    'Verdict : reussi si l’essentiel des points clés est présent, partiel si une partie l’est, a_revoir sinon.',
    'Pour chaque point clé, dans l’ordre donné, dis s’il est couvert et pourquoi en une phrase. Dans feedback, deux phrases au plus, en tutoyant. Dans improved, propose une formulation améliorée qui garde le style de la personne.',
  ].join(' ');
  const user = [
    '<situation>', clean(i.situation), '</situation>',
    '<modele>', clean(i.model), '</modele>',
    '<points>', ...(i.keyPoints.length ? i.keyPoints.map((p, n) => `${n + 1}. ${clean(p)}`) : ['(aucun : juge sur la réponse modèle)']), '</points>',
    '<reponse>', clean(i.answer), '</reponse>',
  ].join('\n');
  return { system, user };
}

export const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: VERDICTS },
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: { covered: { type: 'boolean' }, comment: { type: 'string' } },
        required: ['covered', 'comment'],
        additionalProperties: false,
      },
    },
    feedback: { type: 'string' },
    improved: { type: 'string' },
  },
  required: ['verdict', 'points', 'feedback', 'improved'],
  additionalProperties: false,
};

/** Checks the model's JSON; one comment per key point, in order, or nothing. */
export function toEvaluation(raw: unknown, keyPoints: string[]): Evaluation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!VERDICTS.includes(o.verdict as Verdict) || typeof o.feedback !== 'string' || typeof o.improved !== 'string') return null;
  if (!Array.isArray(o.points) || o.points.length !== keyPoints.length) return null;
  const points: Evaluation['points'] = [];
  for (const [n, p] of (o.points as unknown[]).entries()) {
    const q = p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
    if (!q || typeof q.covered !== 'boolean' || typeof q.comment !== 'string') return null;
    points.push({ point: keyPoints[n], covered: q.covered, comment: q.comment.trim() });
  }
  return { verdict: o.verdict as Verdict, points, feedback: o.feedback.trim(), improved: o.improved.trim() };
}
