// D-236: the shipped seeds manifest and the per-device rating cache. A rating is used only when all three hashes
// of `checkKey(ctx)` match; anything else is ignored and the on-device check runs.
import type { CheckKey, SeedRating } from '@vault-duel/ai';
import { getJson } from '../persistence/storage';
import type { KV } from '../persistence/storage';

export type Rating = Pick<SeedRating, 'k' | 'winRate' | 'stars' | 'par' | 'check'>;

export interface SeedsManifest extends CheckKey {
  readonly days: Readonly<Record<string, Rating>>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseRating(v: unknown): Rating | null {
  if (!isObject(v)) return null;
  const { k, winRate, stars, par, check } = v;
  if (typeof k !== 'number' || !Number.isInteger(k) || k < 0) return null;
  if (typeof winRate !== 'number' || typeof par !== 'number') return null;
  if (stars !== 1 && stars !== 2 && stars !== 3) return null;
  if (check !== 'accepted' && check !== 'fallback') return null;
  return { k, winRate, stars, par, check };
}

/** Null for anything that is not a well-formed manifest (a stale or broken file is never an error). */
export function parseManifest(v: unknown): SeedsManifest | null {
  if (!isObject(v) || !isObject(v['days'])) return null;
  const { contentHash, globalsHash, expertHash } = v;
  if (typeof contentHash !== 'string' || typeof globalsHash !== 'string' || typeof expertHash !== 'string') return null;
  const days: Record<string, Rating> = {};
  for (const [date, raw] of Object.entries(v['days'])) {
    const r = parseRating(raw);
    if (r === null) return null;
    days[date] = r;
  }
  return { contentHash, globalsHash, expertHash, days };
}

export const keyMatches = (a: CheckKey, b: CheckKey): boolean =>
  a.contentHash === b.contentHash && a.globalsHash === b.globalsHash && a.expertHash === b.expertHash;

/** The manifest's rating for `date`, only if the manifest was made for this exact build (all three hashes). */
export function ratingFromManifest(manifest: SeedsManifest | null, key: CheckKey, date: string): Rating | null {
  if (manifest === null || !keyMatches(manifest, key)) return null;
  return manifest.days[date] ?? null;
}

export const cacheKey = (key: CheckKey, date: string): string =>
  `vd:rating:${date}:${key.contentHash}:${key.globalsHash}:${key.expertHash}`;

export function loadCachedRating(kv: KV, key: CheckKey, date: string): Rating | null {
  return parseRating(getJson(kv, cacheKey(key, date)));
}

export function saveCachedRating(kv: KV, key: CheckKey, date: string, rating: Rating): void {
  kv.set(cacheKey(key, date), JSON.stringify(rating));
}

export async function fetchManifest(url: string, fetchFn: typeof fetch = fetch): Promise<SeedsManifest | null> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    // Vite's dev server answers a missing public file with index.html; that fails JSON.parse and counts as absent.
    return parseManifest(await res.json());
  } catch {
    return null;
  }
}
