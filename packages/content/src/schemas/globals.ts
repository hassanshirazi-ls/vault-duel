// GlobalsSchema (ARCHITECTURE.md §10.2, §10.3, §11, D-147, D-170, D-199): a strict zod object for every key of the
// engine's Globals, typed against it by `satisfies`, plus the globals sanity checks. Every number is ≥ 0 (signs are
// written outside the number, D-172). Rates lie in 0…1. Ranges and star cuts are ordered. APPRAISAL_ROUNDS lie in
// 1…MAX_ROUNDS. An inert global is pinned to its only supported value with pinned() (D-170, D-199).
import { z } from 'zod';
import type { Globals } from '@vault-duel/engine';

/** Problem and fix of every sanity refinement, in the §10.3 shape (D-199). */
const NON_NEGATIVE = { message: 'must be 0 or more', params: { fix: 'use 0 or more' } } as const;
const RATE = { message: 'must be between 0 and 1', params: { fix: 'use a rate from 0 to 1' } } as const;

/** A whole number, 0 or more. */
const Int = z.int().refine((value) => value >= 0, NON_NEGATIVE);
/** A decimal, 0 or more; used only for the listed rates and ranges (D-199). */
const Decimal = z.number().refine((value) => value >= 0, NON_NEGATIVE);
/** A rate: a decimal from 0 to 1. */
const Rate = z.number().refine((value) => value >= 0 && value <= 1, RATE);

/**
 * An inert global (D-170): the engine reads it only at this value, so any other value would be a silent no-op.
 * The message and the fix share the §10.3 form: `globals.ts › KEY › must be V until the engine supports other values › keep V`.
 */
export function pinned(value: number): z.ZodType<number> {
  return z.int().refine((input) => input === value, {
    message: `must be ${value} until the engine supports other values`,
    params: { fix: `keep ${value}` },
  });
}

/** An inert flag (D-170, D-199): the engine reads it only at this value, so any other value would be a silent no-op. */
export function pinnedFlag(value: false): z.ZodType<boolean> {
  return z.boolean().refine((input) => input === value, {
    message: `must be ${value} until the engine supports other values`,
    params: { fix: `keep ${value}` },
  });
}

/**
 * BOARD_SLOTS is at most 16 (D-170). The engine packs a board location as side * LOC_STRIDE + slot, with
 * LOC_STRIDE = 16 in packages/engine/src/stats.ts, so a larger board would collide with the other side's slots.
 */
const BOARD_SLOTS_MAX = 16;
const BOARD_SLOTS_LIMIT = {
  message: `must be ${BOARD_SLOTS_MAX} or less, the engine's LOC_STRIDE`,
  params: { fix: `use ${BOARD_SLOTS_MAX} or less` },
} as const;

/** MAX_GRAFT_MATERIALS is 2 to 3 (D-170, D-199): the graft UI and preview handle only these counts. */
const GRAFT_RANGE = { message: 'must be from 2 to 3', params: { fix: 'use 2 or 3' } } as const;

/** A CONTENT_NUMBERS name (D-171): capitals, digits and underscores, the same shape as a $NAME ref. */
const CONTENT_NAME = /^[A-Z][A-Z0-9_]*$/;

/** A min/max pair; the sanity check of §10.3 (min ≤ max, both 0 or more). */
const Range = z
  .tuple([Decimal, Decimal])
  .superRefine((pair, ctx) => {
    if (pair[0] > pair[1]) {
      ctx.addIssue({
        code: 'custom',
        message: `min ${pair[0]} > max ${pair[1]}`,
        input: pair,
        params: { fix: 'write the pair as [min, max]' },
      });
    }
  });

/** Difficulty star cuts (D-098, D-126): two rates, the 1-star cut first and strictly higher than the 2-star cut. */
const StarCuts = z.tuple([Rate, Rate]).superRefine((cuts, ctx) => {
  if (!(cuts[0] > cuts[1])) {
    ctx.addIssue({
      code: 'custom',
      message: `cuts must descend, got [${cuts[0]}, ${cuts[1]}]`,
      input: cuts,
      params: { fix: 'write the higher (1-star) cut first' },
    });
  }
});

const Flags = z
  .object({
    ASCEND: z.boolean(),
    UNSTABLE: z.boolean(),
    APPRAISAL: z.boolean(),
    MOODS: z.boolean(),
    INTENTS: z.boolean(),
    WEEKLY_TWIST: z.boolean(),
    REDRAW: z.boolean(),
    BONUS_OBJECTIVES: z.boolean(),
    ANIMATIONS: z.boolean(),
    DEBUG_OVERLAY: z.boolean(),
    APPRAISED_ENTERS_GUARD: z.boolean(),
    ACE_SET_ASIDE: pinnedFlag(false), // D-184: pinned until the set-aside zone is wired
    CHIMERA_TO_HAND: z.boolean(),
  })
  .strict();

/** Every key of Globals (engine types/globals.ts), in §11 order. */
const GlobalsShape = z
  .object({
    // Identity & seeding
    CONTENT_VERSION: z.string().min(1),
    SEED_PREFIX: z.string().min(1),
    // Life & length
    PLAYER_LIFE: Int,
    COLLECTOR_LIFE: Int,
    MAX_ROUNDS: Int,
    // Decks
    COLLECTOR_DECK_SIZE: Int,
    DECK_MONSTERS: Int,
    DECK_SPELLS: Int,
    DECK_TRAPS: Int,
    MAX_COPIES: Int,
    // Hand, draw, turn
    OPENING_HAND: Int,
    HAND_SIZE: Int,
    MAX_DRAW_PER_TURN: Int,
    REDRAWS: Int,
    OPENING_MIN_MONSTERS: Int,
    FIRST_ATTACK_ROUND_PLAYER: Int,
    PLAYS_PER_TURN: pinned(1), // D-170, D-199: the engine does not read it yet; keep 1
    REPOSITIONS_PER_TURN: pinned(1), // D-170, D-199: the engine does not read it yet; keep 1
    ATTACKS_PER_TURN: pinned(1), // D-170, D-199: the engine does not read it yet; keep 1
    // Board
    BOARD_SLOTS: Int.refine((value) => value <= BOARD_SLOTS_MAX, BOARD_SLOTS_LIMIT), // D-170; LOC_STRIDE in the engine
    TRAP_SLOTS: Int,
    // Combat
    ELEMENT_BONUS: Int,
    STAT_FLOOR: Int,
    // Keywords & Flaws
    MAX_BASE_KEYWORDS: Int,
    MAX_INHERITED_KEYWORDS: Int,
    WARD_CHARGES: pinned(1), // D-133: one charge until the engine has a charge counter
    HAUNT_PENALTY: Int,
    TETHERED_PENALTY: Int,
    RELIC_FLAWS: Int,
    SLOW_TURNS: Int,
    // Graft
    MIN_GRAFT_MATERIALS: pinned(2), // D-170, D-199: a graft takes exactly two materials; keep 2
    MAX_GRAFT_MATERIALS: Int.refine((value) => value >= 2 && value <= 3, GRAFT_RANGE), // D-170, D-199: 2 to 3
    ASCEND_POWER: Int,
    ASCEND_GUARD: Int,
    UNSTABLE_BONUS: Int,
    UNSTABLE_EXPIRY_TURNS: Int,
    UNSTABLE_EXPIRY: z.enum(['endOfNextOwnTurn', 'startOfOwnTurnAfterNext']),
    // Stat budget & text
    STAT_BUDGET_MIN: Int,
    STAT_BUDGET_MAX: Int,
    KEYWORD_COST: Int,
    MAX_TEXT_SENTENCES: Int,
    // Player spells & traps
    // Collector spells & traps
    // Durations
    DURATION_NEXT_OWN_TURN: Int,
    // Appraisal
    APPRAISAL_ROUNDS: z.array(Int),
    APPRAISAL_MIN_POWER: Int,
    // Moods
    MOOD_AGITATED_AT: Int,
    MOOD_DESPERATE_AT: Int,
    // Collector AI numbers from DESIGN
    // Deck generation
    DECK_MIN_ELEMENTS: Int,
    DECK_MIN_KINDS: Int,
    CURVE_LOW_MAX_POWER: Int,
    CURVE_LOW_MIN_COUNT: Int,
    CURVE_HIGH_MIN_POWER: Int,
    CURVE_HIGH_MIN_COUNT: Int,
    DECKGEN_MAX_ATTEMPTS: Int,
    SHUFFLE_MAX_ATTEMPTS: Int,
    // Difficulty check
    SIM_RUNS_PER_SEED: Int,
    SEED_WINRATE_MIN: Rate,
    SEED_WINRATE_MAX: Rate,
    SEED_MAX_REROLLS: Int,
    BOT_NOISE_EPSILON: Rate,
    DIFFICULTY_STAR_CUTS: StarCuts,
    // Daily loop
    RESET_HOUR_LOCAL: Int,
    OBJECTIVES_PER_DAY: Int,
    OBJECTIVE_STARS_MAX: Int,
    // Balance targets
    TARGET_EXPERT_WINRATE: Range,
    TARGET_NOVICE_WINRATE: Range,
    TARGET_NOVICE_POINT: Rate,
    TARGET_MEDIAN_ROUNDS: Range,
    TARGET_TYPICAL_END_ROUNDS: Range,
    TARGET_FULL_LENGTH_SHARE: Range,
    TARGET_GRAFTS_PER_WIN: Range,
    TARGET_APPRAISAL_SUCCESS: Range,
    TARGET_UNPRICED_APPEARS: Range,
    TARGET_SEED_REJECT_MAX: Rate,
    TARGET_DUEL_MINUTES: Range,
    TARGET_RULES_LEARN_SECONDS: Int,
    // Simulator
    SIM_QUICK_GAMES: Int,
    SIM_FULL_GAMES: Int,
    SIM_SEED_CHECK_DATES: Int,
    PERF_DUELS_PER_SEC_PER_CORE: Int,
    // Engine safety
    MAX_TRIGGER_CHAIN: Int,
    // Feature flags
    FLAGS: Flags,
    // Content numbers (D-171): an open record; names must not repeat a core key (checked below).
    CONTENT_NUMBERS: z.record(z.string().regex(CONTENT_NAME, 'expected a name like UNMAKE_MAX_POWER'), Int),
  })
  .strict()
  .superRefine((globals, ctx) => {
    // D-171: a CONTENT_NUMBERS name must not repeat a core key, or the two namespaces would collide.
    for (const name of Object.keys(globals.CONTENT_NUMBERS)) {
      if (CORE_KEYS.includes(name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['CONTENT_NUMBERS', name],
          message: `${name} is already a core key of Globals`,
          input: name,
          params: { fix: `rename it, or change the core ${name} instead` },
        });
      }
    }
    // APPRAISAL_ROUNDS within 1…MAX_ROUNDS (§10.3). Reported on the key, not on each round.
    for (const round of globals.APPRAISAL_ROUNDS) {
      if (round < 1 || round > globals.MAX_ROUNDS) {
        ctx.addIssue({
          code: 'custom',
          path: ['APPRAISAL_ROUNDS'],
          message: round > globals.MAX_ROUNDS ? `round ${round} > MAX_ROUNDS=${globals.MAX_ROUNDS}` : `round ${round} < 1`,
          input: globals.APPRAISAL_ROUNDS,
          params: { fix: 'remove it' },
        });
      }
    }
    // D-199: the win-rate band is ordered (SEED_WINRATE_MIN ≤ SEED_WINRATE_MAX).
    if (globals.SEED_WINRATE_MAX < globals.SEED_WINRATE_MIN) {
      ctx.addIssue({
        code: 'custom',
        path: ['SEED_WINRATE_MAX'],
        message: `${globals.SEED_WINRATE_MAX} < SEED_WINRATE_MIN=${globals.SEED_WINRATE_MIN}`,
        input: globals.SEED_WINRATE_MAX,
        params: { fix: 'raise SEED_WINRATE_MAX or lower SEED_WINRATE_MIN' },
      });
    }
  }) satisfies z.ZodType<Globals>;
export const GlobalsSchema = GlobalsShape;

/** The core keys of Globals (every shape key except CONTENT_NUMBERS), for the clash check. */
const CORE_KEYS: readonly string[] = Object.keys(GlobalsShape.shape).filter((key) => key !== 'CONTENT_NUMBERS');

/** One sanity or schema problem in the §10.3 shape: entry = the globals key, field = the rest of the path. */
export interface GlobalsProblem {
  readonly key: string;
  readonly field: string;
  readonly problem: string;
  readonly fix: string;
}

/** Turns zod issues from GlobalsSchema into §10.3 records. Refinements may set params.fix. */
export function globalsProblems(error: z.ZodError): GlobalsProblem[] {
  return error.issues.map((issue) => {
    const [head, ...rest] = issue.path;
    const key = head === undefined ? '(globals)' : String(head);
    const field = rest.map((part) => (typeof part === 'number' ? `[${part}]` : String(part))).join('.');
    const params = 'params' in issue ? issue.params : undefined;
    const fix = params !== undefined && typeof params['fix'] === 'string' ? params['fix'] : 'fix the value in globals.ts';
    return { key, field, problem: issue.message, fix };
  });
}
