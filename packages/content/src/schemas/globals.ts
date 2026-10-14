// GlobalsSchema (ARCHITECTURE.md §10.2, §10.3, §11, D-147): a strict zod object for every key of the engine's
// Globals, typed against it by `satisfies`, plus the globals sanity checks: every Range has min ≤ max,
// APPRAISAL_ROUNDS lie in 1…MAX_ROUNDS, and WARD_CHARGES is 1 until the engine has a charge counter (D-133).
import { z } from 'zod';
import type { Globals } from '@vault-duel/engine';

const Int = z.int();
const Decimal = z.number();

/** A min/max pair; the sanity check of §10.3 (min ≤ max). */
const Range = z
  .tuple([z.number(), z.number()])
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
    ACE_SET_ASIDE: z.boolean(),
    CHIMERA_TO_HAND: z.boolean(),
  })
  .strict();

/** Every key of Globals (engine types/globals.ts), in §11 order. */
export const GlobalsSchema = z
  .object({
    // Identity & seeding
    CONTENT_VERSION: z.string().min(1),
    SEED_PREFIX: z.string().min(1),
    // Life & length
    PLAYER_LIFE: Int,
    COLLECTOR_LIFE: Int,
    MAX_ROUNDS: Int,
    // Decks
    PLAYER_DECK_SIZE: Int,
    COLLECTOR_DECK_SIZE: Int,
    COLLECTOR_DECK_MONSTERS: Int,
    COLLECTOR_DECK_SPELLS: Int,
    COLLECTOR_DECK_TRAPS: Int,
    DECK_MONSTERS: Int,
    DECK_SPELLS: Int,
    DECK_TRAPS: Int,
    MAX_COPIES: Int,
    POOL_MONSTERS: Int,
    POOL_SPELLS: Int,
    POOL_TRAPS: Int,
    // Hand, draw, turn
    OPENING_HAND: Int,
    HAND_SIZE: Int,
    MAX_DRAW_PER_TURN: Int,
    REDRAWS: Int,
    OPENING_MIN_MONSTERS: Int,
    FIRST_ATTACK_ROUND_PLAYER: Int,
    PLAYS_PER_TURN: Int,
    REPOSITIONS_PER_TURN: Int,
    ATTACKS_PER_TURN: Int,
    // Board
    BOARD_SLOTS: Int,
    TRAP_SLOTS: Int,
    // Combat
    ELEMENT_BONUS: Int,
    STAT_FLOOR: Int,
    // Keywords & Flaws
    MAX_BASE_KEYWORDS: Int,
    MAX_INHERITED_KEYWORDS: Int,
    WARD_CHARGES: Int.refine((value) => value === 1, {
      message: 'WARD_CHARGES must be 1 until the engine has a charge counter (D-133)',
    }),
    HAUNT_PENALTY: Int,
    TETHERED_PENALTY: Int,
    RELIC_FLAWS: Int,
    SLOW_TURNS: Int,
    // Graft
    MIN_GRAFT_MATERIALS: Int,
    MAX_GRAFT_MATERIALS: Int,
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
    UNMAKE_MAX_POWER: Int,
    BLOODLUST_POWER: Int,
    SCRYING_DRAW: Int,
    SIPHON_DRAIN: Int,
    SIPHON_GAIN: Int,
    MIRROR_SIGIL_PENALTY: Int,
    LAST_RITES_DRAW: Int,
    // Collector spells & traps
    PROVENANCE_DRAW: Int,
    GILT_POWER: Int,
    GILT_GUARD: Int,
    FORFEIT_MAX_POWER: Int,
    COUNTERFEIT_PENALTY: Int,
    INSURANCE_HEAL: Int,
    // Durations
    DURATION_NEXT_OWN_TURN: Int,
    // Appraisal
    APPRAISAL_ROUNDS: z.array(Int),
    APPRAISAL_MIN_POWER: Int,
    // Moods
    MOOD_AGITATED_AT: Int,
    MOOD_DESPERATE_AT: Int,
    // Collector AI numbers from DESIGN
    AI_FACEDOWN_ATTACK_MIN_POWER: Int,
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
    SEED_WINRATE_MIN: Decimal,
    SEED_WINRATE_MAX: Decimal,
    SEED_MAX_REROLLS: Int,
    BOT_NOISE_EPSILON: Decimal,
    DIFFICULTY_STAR_CUTS: z.tuple([Decimal, Decimal]),
    // Daily loop
    RESET_HOUR_LOCAL: Int,
    OBJECTIVES_PER_DAY: Int,
    OBJECTIVE_STARS_MAX: Int,
    OBJ_HIGH_LIFE: Int,
    OBJ_WIN_BY_ROUND: Int,
    // Balance targets
    TARGET_EXPERT_WINRATE: Range,
    TARGET_NOVICE_WINRATE: Range,
    TARGET_NOVICE_POINT: Decimal,
    TARGET_MEDIAN_ROUNDS: Range,
    TARGET_TYPICAL_END_ROUNDS: Range,
    TARGET_FULL_LENGTH_SHARE: Range,
    TARGET_GRAFTS_PER_WIN: Range,
    TARGET_APPRAISAL_SUCCESS: Range,
    TARGET_UNPRICED_APPEARS: Range,
    TARGET_SEED_REJECT_MAX: Decimal,
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
  })
  .strict()
  .superRefine((globals, ctx) => {
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
  }) satisfies z.ZodType<Globals>;

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
