/** Short explanations of why an answer is right, written by Claude for cards that have none. */

export const MAX_EXPLANATION = 400;
/** Cards per request when completing a whole theme. */
export const EXPLAIN_BATCH = 15;

export interface ExplainItem {
  id: string;
  /** The card as plain text (`describeNote`). */
  text: string;
}

const clean = (s: string) => s.trim().replace(/<\/?carte[^>]*>/gi, '');

export function buildExplainPrompt(items: ExplainItem[], audience?: string): { system: string; user: string } {
  const system = [
    `Tu expliques des cartes de révision à ${audience?.trim() || 'une personne qui apprend seule'}, avec des mots à sa portée.`,
    'Pour chaque carte, écris en une ou deux phrases pourquoi la réponse est la bonne : le principe, la règle ou le mécanisme qui la justifie, pas une reformulation de la réponse.',
    'N’invente ni chiffres ni citations. Si tu n’es pas sûr, explique seulement ce qui est certain.',
    'Réponds pour chaque carte avec son identifiant (id).',
  ].join(' ');
  const user = items.map((i) => `<carte id="${i.id}">\n${clean(i.text)}\n</carte>`).join('\n\n');
  return { system, user };
}

export const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, explanation: { type: 'string' } },
        required: ['id', 'explanation'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

/** Cuts on a sentence end when it can, so a capped explanation still reads well. */
export function capExplanation(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= MAX_EXPLANATION) return t;
  const cut = t.slice(0, MAX_EXPLANATION);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' ; '));
  return end > MAX_EXPLANATION / 2 ? cut.slice(0, end + 1) : `${cut.slice(0, MAX_EXPLANATION - 1).trimEnd()}…`;
}

/** Explanations by card id; unknown ids and empty texts are dropped. */
export function toExplanations(raw: unknown, ids: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : [];
  const known = new Set(ids);
  for (const item of list) {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    if (!o || typeof o.id !== 'string' || !known.has(o.id) || typeof o.explanation !== 'string') continue;
    const text = capExplanation(o.explanation);
    if (text) out.set(o.id, text);
  }
  return out;
}
