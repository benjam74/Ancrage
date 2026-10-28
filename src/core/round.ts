export const ROUND_SIZE = 10;

export interface Round {
  pending: string[];
  retried: string[];
  done: number;
  total: number;
  correct: number;
  answered: number;
}

export function startRound(cardIds: string[]): Round {
  const pending = cardIds.slice(0, ROUND_SIZE);
  return { pending, retried: [], done: 0, total: pending.length, correct: 0, answered: 0 };
}

export function currentCard(r: Round): string | undefined {
  return r.pending[0];
}

export function isRetry(r: Round, cardId: string): boolean {
  return r.retried.includes(cardId);
}

/** A card missed on its first pass comes back once at the end of the round. */
export function advance(r: Round, correct: boolean): Round {
  const [head, ...rest] = r.pending;
  if (head === undefined) return r;
  const comesBack = !correct && !r.retried.includes(head);
  return {
    pending: comesBack ? [...rest, head] : rest,
    retried: comesBack ? [...r.retried, head] : r.retried,
    done: r.done + 1,
    total: r.total + (comesBack ? 1 : 0),
    correct: r.correct + (correct ? 1 : 0),
    answered: r.answered + 1,
  };
}
