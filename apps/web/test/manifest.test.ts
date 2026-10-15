import { describe, expect, it, vi } from 'vitest';
import { checkKey } from '@vault-duel/ai';
import * as content from '@vault-duel/content';
import { fetchManifest, parseManifest, ratingFromManifest, cacheKey, loadCachedRating, saveCachedRating } from '../src/daily/manifest';
import { resolveSetup } from '../src/daily/rating';
import { loadGameContent } from '../src/content/load';
import { browserStorage, memoryStorage } from '../src/persistence/storage';

const loaded = loadGameContent(content);
if (!loaded.ok) throw new Error(loaded.lines.join('\n'));
const ctx = loaded.ctx;
const key = checkKey(ctx);
const day = { k: 3, winRate: 0.5, stars: 2, par: 7, check: 'accepted' };
const manifest = (over: Partial<typeof key> = {}) => parseManifest({ ...key, ...over, days: { '2026-10-14': day } });

describe('seeds manifest (D-236)', () => {
  it('uses a day when all three hashes match', () => {
    expect(ratingFromManifest(manifest(), key, '2026-10-14')).toEqual(day);
  });
  it('ignores the whole manifest when any one hash differs', () => {
    for (const field of ['contentHash', 'globalsHash', 'expertHash'] as const) {
      expect(ratingFromManifest(manifest({ [field]: 'stale' }), key, '2026-10-14')).toBeNull();
    }
  });
  it('returns null for a date it does not have, and for a missing manifest', () => {
    expect(ratingFromManifest(manifest(), key, '2026-10-15')).toBeNull();
    expect(ratingFromManifest(null, key, '2026-10-14')).toBeNull();
  });
  it('rejects malformed manifests and ratings', () => {
    expect(parseManifest({ ...key, days: { d: { k: -1 } } })).toBeNull();
    expect(parseManifest({ ...key, days: { d: { ...day, stars: 4 } } })).toBeNull();
    expect(parseManifest('<html>')).toBeNull();
  });
  it('treats a failed or non-JSON fetch as no manifest', async () => {
    expect(await fetchManifest('/seeds.json', (() => Promise.reject(new Error('offline'))) as typeof fetch)).toBeNull();
    const html = (() => Promise.resolve(new Response('<!doctype html>', { status: 200 }))) as typeof fetch;
    expect(await fetchManifest('/seeds.json', html)).toBeNull();
  });
});

describe('rating cache', () => {
  it('is keyed by date and all three hashes', () => {
    expect(cacheKey(key, '2026-10-14')).not.toBe(cacheKey({ ...key, expertHash: 'x' }, '2026-10-14'));
    const kv = memoryStorage();
    saveCachedRating(kv, key, '2026-10-14', day as never);
    expect(loadCachedRating(kv, key, '2026-10-14')).toEqual(day);
    expect(loadCachedRating(kv, { ...key, globalsHash: 'x' }, '2026-10-14')).toBeNull();
  });
  it('reads an unparsable stored value as a miss', () => {
    const kv = memoryStorage();
    kv.set(cacheKey(key, 'd'), '{not json');
    expect(loadCachedRating(kv, key, 'd')).toBeNull();
  });
  it('browserStorage swallows a storage that throws', () => {
    const denied = () => { throw new Error('denied'); };
    vi.stubGlobal('localStorage', { getItem: denied, setItem: denied, removeItem: denied });
    const kv = browserStorage();
    expect(kv.get('a')).toBeNull();
    expect(kv.set('a', 'b')).toBe(false);
    expect(() => kv.remove('a')).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe('resolveSetup order', () => {
  const noWorker = () => Promise.reject(new Error('worker must not run'));
  it('manifest first, with no worker', async () => {
    const r = await resolveSetup(ctx, '2026-10-14', { storage: memoryStorage(), manifest: () => Promise.resolve(manifest() ?? null), compute: noWorker });
    expect(r.source).toBe('manifest');
    expect(r.setup.k).toBe(3);
  });
  it('then the cache', async () => {
    const storage = memoryStorage();
    saveCachedRating(storage, key, '2026-10-14', day as never);
    const r = await resolveSetup(ctx, '2026-10-14', { storage, manifest: () => Promise.resolve(null), compute: noWorker });
    expect(r.source).toBe('cache');
  });
  it('then the worker, and caches its answer', async () => {
    const storage = memoryStorage();
    const progress: number[] = [];
    const deps = {
      storage,
      manifest: () => Promise.resolve(null),
      compute: (_d: string, on: (p: { k: number; run: number; runs: number }) => void) => {
        on({ k: 0, run: 1, runs: 2 });
        return Promise.resolve(day as never);
      },
      onProgress: (p: { run: number }) => progress.push(p.run),
    };
    const r = await resolveSetup(ctx, '2026-10-14', deps);
    expect(r.source).toBe('computed');
    expect(progress).toEqual([1]);
    expect(loadCachedRating(storage, key, '2026-10-14')).toEqual(day);
  });
});
