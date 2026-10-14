// ARCHITECTURE.md §12.1. The only source of randomness in the engine.
import type { Rng } from './types/state';

export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Mutable generator used inside setup and Tx; state is read back into GameState.rng. */
export class Sfc32 {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  private constructor(a: number, b: number, c: number, d: number) {
    this.a = a | 0;
    this.b = b | 0;
    this.c = c | 0;
    this.d = d | 0;
  }

  static from(key: string): Sfc32 {
    const [a, b, c, d] = cyrb128(key);
    const g = new Sfc32(a, b, c, d);
    for (let i = 0; i < 15; i++) g.next(); // warm-up
    return g;
  }

  /** Resume exactly from a state() snapshot (no warm-up). */
  static restore(state: Rng): Sfc32 {
    return new Sfc32(state[0], state[1], state[2], state[3]);
  }

  /** uint32 */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform integer in [0, n). Exact: product < 2^53. */
  int(n: number): number {
    return Math.floor((this.next() * n) / 4294967296);
  }

  /** In-place Fisher-Yates. */
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const x = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = x;
    }
  }

  state(): Rng {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }
}
