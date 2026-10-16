// The balance report (ARCHITECTURE.md §15): every DESIGN balance metric against its TARGET_* global, plus the extra
// measurements. `buildReport` is pure (aggregates in, report out); `renderMarkdown` and `writeReport` format it.
// Nothing here pins a global's value: targets are read from the globals the run used.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Globals } from '@vault-duel/engine';
import { hist, mean, median, num, percentile, stableJson, sub, sum } from './aggregate';
import type { Aggregate } from './aggregate';
import type { SeedCheckSummary } from './difficulty-batch';
import type { BotId } from './jobs';

export type Verdict = 'pass' | 'fail' | 'not measured' | 'info';

export interface Metric {
  readonly id: string;
  readonly name: string;
  readonly bot: string;
  readonly value: number | null;
  readonly target: string;
  readonly verdict: Verdict;
  readonly note: string;
}

export interface BotSummary {
  readonly bot: string;
  readonly games: number;
  readonly finished: number;
  readonly wins: number;
  readonly winRate: number | null;
  readonly roundHistogram: readonly number[];
  readonly winRoundHistogram: readonly number[];
  readonly medianRounds: number | null;
  readonly meanRounds: number | null;
  readonly p90Rounds: number | null;
  readonly shareMaxRounds: number | null;
  readonly shareTypicalEnd: number | null;
  readonly graftsPerWin: number | null;
  readonly appraisalAttempts: number;
  readonly appraisalSuccessRate: number | null;
  readonly unpricedRate: number | null;
  readonly intentSamples: number;
  readonly intentAccuracy: number | null;
  readonly intentMatrix: Aggregate;
  readonly actionsPerGame: number | null;
  readonly endings: Aggregate;
  readonly crashed: number;
  readonly stuck: number;
  /** share of finished games that ended by the sealed Vault */
  readonly vaultSealedShare: number | null;
  /** median round of the games this bot won */
  readonly medianWinRound: number | null;
  /** Unstable Chimeras the player made, per finished game, and the share of games with at least one */
  readonly unstablePerGame: number | null;
  readonly unstableGameShare: number | null;
  /** life points lost by both sides per round played, in finished games */
  readonly damagePerRound: number | null;
  readonly damageToCollectorPerRound: number | null;
  readonly damageToPlayerPerRound: number | null;
  /** share of that damage dealt by direct attacks (the rest is spillover and effects) */
  readonly directDamageShare: number | null;
}

export interface CardRow {
  readonly id: string;
  readonly deck: number;
  readonly played: number;
  readonly playRate: number | null;
  readonly winRateWhenPlayed: number | null;
  readonly winRateWhenHeldUnplayed: number | null;
  /** win rate when played minus win rate when in the deck and not played */
  readonly delta: number | null;
}

export interface KeywordRow {
  readonly id: string;
  readonly games: number;
  readonly summons: number;
  readonly winRateWhenSummoned: number | null;
}

export interface PerfInfo {
  readonly workers: number;
  readonly duels: number;
  readonly wallSeconds: number;
  readonly duelsPerSecond: number;
  readonly duelsPerSecondPerCore: number;
  readonly byBot: readonly { readonly bot: string; readonly duels: number; readonly busySeconds: number; readonly duelsPerSecondPerCore: number }[];
  readonly seedCheck: { readonly duels: number; readonly wallSeconds: number; readonly duelsPerSecondPerCore: number } | null;
}

export interface ReportInput {
  readonly command: string;
  readonly date: string;
  readonly args: Record<string, unknown>;
  readonly globals: Globals;
  readonly sets: readonly string[];
  /** `--ring` and `--collector` overrides, as lines */
  readonly contentOverrides?: readonly string[];
  /** hash of the globals the run used (the cfg hash is derived from it and the content hash) */
  readonly globalsHash?: string;
  readonly contentHash: string;
  readonly contentVersion: string;
  readonly expertHash: string;
  readonly aggregate: Aggregate;
  readonly bots: readonly BotId[];
  readonly perf: PerfInfo;
  readonly seedSummary: SeedCheckSummary | null;
  readonly seedRows: readonly SeedRow[];
}

export interface SeedRow {
  readonly date: string;
  readonly k: number;
  readonly winRate: number;
  readonly stars: number;
  readonly par: number;
  readonly check: string;
  readonly tried: number;
}

export interface Report {
  readonly command: string;
  readonly date: string;
  readonly args: Record<string, unknown>;
  readonly config: {
    readonly overrides: readonly string[];
    readonly contentOverrides: readonly string[];
    readonly globalsHash: string;
    readonly contentHash: string;
    readonly contentVersion: string;
    readonly expertHash: string;
    readonly globals: Globals;
  };
  /** Everything here depends only on the jobs: identical for any worker count or schedule. */
  readonly results: {
    readonly bots: readonly BotSummary[];
    readonly cards: Record<string, readonly CardRow[]>;
    readonly keywords: Record<string, readonly KeywordRow[]>;
    readonly seedCheck: { readonly summary: SeedCheckSummary; readonly rows: readonly SeedRow[] } | null;
    readonly targets: readonly Metric[];
    readonly anomalies: readonly string[];
    readonly notMeasured: readonly string[];
  };
  /** Wall-clock measurements: these differ from run to run. */
  readonly perf: PerfInfo & { readonly metric: Metric; readonly anomalies: readonly string[] };
}

const ratio = (a: number, b: number): number | null => (b === 0 ? null : a / b);
const finite = (v: number): number | null => (Number.isFinite(v) ? v : null);

function inRange(v: number | null, range: readonly [number, number]): Verdict {
  return v === null ? 'not measured' : v >= range[0] && v <= range[1] ? 'pass' : 'fail';
}
const showRange = (r: readonly [number, number]): string => `${r[0]} to ${r[1]}`;

export function summariseBot(bot: string, a: Aggregate, g: Globals): BotSummary {
  const games = num(a, 'games');
  const stuck = num(a, 'stuck');
  const crashed = num(a, 'crashed');
  const rounds = hist(a, 'rounds');
  const finished = sum(rounds);
  const wins = num(a, 'wins');
  const [typicalLo, typicalHi] = g.TARGET_TYPICAL_END_ROUNDS;
  let typical = 0;
  for (let r = typicalLo; r <= Math.min(typicalHi, rounds.length - 1); r++) typical += rounds[r] ?? 0;
  const intent = sub(a, 'intent');
  return {
    bot,
    games,
    finished,
    wins,
    winRate: ratio(wins, finished),
    roundHistogram: rounds,
    winRoundHistogram: hist(a, 'winRounds'),
    medianRounds: finite(median(rounds)),
    meanRounds: finite(mean(rounds)),
    p90Rounds: finite(percentile(rounds, 0.9)),
    shareMaxRounds: finished === 0 ? null : (rounds[g.MAX_ROUNDS] ?? 0) / finished,
    shareTypicalEnd: ratio(typical, finished),
    graftsPerWin: ratio(num(a, 'graftsInWins'), wins),
    appraisalAttempts: num(a, 'appraisalAttempts'),
    appraisalSuccessRate: ratio(num(a, 'appraisalSuccesses'), num(a, 'appraisalAttempts')),
    unpricedRate: ratio(num(a, 'unpriced'), finished),
    intentSamples: num(intent, 'total'),
    intentAccuracy: ratio(num(intent, 'hit'), num(intent, 'total')),
    intentMatrix: sub(intent, 'matrix'),
    actionsPerGame: ratio(num(a, 'actions'), games),
    endings: sub(a, 'reasons'),
    crashed,
    stuck,
    vaultSealedShare: ratio(num(sub(a, 'reasons'), 'vaultSealed'), finished),
    medianWinRound: finite(median(hist(a, 'winRounds'))),
    unstablePerGame: ratio(num(a, 'unstableGrafts'), finished),
    unstableGameShare: ratio(num(a, 'gamesWithUnstable'), finished),
    damagePerRound: ratio(num(a, 'dmgToCollector') + num(a, 'dmgToPlayer'), num(a, 'roundSum')),
    damageToCollectorPerRound: ratio(num(a, 'dmgToCollector'), num(a, 'roundSum')),
    damageToPlayerPerRound: ratio(num(a, 'dmgToPlayer'), num(a, 'roundSum')),
    directDamageShare: ratio(num(a, 'directDmg'), num(a, 'dmgToCollector') + num(a, 'dmgToPlayer')),
  };
}

export function cardRows(a: Aggregate): CardRow[] {
  const cards = sub(a, 'cards');
  return Object.keys(cards)
    .sort()
    .map((id) => {
      const c = sub(cards, id);
      const deck = num(c, 'deck');
      const played = num(c, 'played');
      const playedWins = num(c, 'playedWins');
      const heldUnplayed = deck - played;
      const whenPlayed = ratio(playedWins, played);
      const whenHeld = ratio(num(c, 'deckWins') - playedWins, heldUnplayed);
      return {
        id,
        deck,
        played,
        playRate: ratio(played, deck),
        winRateWhenPlayed: whenPlayed,
        winRateWhenHeldUnplayed: whenHeld,
        delta: whenPlayed === null || whenHeld === null ? null : whenPlayed - whenHeld,
      };
    });
}

export function keywordRows(a: Aggregate): KeywordRow[] {
  const kws = sub(a, 'keywords');
  return Object.keys(kws)
    .sort()
    .map((id) => {
      const k = sub(kws, id);
      return { id, games: num(k, 'games'), summons: num(k, 'summons'), winRateWhenSummoned: ratio(num(k, 'gamesWon'), num(k, 'games')) };
    });
}

/** The BT-1…BT-8 metrics and the measurement targets, each against its global. The expert is the reference player for BT-1 and BT-3 to BT-7. */
export function evaluateTargets(g: Globals, bots: readonly BotSummary[], seed: SeedCheckSummary | null): Metric[] {
  const expert = bots.find((b) => b.bot === 'expert');
  const novice = bots.find((b) => b.bot === 'novice');
  const metrics: Metric[] = [];
  const add = (m: Metric): void => void metrics.push(m);
  const need = (id: string, name: string, bot: string, target: string): Metric => ({ id, name, bot, value: null, target, verdict: 'not measured', note: `the ${bot} bot was not run` });

  if (expert === undefined) {
    add(need('BT-1', 'Win rate', 'expert', showRange(g.TARGET_EXPERT_WINRATE)));
    add(need('BT-3', 'Median rounds', 'expert', showRange(g.TARGET_MEDIAN_ROUNDS)));
    add(need('BT-3b', 'Share ending in the typical rounds', 'expert', showRange(g.TARGET_TYPICAL_END_ROUNDS)));
    add(need('BT-4', 'Share going the full length', 'expert', showRange(g.TARGET_FULL_LENGTH_SHARE)));
    add(need('BT-5', 'Grafts per winning game', 'expert', showRange(g.TARGET_GRAFTS_PER_WIN)));
    add(need('BT-6', 'Appraisal success rate', 'expert', showRange(g.TARGET_APPRAISAL_SUCCESS)));
    add(need('BT-7', 'Unpriced appearance rate', 'expert', showRange(g.TARGET_UNPRICED_APPEARS)));
  } else {
    add({ id: 'BT-1', name: 'Win rate', bot: 'expert', value: expert.winRate, target: showRange(g.TARGET_EXPERT_WINRATE), verdict: inRange(expert.winRate, g.TARGET_EXPERT_WINRATE), note: 'noise-free expert vs the Collector' });
    add({ id: 'BT-3', name: 'Median rounds per game', bot: 'expert', value: expert.medianRounds, target: showRange(g.TARGET_MEDIAN_ROUNDS), verdict: inRange(expert.medianRounds, g.TARGET_MEDIAN_ROUNDS), note: 'median of the round histogram, all finished games' });
    const [lo, hi] = g.TARGET_TYPICAL_END_ROUNDS;
    // "Most games" end in rounds lo to hi: more than half.
    const typical = expert.shareTypicalEnd;
    add({ id: 'BT-3b', name: `Share ending in rounds ${lo} to ${hi}`, bot: 'expert', value: typical, target: `more than half (rounds ${showRange(g.TARGET_TYPICAL_END_ROUNDS)})`, verdict: typical === null ? 'not measured' : typical * 2 > 1 ? 'pass' : 'fail', note: '"most" read as a majority (D-230)' });
    add({ id: 'BT-4', name: `Share ending in round ${g.MAX_ROUNDS}`, bot: 'expert', value: expert.shareMaxRounds, target: showRange(g.TARGET_FULL_LENGTH_SHARE), verdict: inRange(expert.shareMaxRounds, g.TARGET_FULL_LENGTH_SHARE), note: 'includes games ended by the sealed Vault' });
    add({ id: 'BT-5', name: 'Grafts per winning game', bot: 'expert', value: expert.graftsPerWin, target: showRange(g.TARGET_GRAFTS_PER_WIN), verdict: inRange(expert.graftsPerWin, g.TARGET_GRAFTS_PER_WIN), note: 'track.grafts over wins' });
    add({ id: 'BT-6', name: 'Appraisal success rate', bot: 'expert', value: expert.appraisalSuccessRate, target: showRange(g.TARGET_APPRAISAL_SUCCESS), verdict: inRange(expert.appraisalSuccessRate, g.TARGET_APPRAISAL_SUCCESS), note: `successes over attempts (${expert.appraisalAttempts} attempts); an attempt with no target fails` });
    add({ id: 'BT-7', name: 'Unpriced appearance rate', bot: 'expert', value: expert.unpricedRate, target: showRange(g.TARGET_UNPRICED_APPEARS), verdict: inRange(expert.unpricedRate, g.TARGET_UNPRICED_APPEARS), note: 'share of games in which the Collector summoned his ace (track.unpriced)' });
  }
  if (novice === undefined) {
    add(need('BT-2', 'Win rate', 'novice', showRange(g.TARGET_NOVICE_WINRATE)));
  } else {
    const distance = novice.winRate === null ? '' : `, ${(Math.abs(novice.winRate - g.TARGET_NOVICE_POINT) * 100).toFixed(1)} points from the ${g.TARGET_NOVICE_POINT} point`;
    add({ id: 'BT-2', name: 'Win rate', bot: 'novice', value: novice.winRate, target: showRange(g.TARGET_NOVICE_WINRATE), verdict: inRange(novice.winRate, g.TARGET_NOVICE_WINRATE), note: `uniform random legal action (D-117)${distance}` });
  }
  if (seed === null) {
    add({ id: 'BT-8', name: 'Seed rejection rate', bot: 'expert-noisy', value: null, target: `at most ${g.TARGET_SEED_REJECT_MAX}`, verdict: 'not measured', note: 'run sim full or sim seed' });
  } else {
    add({ id: 'BT-8', name: 'Seed rejection rate', bot: 'expert-noisy', value: finite(seed.rejectionRate), target: `at most ${g.TARGET_SEED_REJECT_MAX}`, verdict: Number.isFinite(seed.rejectionRate) ? (seed.rejectionRate <= g.TARGET_SEED_REJECT_MAX ? 'pass' : 'fail') : 'not measured', note: `${seed.rejected} of ${seed.candidates} candidate seeds rejected over ${seed.dates} dates; ${seed.fallbacks} fallbacks (D-004 target: never)` });
  }
  add({ id: 'DUEL-MIN', name: 'Duel length in minutes', bot: '-', value: null, target: showRange(g.TARGET_DUEL_MINUTES), verdict: 'not measured', note: 'needs human playtests, not a simulation' });
  add({ id: 'LEARN-SEC', name: 'Seconds to learn the rules', bot: '-', value: null, target: `at most ${g.TARGET_RULES_LEARN_SECONDS}`, verdict: 'not measured', note: 'needs human playtests, not a simulation' });
  return metrics;
}

/** PERF_DUELS_PER_SEC_PER_CORE against the measured speed. Wall-clock based, so it lives in `perf`, outside the deterministic results. */
export function evaluatePerf(g: Globals, perf: PerfInfo, reference: string): Metric {
  const row = perf.byBot.find((b) => b.bot === reference);
  const perCore = row?.duelsPerSecondPerCore ?? perf.duelsPerSecondPerCore;
  return {
    id: 'PERF',
    name: 'Duels per second per core',
    bot: row === undefined ? 'all' : reference,
    value: finite(perCore),
    target: `at least ${g.PERF_DUELS_PER_SEC_PER_CORE}`,
    verdict: !Number.isFinite(perCore) ? 'not measured' : perCore >= g.PERF_DUELS_PER_SEC_PER_CORE ? 'pass' : 'fail',
    note: 'duels over summed worker busy time, start-up excluded (§18.10); falls when workers share cores',
  };
}

export const NOT_MEASURED: readonly string[] = [
  'Per-keyword trigger counts: the engine run for the sim has events off, and no event names a keyword trigger. The report gives keyword exposure instead (summons of a monster carrying the keyword, and the win rate of those games).',
  'Per-card play counts cover Summon, Summon (Covetous), Cast and Set Trap. A Graft Chimera appears as its family, not as a played card.',
  'TARGET_DUEL_MINUTES and TARGET_RULES_LEARN_SECONDS: human-playtest figures, no simulation can measure them.',
];

export function findAnomalies(g: Globals, bots: readonly BotSummary[], seed: SeedCheckSummary | null): string[] {
  const out: string[] = [];
  for (const b of bots) {
    if (b.crashed > 0) out.push(`${b.bot}: ${b.crashed} of ${b.games} duels threw an error`);
    if (b.stuck > 0) out.push(`${b.bot}: ${b.stuck} duels did not end within the action cap`);
    const overflow = b.roundHistogram[g.MAX_ROUNDS + 1] ?? 0;
    if (overflow > 0) out.push(`${b.bot}: ${overflow} duels ended after round ${g.MAX_ROUNDS}, past MAX_ROUNDS`);
    if ((b.roundHistogram[0] ?? 0) > 0) out.push(`${b.bot}: ${b.roundHistogram[0]} duels ended in round 0`);
    if (b.finished + b.crashed + b.stuck !== b.games) out.push(`${b.bot}: ${b.games} games but ${b.finished} finished, ${b.crashed} crashed, ${b.stuck} stuck`);
    if (b.winRate !== null && (b.winRate === 0 || b.winRate === 1)) out.push(`${b.bot}: win rate is exactly ${b.winRate}`);
    const attempts = b.appraisalAttempts;
    if (b.appraisalSuccessRate !== null && (b.appraisalSuccessRate < 0 || b.appraisalSuccessRate > 1)) out.push(`${b.bot}: appraisal success rate ${b.appraisalSuccessRate} out of range (${attempts} attempts)`);
    if (b.intentSamples === 0 && g.FLAGS.INTENTS && b.finished > 0) out.push(`${b.bot}: FLAGS.INTENTS is on but no intent sample was taken`);
  }
  if (seed !== null) {
    if (seed.fallbacks > 0) out.push(`${seed.fallbacks} dates reached the D-004 fallback (target: never)`);
    if (Number.isFinite(seed.rejectionRate) && seed.rejectionRate > g.TARGET_SEED_REJECT_MAX) out.push(`seed rejection ${(seed.rejectionRate * 100).toFixed(1)}% is above TARGET_SEED_REJECT_MAX (${g.TARGET_SEED_REJECT_MAX})`);
  }
  return out;
}

export function buildReport(input: ReportInput): Report {
  const g = input.globals;
  const metric = evaluatePerf(g, input.perf, 'expert');
  const botSummaries = input.bots.map((id) => summariseBot(id, sub(sub(input.aggregate, 'bots'), id), g));
  const cards: Record<string, readonly CardRow[]> = {};
  const keywords: Record<string, readonly KeywordRow[]> = {};
  for (const id of input.bots) {
    cards[id] = cardRows(sub(sub(input.aggregate, 'bots'), id));
    keywords[id] = keywordRows(sub(sub(input.aggregate, 'bots'), id));
  }
  return {
    command: input.command,
    date: input.date,
    args: input.args,
    config: { overrides: input.sets, contentOverrides: input.contentOverrides ?? [], globalsHash: input.globalsHash ?? '', contentHash: input.contentHash, contentVersion: input.contentVersion, expertHash: input.expertHash, globals: g },
    results: {
      bots: botSummaries,
      cards,
      keywords,
      seedCheck: input.seedSummary === null ? null : { summary: input.seedSummary, rows: input.seedRows },
      targets: evaluateTargets(g, botSummaries, input.seedSummary),
      anomalies: findAnomalies(g, botSummaries, input.seedSummary),
      notMeasured: NOT_MEASURED,
    },
    perf: { ...input.perf, metric, anomalies: metric.verdict === 'fail' ? [`duels/sec/core ${(metric.value ?? 0).toFixed(0)} is below PERF_DUELS_PER_SEC_PER_CORE (${g.PERF_DUELS_PER_SEC_PER_CORE})`] : [] },
  };
}

/** The part of the report that must be identical across worker counts: everything but `perf` and the date. */
export function deterministicPart(report: Report): string {
  return stableJson({ command: report.command, args: report.args, config: report.config, results: report.results });
}

const pct = (v: number | null): string => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const dec = (v: number | null, digits = 2): string => (v === null ? 'n/a' : v.toFixed(digits));

export function renderMarkdown(r: Report): string {
  const L: string[] = [];
  const g = r.config.globals;
  L.push(`# Simulator report: ${r.command}, ${r.date}`, '');
  L.push(`- content: version ${r.config.contentVersion}, hash \`${r.config.contentHash}\``);
  L.push(`- expertHash: \`${r.config.expertHash}\``);
  L.push(`- globals hash: \`${r.config.globalsHash}\``);
  L.push(`- overrides (--set): ${r.config.overrides.length === 0 ? 'none' : r.config.overrides.map((s) => `\`${s}\``).join(' ')}`);
  L.push(`- content overrides (--ring, --collector): ${r.config.contentOverrides.length === 0 ? 'none' : r.config.contentOverrides.map((s) => `\`${s}\``).join(' ')}`);
  L.push(`- arguments: \`${JSON.stringify(r.args)}\``);
  L.push('- the complete globals used are in the JSON file next to this report', '');

  L.push('## Balance targets', '', '| Id | Metric | Bot | Value | Target | Result | Note |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const m of [...r.results.targets, r.perf.metric]) {
    const asPct = ['BT-1', 'BT-2', 'BT-3b', 'BT-4', 'BT-6', 'BT-7', 'BT-8'].includes(m.id);
    const value = m.value === null ? 'n/a' : asPct ? pct(m.value) : dec(m.value);
    const target = asPct && m.id !== 'BT-3b' ? m.target.replace(/-?\d+(\.\d+)?/g, (n) => (Number(n) <= 1 ? `${(Number(n) * 100).toFixed(0)}%` : n)) : m.target;
    L.push(`| ${m.id} | ${m.name} | ${m.bot} | ${value} | ${target} | **${m.verdict}** | ${m.note} |`);
  }
  L.push('');

  const anomalies = [...r.results.anomalies, ...r.perf.anomalies];
  if (anomalies.length > 0) {
    L.push('## Anomalies', '', ...anomalies.map((a) => `- ${a}`), '');
  }

  L.push('## Win rate by bot', '', '| Bot | Games | Finished | Wins | Win rate | Median rounds | Mean rounds | p90 | Actions/game |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const b of r.results.bots) {
    L.push(`| ${b.bot} | ${b.games} | ${b.finished} | ${b.wins} | ${pct(b.winRate)} | ${dec(b.medianRounds, 1)} | ${dec(b.meanRounds)} | ${dec(b.p90Rounds, 0)} | ${dec(b.actionsPerGame, 0)} |`);
  }
  L.push('');

  L.push('## Round at which the duel ended', '');
  const rounds = Array.from({ length: g.MAX_ROUNDS }, (_, i) => i + 1);
  L.push(`| Bot | ${rounds.join(' | ')} |`, `| --- | ${rounds.map(() => '---').join(' | ')} |`);
  for (const b of r.results.bots) {
    L.push(`| ${b.bot} | ${rounds.map((n) => pct(b.finished === 0 ? null : (b.roundHistogram[n] ?? 0) / b.finished)).join(' | ')} |`);
  }
  L.push('');

  L.push('## Per-bot detail', '', '| Bot | Grafts per win | Appraisal success | Appraisal attempts | Unpriced appears | Intent accuracy | Intent samples | Crashed | Stuck |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const b of r.results.bots) {
    L.push(`| ${b.bot} | ${dec(b.graftsPerWin)} | ${pct(b.appraisalSuccessRate)} | ${b.appraisalAttempts} | ${pct(b.unpricedRate)} | ${pct(b.intentAccuracy)} | ${b.intentSamples} | ${b.crashed} | ${b.stuck} |`);
  }
  L.push('');
  L.push('## Damage, Unstable Chimeras, vault', '', '| Bot | Vault sealed | Median winning round | Unstable per game | Games with Unstable | Damage per round | To Collector | To player | Direct share |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const b of r.results.bots) {
    L.push(`| ${b.bot} | ${pct(b.vaultSealedShare)} | ${dec(b.medianWinRound, 1)} | ${dec(b.unstablePerGame)} | ${pct(b.unstableGameShare)} | ${dec(b.damagePerRound)} | ${dec(b.damageToCollectorPerRound)} | ${dec(b.damageToPlayerPerRound)} | ${pct(b.directDamageShare)} |`);
  }
  L.push('');
  for (const b of r.results.bots) {
    const ends = Object.keys(b.endings).sort().map((k) => `${k} ${num(b.endings, k)}`).join(', ');
    if (ends !== '') L.push(`- ${b.bot} endings: ${ends}`);
  }
  L.push('');

  if (r.results.seedCheck !== null) {
    const s = r.results.seedCheck.summary;
    L.push('## Difficulty check', '');
    L.push(`- dates: ${s.dates}, candidate seeds played: ${s.candidates}, rejected: ${s.rejected}`);
    L.push(`- rejection rate: **${pct(finite(s.rejectionRate))}** (target at most ${pct(g.TARGET_SEED_REJECT_MAX)})`);
    L.push(`- dates needing at least one reroll: ${s.datesNeedingReroll} of ${s.dates}; mean rerolls per date ${dec(finite(s.meanRerolls))}; fallbacks ${s.fallbacks}`);
    L.push('', 'Candidate win rates (tenths):', '', `| ${s.winRateHistogram.map((_, i) => `${i / 10}`).join(' | ')} |`, `| ${s.winRateHistogram.map(() => '---').join(' | ')} |`, `| ${s.winRateHistogram.join(' | ')} |`, '');
    L.push('| Date | k | Win rate | Stars | Par | Check | Candidates |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const row of r.results.seedCheck.rows) L.push(`| ${row.date} | ${row.k} | ${pct(row.winRate)} | ${row.stars} | ${row.par} | ${row.check} | ${row.tried} |`);
    L.push('');
  }

  for (const b of r.results.bots) {
    const rows = (r.results.cards[b.bot] ?? []).filter((c) => c.delta !== null);
    if (rows.length === 0) continue;
    const sorted = [...rows].sort((x, y) => (y.delta as number) - (x.delta as number) || (x.id < y.id ? -1 : 1));
    L.push(`## Per-card play and win (${b.bot})`, '', 'Delta = win rate when played minus win rate when in the deck and not played. It is a correlation, not an effect: a card that is played early in a won game, or only in a long one, shifts it. All cards, best first.', '', '| Card | In deck | Played | Play rate | Win when played | Win when held | Delta |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const c of sorted) L.push(`| ${c.id} | ${c.deck} | ${c.played} | ${pct(c.playRate)} | ${pct(c.winRateWhenPlayed)} | ${pct(c.winRateWhenHeldUnplayed)} | ${c.delta === null ? 'n/a' : `${(c.delta * 100).toFixed(1)} pts`} |`);
    L.push('');
  }
  for (const b of r.results.bots) {
    const rows = r.results.keywords[b.bot] ?? [];
    if (rows.length === 0) continue;
    L.push(`## Keyword exposure (${b.bot})`, '', 'Summons of a monster carrying the keyword. Trigger counts are not measured (see below).', '', '| Keyword | Games | Summons | Win rate of those games |', '| --- | --- | --- | --- |');
    for (const k of rows) L.push(`| ${k.id} | ${k.games} | ${k.summons} | ${pct(k.winRateWhenSummoned)} |`);
    L.push('');
  }

  L.push('## Performance', '');
  L.push(`- workers: ${r.perf.workers}; duels: ${r.perf.duels}; wall ${dec(r.perf.wallSeconds, 1)} s; ${dec(r.perf.duelsPerSecond, 0)} duels/s; **${dec(r.perf.duelsPerSecondPerCore, 0)} duels/s/core** (target at least ${g.PERF_DUELS_PER_SEC_PER_CORE})`);
  for (const b of r.perf.byBot) L.push(`- ${b.bot}: ${b.duels} duels, ${dec(b.busySeconds, 1)} s of worker time, ${dec(b.duelsPerSecondPerCore, 0)} duels/s/core`);
  if (r.perf.seedCheck !== null) L.push(`- difficulty check: ${r.perf.seedCheck.duels} duels, wall ${dec(r.perf.seedCheck.wallSeconds, 1)} s, ${dec(r.perf.seedCheck.duelsPerSecondPerCore, 0)} duels/s/core`);
  L.push('', '## Not measured', '', ...r.results.notMeasured.map((n) => `- ${n}`), '');
  return L.join('\n');
}

/** Writes `<dir>/<command>-<date>.md` and `.json`; returns both paths. */
export function writeReport(report: Report, dir: string): { md: string; json: string } {
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `${report.command}-${report.date}`);
  writeFileSync(`${base}.md`, renderMarkdown(report));
  writeFileSync(`${base}.json`, `${stableJson(report)}\n`);
  return { md: `${base}.md`, json: `${base}.json` };
}
