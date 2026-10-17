// The difficulty check and the day's setup (DC-1 to DC-3, D-003, D-004, D-098, D-100, D-102, D-103). The check's logic runs
// on a stub duel runner with test-owned globals, so no test depends on the live thresholds or plays hundreds of duels.
import { describe, expect, it } from 'vitest';
import { createEngine, rerollSeed } from '@vault-duel/engine';
import type { Globals } from '@vault-duel/engine';
import { checkKey, createCollector, daySetupFor, expertHash, isoWeekOf, parOf, prepareDay, rateSeed, starsFor, twistFor } from '../src';
import type { DayContext, DuelJob, DuelRunner } from '../src';
import { CONTENT, GLOBALS as LIVE } from './helpers';

const RUNS = 10;
const G: Globals = {
  ...LIVE,
  SIM_RUNS_PER_SEED: RUNS,
  SEED_WINRATE_MIN: 0.3,
  SEED_WINRATE_MAX: 0.7,
  SEED_MAX_REROLLS: 4,
  DIFFICULTY_STAR_CUTS: [0.6, 0.4],
  OBJECTIVES_PER_DAY: 3,
};
const OFF: Globals = { ...G, FLAGS: { ...G.FLAGS, SPLIT: false, SYMBIOSIS: false, BOND_ACTION: false } };
const OBJECTIVES = ['o-a', 'o-b', 'o-c', 'o-d', 'o-e'];
const ctx = (g: Globals = G): DayContext => ({ content: CONTENT, globals: g, objectiveIds: OBJECTIVES });

/** A runner that wins `wins[k]` of the RUNS duels of reroll k, at round `round`. */
function stub(wins: readonly number[], round = 6, calls: DuelJob[] = []): DuelRunner {
  return (job) => {
    calls.push(job);
    return { won: job.runIndex < (wins[job.k] ?? 0), round };
  };
}

describe('rateSeed (DC-1 to DC-3, D-004)', () => {
  it('accepts the first reroll whose win rate is in the band, band edges included', () => {
    for (const wins of [3, 5, 7]) {
      const calls: DuelJob[] = [];
      const r = rateSeed(ctx(), 'base', -1, stub([wins], 6, calls));
      expect(r).toMatchObject({ k: 0, winRate: wins / RUNS, check: 'accepted' });
      expect(calls).toHaveLength(RUNS);
      expect(calls.map((c) => c.runIndex)).toEqual(Array.from({ length: RUNS }, (_, i) => i));
    }
  });

  it('rerolls while the win rate is outside the band and stops at the first that passes', () => {
    const calls: DuelJob[] = [];
    const r = rateSeed(ctx(), 'base', -1, stub([0, 10, 2, 5, 5], 6, calls));
    expect(r).toMatchObject({ k: 3, winRate: 0.5, check: 'accepted' });
    expect(r.tried.map((c) => c.k)).toEqual([0, 1, 2, 3]);
    expect(calls).toHaveLength(RUNS * 4);
    expect(new Set(calls.map((c) => c.k))).toEqual(new Set([0, 1, 2, 3]));
    expect(calls.every((c) => c.seedString === 'base' && c.twist === -1)).toBe(true);
  });

  it('falls back to the candidate nearest the middle of the band, the lowest k on a tie, after SEED_MAX_REROLLS + 1 tries', () => {
    const calls: DuelJob[] = [];
    const r = rateSeed(ctx(), 'base', -1, stub([0, 2, 8, 10, 2], 6, calls));
    expect(r.check).toBe('fallback');
    expect(r.tried).toHaveLength(G.SEED_MAX_REROLLS + 1);
    expect(calls).toHaveLength(RUNS * (G.SEED_MAX_REROLLS + 1));
    expect(r).toMatchObject({ k: 1, winRate: 0.2 }); // k = 1 and k = 2 are equally far (0.3 away): the lower k wins
    const only = rateSeed(ctx(), 'base', -1, stub([0, 0, 1, 0, 0]));
    expect(only).toMatchObject({ k: 2, check: 'fallback' });
  });

  it('rates the stars and the par of the kept candidate', () => {
    const run: DuelRunner = (job) => ({ won: job.runIndex < 5, round: 5 + (job.runIndex % 3) });
    const r = rateSeed(ctx(), 'base', -1, run);
    expect(r.stars).toBe(starsFor(G, 0.5));
    expect(r.par).toBe(parOf(G, [5, 6, 7, 5, 6]));
  });

  it('stars: the cuts split the band into thirds, the cut itself going to the easier rating (D-098)', () => {
    const [easy, medium] = G.DIFFICULTY_STAR_CUTS;
    expect(starsFor(G, 1)).toBe(1);
    expect(starsFor(G, easy)).toBe(1);
    expect(starsFor(G, easy - 0.01)).toBe(2);
    expect(starsFor(G, medium)).toBe(2);
    expect(starsFor(G, medium - 0.01)).toBe(3);
    expect(starsFor(G, 0)).toBe(3);
  });

  it('par: the median winning round, halves up; MAX_ROUNDS when the bot never won (D-100)', () => {
    expect(parOf(G, [9, 3, 7])).toBe(7);
    expect(parOf(G, [4, 5])).toBe(5);
    expect(parOf(G, [4, 6])).toBe(5);
    expect(parOf(G, [4])).toBe(4);
    expect(parOf(G, [])).toBe(G.MAX_ROUNDS);
  });
});

describe('weekly twist (D-103)', () => {
  const twists = [
    { id: 'a', text: 'a', modifiers: [] },
    { id: 'b', text: 'b', isoWeek: '2026-W42', modifiers: [] },
    { id: 'c', text: 'c', modifiers: [] },
  ];
  const content = { ...CONTENT, twists };
  const on: Globals = { ...G, FLAGS: { ...G.FLAGS, WEEKLY_TWIST: true } };
  const off: Globals = { ...G, FLAGS: { ...G.FLAGS, WEEKLY_TWIST: false } };

  it('computes ISO weeks, including year boundaries', () => {
    expect(isoWeekOf('2026-10-15')).toEqual({ year: 2026, week: 42 });
    expect(isoWeekOf('2026-01-01')).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOf('2024-12-30')).toEqual({ year: 2025, week: 1 });
    expect(isoWeekOf('2021-01-03')).toEqual({ year: 2020, week: 53 });
  });

  it('is -1 with the flag off or no twists; the named week wins; else the week number mod the list length', () => {
    expect(twistFor(content, off, '2026-10-15')).toBe(-1);
    expect(twistFor({ ...CONTENT, twists: [] }, on, '2026-10-15')).toBe(-1);
    expect(twistFor(content, on, '2026-10-15')).toBe(1);
    expect(twistFor(content, on, '2026-10-19')).toBe(43 % twists.length); // week 43 has no entry
  });
});

describe('prepareDay (§12.5)', () => {
  const run = stub([5]);

  it('is deterministic: the same date gives the same setup, byte for byte', () => {
    expect(JSON.stringify(prepareDay(ctx(), '2026-10-15', run))).toBe(JSON.stringify(prepareDay(ctx(), '2026-10-15', run)));
  });

  it('records a hash of the expert weights, which changes with them', () => {
    // The live defaults have the bond switches on since the 2026-10-16 flip, so the hash covers the bond weights; with every
    // switch off it is the old plain hash.
    expect(prepareDay(ctx(), '2026-10-15', run).expertHash).toBe(expertHash(true));
    expect(prepareDay(ctx(OFF), '2026-10-15', run).expertHash).toBe(expertHash(false));
    expect(expertHash()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('differs between dates', () => {
    const a = prepareDay(ctx(), '2026-10-15', run);
    const b = prepareDay(ctx(), '2026-10-16', run);
    expect(b.seedString).not.toBe(a.seedString);
    expect(b.deckList).not.toEqual(a.deckList);
  });

  it('picks OBJECTIVES_PER_DAY distinct objectives from the file, and a monster of the deck as the signature', () => {
    for (let day = 1; day <= 20; day++) {
      const d = prepareDay(ctx(), `2026-03-${String(day).padStart(2, '0')}`, run);
      expect(d.objectives).toHaveLength(G.OBJECTIVES_PER_DAY);
      expect(new Set(d.objectives).size).toBe(G.OBJECTIVES_PER_DAY);
      for (const o of d.objectives) expect(OBJECTIVES).toContain(o);
      expect(d.deckList).toContain(d.signature);
      expect(CONTENT.type[CONTENT.index.get(d.signature) as number]).toBe(0); // DefType.Monster
    }
    const all = prepareDay(ctx({ ...G, OBJECTIVES_PER_DAY: OBJECTIVES.length }), '2026-03-01', run);
    expect([...all.objectives].sort()).toEqual([...OBJECTIVES].sort());
    expect(() => prepareDay(ctx({ ...G, OBJECTIVES_PER_DAY: OBJECTIVES.length + 1 }), '2026-03-01', run)).toThrow(/objectives/);
  });

  it('uses the accepted reroll for everything: the deck is the engine deck of seedString#k', () => {
    const d = prepareDay(ctx(), '2026-05-05', stub([0, 0, 5]));
    expect(d.k).toBe(2);
    expect(d.difficulty).toMatchObject({ winRate: 0.5, check: 'accepted' });
    const collector = createCollector({ content: CONTENT, globals: G });
    const engine = createEngine(CONTENT, G, { intent: collector.intentPolicy });
    const s = engine.newGame(rerollSeed(d.seedString, d.k), { twist: d.twist }).state;
    const deck = s.inst.filter((i) => i.owner === 0).map((i) => CONTENT.ids[i.def]);
    expect(deck).toEqual(d.deckList);
    // The objectives and the deck are regenerated for each reroll (D-003).
    const first = prepareDay(ctx(), '2026-05-05', stub([5]));
    expect(first.k).toBe(0);
    expect(first.deckList).not.toEqual(d.deckList);
  });

  it('daySetupFor rebuilds the same setup from the rating alone, without playing a duel (D-236)', () => {
    const d = prepareDay(ctx(), '2026-05-05', stub([0, 0, 5]));
    expect(JSON.stringify(daySetupFor(ctx(), '2026-05-05', { k: d.k, ...d.difficulty }))).toBe(JSON.stringify(d));
  });

  it('checkKey changes with the globals and carries the content and expert hashes (D-236)', () => {
    const a = checkKey(ctx());
    expect(a).toEqual({ contentHash: CONTENT.hash, globalsHash: a.globalsHash, expertHash: expertHash(true) }); // bond switches on since the 2026-10-16 flip
    expect(checkKey(ctx(OFF)).expertHash).toBe(expertHash(false));
    expect(checkKey(ctx({ ...G, SIM_RUNS_PER_SEED: G.SIM_RUNS_PER_SEED + 1 })).globalsHash).not.toBe(a.globalsHash);
  });

  it('the real expert-with-noise check is deterministic too (few runs)', () => {
    const small: Globals = { ...G, SIM_RUNS_PER_SEED: 4, SEED_MAX_REROLLS: 1, SEED_WINRATE_MIN: 0, SEED_WINRATE_MAX: 1 };
    const a = prepareDay(ctx(small), '2026-10-15');
    expect(a.k).toBe(0);
    expect(JSON.stringify(prepareDay(ctx(small), '2026-10-15'))).toBe(JSON.stringify(a));
    expect([1, 2, 3]).toContain(a.difficulty.stars);
  });
});
