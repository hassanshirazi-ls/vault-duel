// The report judges each metric against the TARGET_* globals of the run. The targets here are the test's own, so a
// tuning change to the live globals can never break these tests (one tuning change is one edit).
import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBALS } from '@vault-duel/content';
import type { Globals } from '@vault-duel/engine';
import { bump, bumpBin, child } from '../src/aggregate';
import type { Aggregate } from '../src/aggregate';
import { summarise } from '../src/difficulty-batch';
import { buildReport, deterministicPart, renderMarkdown, summariseBot } from '../src/report';
import type { PerfInfo, ReportInput } from '../src/report';

const TARGETS: Globals = {
  ...DEFAULT_GLOBALS,
  MAX_ROUNDS: 12,
  TARGET_EXPERT_WINRATE: [0.4, 0.6],
  TARGET_NOVICE_WINRATE: [0.1, 0.2],
  TARGET_NOVICE_POINT: 0.15,
  TARGET_MEDIAN_ROUNDS: [5, 6],
  TARGET_TYPICAL_END_ROUNDS: [4, 7],
  TARGET_FULL_LENGTH_SHARE: [0.1, 0.3],
  TARGET_GRAFTS_PER_WIN: [1, 2],
  TARGET_APPRAISAL_SUCCESS: [0.25, 0.5],
  TARGET_UNPRICED_APPEARS: [0.2, 0.5],
  TARGET_SEED_REJECT_MAX: 0.25,
  PERF_DUELS_PER_SEC_PER_CORE: 100,
};
const BINS = TARGETS.MAX_ROUNDS + 2;

/** `games` finished duels with the given round counts and win count, 2 grafts per win. */
function bot(rounds: Record<number, number>, wins: number, extra: Record<string, number> = {}): Aggregate {
  const a: Aggregate = {};
  let games = 0;
  for (const r of Object.keys(rounds)) {
    bumpBin(a, 'rounds', BINS, Number(r), rounds[Number(r)]);
    games += rounds[Number(r)] as number;
  }
  bump(a, 'games', games);
  bump(a, 'wins', wins);
  bump(a, 'graftsInWins', wins * 2);
  for (const k of Object.keys(extra)) bump(a, k, extra[k] as number);
  return a;
}

const PERF: PerfInfo = {
  workers: 2,
  duels: 200,
  wallSeconds: 1,
  duelsPerSecond: 200,
  duelsPerSecondPerCore: 150,
  byBot: [{ bot: 'expert', duels: 100, busySeconds: 1, duelsPerSecondPerCore: 150 }],
  seedCheck: null,
};

function input(aggregate: Aggregate, over: Partial<ReportInput> = {}): ReportInput {
  return {
    command: 'quick',
    date: '2026-01-01',
    args: {},
    globals: TARGETS,
    sets: [],
    contentHash: 'h',
    contentVersion: 'v',
    expertHash: 'e',
    aggregate,
    bots: ['expert', 'novice'],
    perf: PERF,
    seedSummary: null,
    seedRows: [],
    ...over,
  };
}

function verdicts(aggregate: Aggregate, over: Partial<ReportInput> = {}, perf: PerfInfo = PERF): Record<string, string> {
  const report = buildReport(input(aggregate, { perf, ...over }));
  return Object.fromEntries([...report.results.targets, report.perf.metric].map((m) => [m.id, m.verdict]));
}

function world(expert: Aggregate, novice: Aggregate): Aggregate {
  const a: Aggregate = {};
  const bots = child(a, 'bots');
  bots['expert'] = expert;
  bots['novice'] = novice;
  return a;
}

describe('balance targets', () => {
  // 100 expert games: 50 wins; median 6; 60 end in 4..7, 20 in round 12; 10 Appraisal attempts, 4 successes; 30 Unpriced.
  const expert = bot({ 5: 20, 6: 40, 12: 20, 9: 20 }, 50, { appraisalAttempts: 10, appraisalSuccesses: 4, unpriced: 30 });
  const novice = bot({ 3: 80, 6: 20 }, 15);

  it('passes each metric inside its range', () => {
    const v = verdicts(world(expert, novice));
    expect(v).toMatchObject({ 'BT-1': 'pass', 'BT-2': 'pass', 'BT-3': 'pass', 'BT-3b': 'pass', 'BT-4': 'pass', 'BT-5': 'pass', 'BT-6': 'pass', 'BT-7': 'pass', PERF: 'pass' });
  });

  it('fails a metric when its target moves past the measured value', () => {
    const tight: Globals = { ...TARGETS, TARGET_EXPERT_WINRATE: [0.6, 0.7], TARGET_FULL_LENGTH_SHARE: [0.5, 0.6], TARGET_GRAFTS_PER_WIN: [3, 4] };
    const v = verdicts(world(expert, novice), { globals: tight });
    expect(v).toMatchObject({ 'BT-1': 'fail', 'BT-4': 'fail', 'BT-5': 'fail', 'BT-3': 'pass' });
  });

  it('takes the round of "full length" from MAX_ROUNDS', () => {
    const short: Globals = { ...TARGETS, MAX_ROUNDS: 9 };
    const rep = buildReport(input(world(bot({ 9: 25, 5: 75 }, 50), novice), { globals: short }));
    expect(rep.results.targets.find((m) => m.id === 'BT-4')?.value).toBeCloseTo(0.25, 12);
  });

  it('judges PERF against PERF_DUELS_PER_SEC_PER_CORE', () => {
    const slow: PerfInfo = { ...PERF, duelsPerSecondPerCore: 50, byBot: [{ bot: 'expert', duels: 100, busySeconds: 2, duelsPerSecondPerCore: 50 }] };
    const v = verdicts(world(expert, novice), {}, slow);
    expect(v['PERF']).toBe('fail');
    const report = buildReport(input(world(expert, novice), { perf: slow }));
    expect(report.perf.anomalies.join('\n')).toContain('below PERF_DUELS_PER_SEC_PER_CORE');
  });

  it('marks what the run cannot measure', () => {
    const v = verdicts(world(expert, novice));
    expect(v['BT-8']).toBe('not measured');
    expect(v['DUEL-MIN']).toBe('not measured');
    expect(v['LEARN-SEC']).toBe('not measured');
    const only = verdicts(world(expert, novice), { bots: ['expert'] });
    expect(only['BT-2']).toBe('not measured');
  });

  it('reports the naive bot beside the novice as information only (M-09, D-117)', () => {
    const a = world(expert, novice);
    (a['bots'] as Aggregate)['naive'] = bot({ 3: 70, 6: 30 }, 25);
    const rep = buildReport(input(a, { bots: ['expert', 'novice', 'naive'] }));
    const row = rep.results.targets.find((m) => m.id === 'BT-2n');
    expect(row).toMatchObject({ bot: 'naive', verdict: 'info' });
    expect(row?.value).toBeCloseTo(0.25, 12);
    expect(rep.results.targets.find((m) => m.id === 'BT-2')?.bot).toBe('novice');
    expect(verdicts(world(expert, novice))['BT-2n']).toBe('not measured');
  });

  it('judges the seed rejection rate against TARGET_SEED_REJECT_MAX', () => {
    const summary = (rejected: number, candidates: number) => ({ ...summarise({ setups: [], candidates: [] }), rejected, candidates, rejectionRate: rejected / candidates, dates: 1 });
    expect(verdicts(world(expert, novice), { seedSummary: summary(1, 5) })['BT-8']).toBe('pass');
    expect(verdicts(world(expert, novice), { seedSummary: summary(4, 5) })['BT-8']).toBe('fail');
    expect(verdicts(world(expert, novice), { seedSummary: summary(5, 5) })['BT-8']).toBe('fail');
  });

  it('flags impossible values and unfinished games', () => {
    const odd = bot({ 3: 5, 13: 2 }, 7, { crashed: 1, stuck: 2 });
    const rep = buildReport(input(world(odd, novice)));
    const text = rep.results.anomalies.join('\n');
    expect(text).toContain('threw an error');
    expect(text).toContain('action cap');
    expect(text).toContain('past MAX_ROUNDS');
  });
});

describe('summarise (seed check)', () => {
  it('counts rejected candidates and fallbacks per date', () => {
    const setup = (date: string, check: 'accepted' | 'fallback') => ({ date, difficulty: { check } }) as never;
    const s = summarise({
      setups: [setup('d1', 'accepted'), setup('d2', 'accepted'), setup('d3', 'fallback')],
      candidates: [
        { date: 'd1', k: 0, winRate: 0.5 },
        { date: 'd2', k: 0, winRate: 0.95 },
        { date: 'd2', k: 1, winRate: 0.5 },
        { date: 'd3', k: 0, winRate: 0.0 },
        { date: 'd3', k: 1, winRate: 1.0 },
      ],
    });
    expect(s).toMatchObject({ dates: 3, candidates: 5, rejected: 3, datesNeedingReroll: 2, fallbacks: 1 });
    expect(s.rejectionRate).toBeCloseTo(0.6, 12);
    expect(s.winRateHistogram[9]).toBe(2);
    expect(s.winRateHistogram[0]).toBe(1);
  });
});

describe('output', () => {
  it('renders a markdown table with every target and an identical deterministic part for equal results', () => {
    const agg = world(bot({ 5: 10 }, 5), bot({ 5: 10 }, 1));
    const a = buildReport(input(agg));
    const b = buildReport(input(agg, { perf: { ...PERF, wallSeconds: 99 }, date: '2030-01-01' }));
    expect(deterministicPart(a)).toBe(deterministicPart(b));
    const md = renderMarkdown(a);
    for (const id of ['BT-1', 'BT-2', 'BT-3', 'BT-4', 'BT-5', 'BT-6', 'BT-7', 'BT-8', 'PERF']) expect(md).toContain(`| ${id} |`);
    expect(md).toContain('Not measured');
  });
});

describe('damage, Unstable and vault metrics', () => {
  it('derives the shares and per-round figures from the counters', () => {
    const a = bot({ 4: 6, 12: 4 }, 5, { roundSum: 80, dmgToCollector: 30, dmgToPlayer: 50, directDmg: 20, unstableGrafts: 7, gamesWithUnstable: 5 });
    bump(child(a, 'reasons'), 'vaultSealed', 4);
    const b = summariseBot('expert', a, TARGETS);
    expect(b.damagePerRound).toBe(1);
    expect(b.damageToCollectorPerRound).toBe(30 / 80);
    expect(b.directDamageShare).toBe(0.25);
    expect(b.unstablePerGame).toBe(0.7);
    expect(b.unstableGameShare).toBe(0.5);
    expect(b.vaultSealedShare).toBe(0.4);
  });
  it('is null, not NaN, when nothing was counted', () => {
    const b = summariseBot('expert', {}, TARGETS);
    expect(b.damagePerRound).toBeNull();
    expect(b.unstablePerGame).toBeNull();
    expect(b.vaultSealedShare).toBeNull();
  });
});
