// Determinism of the pool: the same jobs give byte-identical results for any worker count, and the pooled difficulty
// check gives what ai's own prepareDay gives. These run real worker threads on the live content with small counts.
import { afterAll, describe, expect, it } from 'vitest';
import { expertRunner, prepareDay } from '@vault-duel/ai';
import type { DuelJob } from '@vault-duel/ai';
import { seedString } from '@vault-duel/engine';
import { stableJson } from '../src/aggregate';
import { checkDates } from '../src/difficulty-batch';
import { balanceJobs } from '../src/plan';
import { Pool } from '../src/pool';
import { loadContext } from '../src/world';

// Small test-owned numbers so a few dozen duels cover the check; they are overrides, not the live values.
const SETS = ['SIM_RUNS_PER_SEED=6', 'SEED_MAX_REROLLS=2'];
const ctx = loadContext(SETS);
const DATES = ['2026-01-05', '2026-01-06', '2026-01-07'];
const pools: Pool[] = [];

async function pool(size: number): Promise<Pool> {
  const p = await Pool.create(size, SETS);
  pools.push(p);
  return p;
}

afterAll(async () => {
  await Promise.all(pools.map((p) => p.close()));
});

describe('worker pool', () => {
  it('merges balance duels to the same bytes with 1 and 3 workers', async () => {
    const jobs = [
      ...balanceJobs(ctx, 'novice', 14, DATES),
      ...balanceJobs(ctx, 'expert', 9, DATES),
      ...balanceJobs(ctx, 'expert-noisy', 5, DATES),
      ...balanceJobs(ctx, 'greedy', 4, DATES),
    ];
    const one = await (await pool(1)).duels(jobs);
    const three = await (await pool(3)).duels(jobs);
    expect(stableJson(three.aggregate)).toBe(stableJson(one.aggregate));
    const bots = one.aggregate['bots'] as Record<string, Record<string, number>>;
    expect(bots['novice']?.['games']).toBe(14);
    expect(bots['expert']?.['games']).toBe(9);
    expect(bots['expert']?.['crashed'] ?? 0).toBe(0);
    expect(bots['expert']?.['stuck'] ?? 0).toBe(0);
  }, 120_000);

  it('plays the same duels in a different job order', async () => {
    const jobs = balanceJobs(ctx, 'expert', 8, DATES);
    const p = await pool(2);
    const forward = await p.duels(jobs);
    const backward = await p.duels([...jobs].reverse());
    expect(stableJson(backward.aggregate)).toBe(stableJson(forward.aggregate));
  }, 120_000);

  it('rates difficulty duels in job order, as ai would play them', async () => {
    const base = seedString(ctx.globals, DATES[0] as string);
    const jobs: DuelJob[] = Array.from({ length: 6 }, (_, runIndex) => ({ seedString: base, k: 0, runIndex, twist: -1 }));
    const run = expertRunner(ctx);
    const serial = jobs.map((j) => run(j));
    expect((await (await pool(1)).rate(jobs)).outcomes).toEqual(serial);
    expect((await (await pool(3)).rate(jobs)).outcomes).toEqual(serial);
  }, 120_000);
});

describe('pooled difficulty check', () => {
  it('gives the setups prepareDay gives with its own runner (D-228)', async () => {
    const run = expertRunner(ctx);
    const expected = DATES.map((d) => prepareDay(ctx, d, run));
    const one = await checkDates(await pool(1), ctx, DATES);
    const three = await checkDates(await pool(3), ctx, DATES);
    expect(one.setups).toEqual(expected);
    expect(three.setups).toEqual(expected);
    expect(stableJson(three.candidates)).toBe(stableJson(one.candidates));
    expect(one.candidates.length).toBeGreaterThanOrEqual(DATES.length);
  }, 180_000);
});
