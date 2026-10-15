// Decision noise for the difficulty check's reference bot (D-094). At each decision the bot scored, with probability
// `epsilon` (globals BOT_NOISE_EPSILON) it takes the second-best option instead of the best. The generator is the engine's
// own, keyed by `seedString#k/noise/runIndex`, so a run is reproducible from its job alone. The Collector never has noise.
import { Sfc32 } from '@vault-duel/engine';

export interface Noise {
  /** One draw: true with probability epsilon, meaning "take the second-best option here". */
  swerve(): boolean;
  /** `swerve()` applied to a score list: the index of the best (first of equals), or of the second best on a swerve. */
  pick(scores: readonly number[]): number;
}

/** D-094: `seedString + "#" + k + "/noise/" + runIndex`. */
export function noiseKey(seedString: string, k: number, runIndex: number): string {
  return `${seedString}#${k}/noise/${runIndex}`;
}

/** The indexes of the best and second-best score, the first of equals winning each; -1 when there is no such option. */
export function topTwo(scores: readonly number[]): { best: number; second: number } {
  let best = -1;
  let second = -1;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i] as number;
    if (best < 0 || s > (scores[best] as number)) {
      second = best;
      best = i;
    } else if (second < 0 || s > (scores[second] as number)) second = i;
  }
  return { best, second };
}

export function createNoise(key: string, epsilon: number): Noise {
  const rng = Sfc32.from(key);
  const swerve = (): boolean => rng.next() / 4294967296 < epsilon;
  return {
    swerve,
    pick(scores) {
      // The draw is taken even when there is nothing to choose between, so the stream does not depend on the option count.
      const swerved = swerve();
      const { best, second } = topTwo(scores);
      return swerved && second >= 0 ? second : Math.max(best, 0);
    },
  };
}
