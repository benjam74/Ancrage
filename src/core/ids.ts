const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
const TIME_LEN = 10;
const RANDOM_LEN = 16;

let lastTime = -1;
let lastRandom: number[] = [];

function randomDigits(): number[] {
  const bytes = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % 32);
}

function increment(digits: number[]): number[] {
  const next = [...digits];
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i] < 31) {
      next[i]++;
      return next;
    }
    next[i] = 0;
  }
  throw new Error('id space exhausted for this millisecond');
}

/** ULID-style id: lexicographic order follows creation time, monotonic within a millisecond. */
export function newId(now: number = Date.now()): string {
  if (now === lastTime) {
    lastRandom = increment(lastRandom);
  } else {
    lastTime = now;
    lastRandom = randomDigits();
  }
  let time = '';
  let t = now;
  for (let i = 0; i < TIME_LEN; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  return time + lastRandom.map((d) => ALPHABET[d]).join('');
}
