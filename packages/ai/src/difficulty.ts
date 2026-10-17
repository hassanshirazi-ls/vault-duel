// The daily difficulty check and the day's setup (ARCHITECTURE.md §12.5, §15; DC-1 to DC-3; D-003, D-004, D-094, D-098,
// D-100, D-102, D-103). `rateSeed` runs the expert with decision noise against the Collector on a seed, rerolling `k` until the
// win rate falls in the accepted band; `prepareDay` wraps it with the deck, signature, objectives and twist of the day.
// Every number comes from the compiled globals. The result depends only on (date, content, globals, expert weights).
import { activeSide, canonicalJson, createEngine, cyrb128, deckForSeed, rerollSeed, seedString, Sfc32, signatureForSeed } from '@vault-duel/engine';
import type { Engine, GameState, Globals } from '@vault-duel/engine';
import type { GameContent } from '@vault-duel/content';
import { createExpert, EXPERT_BOND_WEIGHTS, EXPERT_WEIGHTS } from './bots/expert';
import { createNoise, noiseKey } from './bots/noise';
import { botAction } from './bots/player-view';
import { createCollector } from './collector/policy';
import type { Collector } from './collector/policy';

/** What the check needs: the compiled content, the globals, and the ids of `objectives.json` (the compiled content has no objectives). */
export interface DayContext {
  readonly content: GameContent;
  readonly globals: Globals;
  readonly objectiveIds: readonly string[];
}

/** One duel of the check: fully determined by its job (ARCHITECTURE.md §15). */
export interface DuelJob {
  /** the daily seed string without `#k` */
  readonly seedString: string;
  readonly k: number;
  readonly runIndex: number;
  /** the weekly twist index or -1 */
  readonly twist: number;
}

export interface DuelOutcome {
  readonly won: boolean;
  /** the round the duel ended in */
  readonly round: number;
}

export type DuelRunner = (job: DuelJob) => DuelOutcome;

export interface Candidate {
  readonly k: number;
  readonly winRate: number;
  readonly stars: 1 | 2 | 3;
  readonly par: number;
}

export interface SeedRating extends Candidate {
  /** "fallback": no reroll passed, so the candidate nearest the middle of the band was kept (D-004) */
  readonly check: 'accepted' | 'fallback';
  /** every candidate tried, in order of k */
  readonly tried: readonly Candidate[];
}

export interface DailySetup {
  readonly date: string;
  /** `SEED_PREFIX:date:CONTENT_VERSION`; the duel's seed is `seedString#k` (D-001, D-003) */
  readonly seedString: string;
  readonly k: number;
  /** card ids of the player's deck, in the engine's deck-list order (D-006) */
  readonly deckList: readonly string[];
  /** a monster id of the deck (D-010) */
  readonly signature: string;
  /** OBJECTIVES_PER_DAY distinct objective ids (D-102) */
  readonly objectives: readonly string[];
  /** index into the content's twists, or -1 (D-103) */
  readonly twist: number;
  /** hash of the expert's weights and search bounds: the check's result depends on them (D-222), so a cache or a shipped `seeds/<date>.json` must match it */
  readonly expertHash: string;
  readonly difficulty: {
    readonly winRate: number;
    readonly stars: 1 | 2 | 3;
    readonly par: number;
    readonly check: 'accepted' | 'fallback';
  };
}

// ---- the check ----------------------------------------------------------------------------------------------------

/** The reference duel: the expert with noise on side 0 against the Collector, on a trusted engine without events or log. */
export function expertRunner(ctx: Pick<DayContext, 'content' | 'globals'>): DuelRunner {
  const { content, globals } = ctx;
  const collector: Collector = createCollector({ content, globals });
  const engine: Engine = createEngine(content, globals, { intent: collector.intentPolicy }, { events: false, log: false, trusted: true });
  return (job) => {
    const bot = createExpert({ noise: createNoise(noiseKey(job.seedString, job.k, job.runIndex), globals.BOT_NOISE_EPSILON) });
    let s: GameState = engine.newGame(rerollSeed(job.seedString, job.k), { twist: job.twist }).state;
    while (s.result === null) {
      const mine = activeSide(s) === 0 || s.step === 'mulligan';
      s = engine.applyAction(s, mine ? botAction(bot, collector.brain, s) : collector.act(s)).state;
    }
    return { won: s.result.winner === 0, round: s.result.round };
  };
}

/**
 * A hash of everything in expert.weights.json, as hex. With `bonds` (a bond switch is on, D-312) it also covers the bond
 * settings of bond.weights.json; without, it is the same value as before they existed, so a shipped manifest stays valid.
 */
export function expertHash(bonds = false): string {
  return cyrb128(canonicalJson(bonds ? EXPERT_BOND_WEIGHTS : EXPERT_WEIGHTS)).map((w) => w.toString(16).padStart(8, '0')).join('');
}

/** Is any bond switch on (FLAGS.SPLIT, FLAGS.SYMBIOSIS, FLAGS.BOND_ACTION)? */
const bondsOn = (g: Pick<Globals, 'FLAGS'>): boolean => g.FLAGS.SPLIT || g.FLAGS.SYMBIOSIS || g.FLAGS.BOND_ACTION;

/** D-236: what a day's rating depends on besides the date. A shipped seeds manifest or a cached rating is valid only when all three match. */
export interface CheckKey {
  readonly contentHash: string;
  readonly globalsHash: string;
  readonly expertHash: string;
}

export function checkKey(ctx: Pick<DayContext, 'content' | 'globals'>): CheckKey {
  const globalsHash = cyrb128(canonicalJson(ctx.globals)).map((w) => w.toString(16).padStart(8, '0')).join('');
  return { contentHash: ctx.content.hash, globalsHash, expertHash: expertHash(bondsOn(ctx.globals)) };
}

/** D-098: win rate at or above the first cut is easy (1 star), at or above the second is 2, below is 3. */
export function starsFor(g: Pick<Globals, 'DIFFICULTY_STAR_CUTS'>, winRate: number): 1 | 2 | 3 {
  const [easy, medium] = g.DIFFICULTY_STAR_CUTS;
  return winRate >= easy ? 1 : winRate >= medium ? 2 : 3;
}

/** D-100: the median winning round, halves rounded up; MAX_ROUNDS when the bot never won. */
export function parOf(g: Pick<Globals, 'MAX_ROUNDS'>, winningRounds: readonly number[]): number {
  if (winningRounds.length === 0) return g.MAX_ROUNDS;
  const sorted = [...winningRounds].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  return Math.floor(median + 0.5);
}

/**
 * DC-1 to DC-3, D-003, D-004: for k = 0 to SEED_MAX_REROLLS, run SIM_RUNS_PER_SEED duels and accept the first k whose
 * win rate is in [SEED_WINRATE_MIN, SEED_WINRATE_MAX]. If none is, keep the candidate nearest the middle of the band (the lowest k on a tie).
 * `run` defaults to the expert-with-noise duel; the simulator and the tests may supply their own.
 */
export function rateSeed(ctx: DayContext, base: string, twist: number, run: DuelRunner = expertRunner(ctx)): SeedRating {
  const g = ctx.globals;
  const tried: Candidate[] = [];
  let chosen: Candidate | null = null;
  for (let k = 0; k <= g.SEED_MAX_REROLLS && chosen === null; k++) {
    let wins = 0;
    const rounds: number[] = [];
    for (let runIndex = 0; runIndex < g.SIM_RUNS_PER_SEED; runIndex++) {
      const r = run({ seedString: base, k, runIndex, twist });
      if (r.won) {
        wins++;
        rounds.push(r.round);
      }
    }
    const winRate = wins / g.SIM_RUNS_PER_SEED;
    const c: Candidate = { k, winRate, stars: starsFor(g, winRate), par: parOf(g, rounds) };
    tried.push(c);
    if (winRate >= g.SEED_WINRATE_MIN && winRate <= g.SEED_WINRATE_MAX) chosen = c;
  }
  if (chosen !== null) return { ...chosen, check: 'accepted', tried };
  const middle = (g.SEED_WINRATE_MIN + g.SEED_WINRATE_MAX) / 2;
  let nearest = tried[0] as Candidate;
  for (const c of tried) if (Math.abs(c.winRate - middle) < Math.abs(nearest.winRate - middle)) nearest = c;
  return { ...nearest, check: 'fallback', tried };
}

// ---- the day ------------------------------------------------------------------------------------------------------

/** D-102: `n` distinct ids from the 'objectives' stream (a partial Fisher-Yates over the file's order). */
function pickObjectives(ids: readonly string[], n: number, seed: string): string[] {
  if (ids.length < n) throw new Error(`prepareDay: ${ids.length} objectives, ${n} needed`);
  const pool = [...ids];
  const rng = Sfc32.from(`${seed}/objectives`);
  for (let i = 0; i < n; i++) {
    const j = i + rng.int(pool.length - i);
    const x = pool[i] as string;
    pool[i] = pool[j] as string;
    pool[j] = x;
  }
  return pool.slice(0, n);
}

/** Days since 1970-01-01 of a proleptic Gregorian date (Hinnant's days_from_civil). No clock, no `Date`: the check is deterministic code. */
function dayNumber(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** The calendar year of a day number (the inverse of `dayNumber`, year only). */
function yearOf(days: number): number {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const month = Math.floor((5 * doy + 2) / 153) < 10 ? Math.floor((5 * doy + 2) / 153) + 3 : Math.floor((5 * doy + 2) / 153) - 9;
  return yoe + era * 400 + (month <= 2 ? 1 : 0);
}

/** The ISO 8601 week of a `YYYY-MM-DD` date, as `{ year, week }`: the week belongs to the year of its Thursday. */
export function isoWeekOf(date: string): { year: number; week: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const days = dayNumber(y, m, d);
  const mondayBased = (days + 3) % 7; // 1970-01-01 was a Thursday; Monday is 0
  const thursday = days - (mondayBased < 0 ? mondayBased + 7 : mondayBased) + 3;
  const year = yearOf(thursday);
  return { year, week: Math.floor((thursday - dayNumber(year, 1, 1)) / 7) + 1 };
}

/** D-103: the twist whose `isoWeek` matches, else the week number mod the list length; -1 when the flag is off or there are none. */
export function twistFor(content: GameContent, globals: Globals, date: string): number {
  if (!globals.FLAGS.WEEKLY_TWIST || content.twists.length === 0) return -1;
  const { year, week } = isoWeekOf(date);
  const label = `${year}-W${String(week).padStart(2, '0')}`;
  const named = content.twists.findIndex((t) => t.isoWeek === label);
  return named >= 0 ? named : week % content.twists.length;
}

/**
 * The day's setup for `date` (`YYYY-MM-DD`, the caller's local date, D-104). Deterministic: the same date, content, globals and
 * expert weights give the same result. `run` is the duel runner of the check (default: the expert with noise).
 */
export function prepareDay(ctx: DayContext, date: string, run?: DuelRunner): DailySetup {
  const { content, globals } = ctx;
  return daySetupFor(ctx, date, rateSeed(ctx, seedString(globals, date), twistFor(content, globals, date), run));
}

/**
 * D-236: the day's setup from an already-known rating (a shipped seeds manifest or a cache), without playing any duel.
 * `prepareDay(ctx, date)` equals `daySetupFor(ctx, date, rateSeed(...))`.
 */
export function daySetupFor(ctx: DayContext, date: string, rating: Pick<SeedRating, 'k' | 'winRate' | 'stars' | 'par' | 'check'>): DailySetup {
  const { content, globals } = ctx;
  const base = seedString(globals, date);
  const twist = twistFor(content, globals, date);
  const seed = rerollSeed(base, rating.k);
  const deck = deckForSeed(content, globals, seed);
  return {
    date,
    seedString: base,
    k: rating.k,
    deckList: deck.map((d) => content.ids[d] as string),
    signature: content.ids[signatureForSeed(content, deck, seed)] as string,
    objectives: pickObjectives(ctx.objectiveIds, globals.OBJECTIVES_PER_DAY, seed),
    twist,
    expertHash: expertHash(bondsOn(globals)),
    difficulty: { winRate: rating.winRate, stars: rating.stars, par: rating.par, check: rating.check },
  };
}
