// The seeds manifest (D-236): shape, ordering, the web reader's rules, the --check report, and the device cross-check.
import { afterAll, describe, expect, it } from 'vitest';
import { checkKey, daySetupFor, prepareDay } from '@vault-duel/ai';
import { parseArgs, UsageError } from '../src/args';
import { checkDates } from '../src/difficulty-batch';
import { Pool } from '../src/pool';
import { buildManifest, inspectManifest, parseManifestText, serializeManifest } from '../src/seeds';
import { loadContext } from '../src/world';

// Small test-owned numbers so a few dozen duels cover the check; they are overrides, not the live values.
const SETS = ['SIM_RUNS_PER_SEED=6', 'SEED_MAX_REROLLS=2'];
const ctx = loadContext(SETS);
const key = checkKey(ctx);
const DATES = ['2026-01-07', '2026-01-05', '2026-01-06'];
const pools: Pool[] = [];
afterAll(async () => {
  await Promise.all(pools.map((p) => p.close()));
});

async function rated(size: number, dates: readonly string[]) {
  const p = await Pool.create(size, SETS);
  pools.push(p);
  return (await checkDates(p, ctx, dates)).setups;
}

describe('manifest builder', () => {
  it('orders dates ascending, fixes key order, ends in a newline, and is the same for 1 and 3 workers', async () => {
    const one = serializeManifest(buildManifest(key, await rated(1, DATES)));
    const three = serializeManifest(buildManifest(key, await rated(3, [...DATES].reverse())));
    expect(three).toBe(one);
    expect(one.endsWith('}\n')).toBe(true);
    const m = JSON.parse(one) as Record<string, Record<string, Record<string, unknown>>>;
    expect(Object.keys(m)).toEqual(['contentHash', 'globalsHash', 'expertHash', 'days']);
    expect(Object.keys(m['days'] as object)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
    expect(Object.keys((m['days'] as Record<string, object>)['2026-01-05'] as object)).toEqual(['k', 'winRate', 'stars', 'par', 'check']);
  }, 120_000);

  it('parses under the web reader rules and rejects malformed files', async () => {
    const text = serializeManifest(buildManifest(key, await rated(2, DATES)));
    const back = parseManifestText(text);
    expect(back).not.toBeNull();
    expect(back).toMatchObject({ ...key });
    expect(Object.keys(back?.days ?? {})).toHaveLength(3);
    expect(parseManifestText('not json')).toBeNull();
    expect(parseManifestText(JSON.stringify({ ...key, days: { '2026-01-05': { k: 0, winRate: 0.5, stars: 4, par: 5, check: 'accepted' } } }))).toBeNull();
    expect(parseManifestText(JSON.stringify({ contentHash: 'a', days: {} }))).toBeNull();
  }, 120_000);

  it('gives, for a date, what prepareDay gives on the device (same k, winRate, stars, par, check)', async () => {
    const date = DATES[1] as string;
    const manifest = buildManifest(key, await rated(2, DATES));
    const device = prepareDay(ctx, date);
    expect(manifest.days[date]).toEqual({ k: device.k, winRate: device.difficulty.winRate, stars: device.difficulty.stars, par: device.difficulty.par, check: device.difficulty.check });
    // the manifest rating rebuilds the very same day without playing a duel
    expect(daySetupFor(ctx, date, manifest.days[date] as NonNullable<(typeof manifest.days)[string]>)).toEqual(device);
  }, 120_000);
});

describe('inspectManifest', () => {
  const today = '2026-10-15';
  const day = { k: 0, winRate: 0.5, stars: 2, par: 6, check: 'accepted' } as const;
  const full = (over: Partial<typeof key> = {}, n = 30): string => {
    const days: Record<string, typeof day> = {};
    for (let i = 0; i < n; i++) days[new Date(Date.UTC(2026, 9, 15 + i)).toISOString().slice(0, 10)] = day;
    return JSON.stringify({ ...key, ...over, days });
  };

  it('reports a match with full coverage', () => {
    const r = inspectManifest(full(), key, today, 'p');
    expect(r.status).toBe('match');
    expect(r.missingAhead).toHaveLength(0);
    expect(r.range).toEqual({ first: '2026-10-15', last: '2026-11-13', count: 30 });
    expect(r.lines.join('\n')).not.toContain('WARNING');
  });

  it('warns on a hash mismatch and names what differs', () => {
    const r = inspectManifest(full({ globalsHash: 'x' }), key, today, 'p');
    expect(r.status).toBe('mismatch');
    expect(r.differing).toEqual(['globalsHash']);
    expect(r.lines.join('\n')).toContain('WARNING');
  });

  it('counts missing days ahead', () => {
    const r = inspectManifest(full({}, 10), key, today, 'p');
    expect(r.status).toBe('match');
    expect(r.missingAhead).toHaveLength(20);
    expect(r.lines.join('\n')).toContain('20 of the next 30');
  });

  it("notes a manifest without yesterday (Practice, D-375) and suggests regenerating from yesterday", () => {
    const text = inspectManifest(full(), key, today, 'p').lines.join('\n');
    expect(text).toContain('note: yesterday (2026-10-14) is not in the manifest');
    expect(text).toContain('pnpm seeds --from 2026-10-14 --days 91');
    expect(inspectManifest(full(), key, '2026-10-16', 'p').lines.join('\n')).not.toContain('yesterday');
  });

  it('warns for a missing or unreadable file', () => {
    expect(inspectManifest(null, key, today, 'p')).toMatchObject({ status: 'missing', missingAhead: expect.any(Array) });
    expect(inspectManifest(null, key, today, 'p').lines[0]).toContain('WARNING');
    expect(inspectManifest('{', key, today, 'p').status).toBe('unreadable');
  });
});

describe('sim seeds arguments', () => {
  it('needs --from and --days unless --check', () => {
    expect(parseArgs(['seeds', '--from', '2026-10-15', '--days', '4', '--out', 'x'])).toMatchObject({ command: 'seeds', days: 4, check: false, out: 'x' });
    expect(parseArgs(['seeds', '--check']).check).toBe(true);
    expect(() => parseArgs(['seeds'])).toThrow(UsageError);
    expect(() => parseArgs(['quick', '--check'])).toThrow(UsageError);
    expect(() => parseArgs(['quick', '--days', '3'])).toThrow(UsageError);
  });
});
