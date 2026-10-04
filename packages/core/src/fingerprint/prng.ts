/**
 * FNV-1a 32-bit hash algorithm to convert any seed string into an unsigned 32-bit integer.
 */
export function hashStringToInt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Fast, 32-bit pseudo-random number generator (Mulberry32).
 * Produces uniform random 32-bit floating point numbers in [0, 1).
 */
export function mulberry32(initialSeed: number): () => number {
  let a = initialSeed | 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRng {
  private readonly nextRaw: () => number;
  public readonly seedInt: number;

  constructor(seed: string | number) {
    this.seedInt = typeof seed === 'number' ? seed >>> 0 : hashStringToInt(seed);
    this.nextRaw = mulberry32(this.seedInt);
  }

  /**
   * Returns a float in [0, 1).
   */
  next(): number {
    return this.nextRaw();
  }

  /**
   * Returns a float in [min, max).
   */
  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns an integer in [min, max] (inclusive).
   */
  nextInt(min: number, max: number): number {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return Math.floor(low + this.next() * (high - low + 1));
  }

  /**
   * Randomly selects one element from a non-empty array deterministically.
   */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    const index = Math.floor(this.next() * items.length);
    return items[index]!;
  }

  /**
   * Returns a new array with elements shuffled using Fisher-Yates shuffle.
   */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const temp = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = temp;
    }
    return copy;
  }

  /**
   * Returns true with the given probability in [0, 1].
   */
  boolean(probability = 0.5): boolean {
    return this.next() < probability;
  }
}
