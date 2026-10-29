import type { NoteFields } from './model';

const GAP = /\{\{(.*?)\}\}/g;

export function clozeGaps(text: string): string[] {
  return [...text.matchAll(GAP)].map((m) => m[1].trim()).filter((g) => g.length > 0);
}

function gapKey(gap: string): string {
  return gap.toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Stable identifiers of the cards a note produces. Cloze variants are keyed by gap text,
 * so inserting or reordering gaps keeps each existing card attached to its own history.
 */
export function cardVariants(fields: NoteFields): string[] {
  switch (fields.type) {
    case 'basic':
      return fields.reverse ? ['front', 'back'] : ['front'];
    case 'cloze': {
      const seen = new Map<string, number>();
      return clozeGaps(fields.text).map((gap) => {
        const key = gapKey(gap);
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        return n === 1 ? key : `${key}#${n}`;
      });
    }
    case 'image':
      return fields.masks.map((m) => m.id);
    default:
      return ['main'];
  }
}
