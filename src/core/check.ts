const TYPO_MIN_LENGTH = 6;

export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function checkTyped(input: string, expected: string): boolean {
  const given = normalizeAnswer(input);
  const target = normalizeAnswer(expected);
  if (!given) return false;
  if (given === target) return true;
  return target.length >= TYPO_MIN_LENGTH && levenshtein(given, target) <= 1;
}

/** `given` lists the original step indexes in the order the learner placed them. */
export function checkOrder(given: number[], length: number): boolean {
  return given.length === length && given.every((step, position) => step === position);
}

export function checkChoice(given: string, expected: string): boolean {
  return normalizeAnswer(given) === normalizeAnswer(expected);
}
