// Resolves the day (D-236): manifest, then the localStorage cache, then the on-device check.
import { checkKey, daySetupFor } from '@vault-duel/ai';
import type { DailySetup } from '@vault-duel/ai';
import type { GameCtx } from '../content/load';
import type { KV } from '../persistence/storage';
import { loadCachedRating, ratingFromManifest, saveCachedRating } from './manifest';
import type { Rating, SeedsManifest } from './manifest';

export type SetupSource = 'manifest' | 'cache' | 'computed';

export interface CheckProgress {
  readonly k: number;
  readonly run: number;
  readonly runs: number;
}

export interface RatingDeps {
  readonly storage: KV;
  readonly manifest: () => Promise<SeedsManifest | null>;
  /** Runs `prepareDay` off the main thread (difficulty.worker.ts). */
  readonly compute: (date: string, onProgress: (p: CheckProgress) => void) => Promise<Rating>;
  readonly onProgress?: (p: CheckProgress) => void;
}

export async function resolveSetup(ctx: GameCtx, date: string, deps: RatingDeps): Promise<{ setup: DailySetup; source: SetupSource }> {
  const key = checkKey(ctx);
  const fromManifest = ratingFromManifest(await deps.manifest(), key, date);
  if (fromManifest !== null) return { setup: daySetupFor(ctx, date, fromManifest), source: 'manifest' };
  const cached = loadCachedRating(deps.storage, key, date);
  if (cached !== null) return { setup: daySetupFor(ctx, date, cached), source: 'cache' };
  const rating = await deps.compute(date, deps.onProgress ?? (() => undefined));
  saveCachedRating(deps.storage, key, date, rating);
  return { setup: daySetupFor(ctx, date, rating), source: 'computed' };
}
