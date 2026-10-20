// ARCHITECTURE.md §11: every number and feature flag of the game. Shape is checked against the
// engine's `Globals` and `Flags` types (packages/engine/src/types/globals.ts) by `satisfies`.
import { deepFreeze } from '@vault-duel/engine';
import type { Flags, Globals } from '@vault-duel/engine';
import { GlobalsSchema, globalsProblems } from './schemas/globals';
import { formatError, type ContentError } from './files';

const FLAGS = {
  ASCEND: true,
  UNSTABLE: true,
  APPRAISAL: true,
  MOODS: true,
  INTENTS: true,
  WEEKLY_TWIST: false,
  REDRAW: true,
  BONUS_OBJECTIVES: true,
  ANIMATIONS: true,
  DEBUG_OVERLAY: false,
  // Proposal levers (DECISIONS §M): these defaults = DESIGN as written (CHIMERA_TO_HAND: true allows Echo/Grave
  // Recall of Chimeras per D-046/D-068; false = M-12). Changed only for sim A/B until the owner adopts one.
  APPRAISED_ENTERS_GUARD: false,
  ACE_SET_ASIDE: false,
  CHIMERA_TO_HAND: true,
  // D-281, D-282: LANES off = free targeting; LANE_SWAP is read only with LANES. On since the owner's 2026-10-16 flip
  LANES: true,
  LANE_SWAP: true,
  // D-305..D-316: bond rules. All off = the pre-flip rules (Graft is the one play); all on since the owner's 2026-10-16 flip
  // D-336: Split and Symbiosis are off for simple mode (kept in the engine for daily modes); Graft is the only bond
  SPLIT: false,
  SYMBIOSIS: false,
  BOND_ACTION: true,
  // D-335: one monster, one spell or trap and one bond per turn, any order; attacks close nothing. Off = the one-play turn
  TURN_SLOTS: true,
  // D-337: a guard that holds destroys the attacker. D-338: a face-down monster flipped to attack gets +AMBUSH_POWER until end of turn
  RIPOSTE: true,
  AMBUSH: true,
  // D-349: a monster taken by Appraisal (shown to players as a Levy) is crowned: +CROWN_POWER Power on his board
  CROWNED: true,
} as const satisfies Flags;

const GLOBAL_VALUES = {
  // Identity & seeding
  CONTENT_VERSION: '0.2.0',
  SEED_PREFIX: 'vault-duel',
  // Life & length
  PLAYER_LIFE: 20,
  COLLECTOR_LIFE: 40, // 25 before D-335: the turn slots give a skilled player much more than the Collector (docs/BALANCE_LOG.md)
  MAX_ROUNDS: 12,
  // Decks
  COLLECTOR_DECK_SIZE: 20,
  DECK_MONSTERS: 15,
  DECK_SPELLS: 5,
  DECK_TRAPS: 4,
  MAX_COPIES: 2,
  // Hand, draw, turn
  OPENING_HAND: 5,
  HAND_SIZE: 5,
  MAX_DRAW_PER_TURN: 2,
  REDRAWS: 1,
  OPENING_MIN_MONSTERS: 2,
  FIRST_ATTACK_ROUND_PLAYER: 2,
  PLAYS_PER_TURN: 1,
  REPOSITIONS_PER_TURN: 1,
  ATTACKS_PER_TURN: 1,
  // Board
  BOARD_SLOTS: 3,
  TRAP_SLOTS: 2,
  // Combat
  ELEMENT_BONUS: 2,
  STAT_FLOOR: 0,
  // Keywords & Flaws
  MAX_BASE_KEYWORDS: 1,
  MAX_INHERITED_KEYWORDS: 2,
  WARD_CHARGES: 1,
  HAUNT_PENALTY: 2,
  TETHERED_PENALTY: 2,
  RELIC_FLAWS: 1,
  SLOW_TURNS: 1, // 1 = DESIGN as written; 2 = proposal M-01
  // Rule changes of 2026-10-16 (D-280..D-287); shipped by the owner's 2026-10-16 flip (docs/BALANCE_LOG.md)
  SICKNESS_MODE: 'monstersOnly', // 'classic' | 'monstersOnly' (D-280)
  SENTINEL_REACH: 1, // read only with FLAGS.LANES (D-283)
  LANE_MOVE_RANGE: 1, // read only with FLAGS.LANES (D-282)
  // Bond rules (D-310)
  AMBUSH_POWER: 2, // D-338; read only with FLAGS.AMBUSH
  CROWN_POWER: 1, // D-349; read only with FLAGS.CROWNED
  SYMBIOSIS_GUARD_BONUS: 2, // read only with FLAGS.SYMBIOSIS (D-308)
  BOND_GRAFT_MAX_HAND_MATERIALS: 3, // 3 = MAX_GRAFT_MATERIALS = no limit; read only with FLAGS.BOND_ACTION (D-306)
  SPLIT_PART_PERM_P: 0, // read only with FLAGS.SPLIT (D-307)
  BONDS_PER_TURN: 1, // pinned (D-306)
  SYMBIOTES_PER_HOST: 1, // pinned (D-308)
  // Graft
  MIN_GRAFT_MATERIALS: 2,
  MAX_GRAFT_MATERIALS: 3,
  ASCEND_POWER: 2,
  ASCEND_GUARD: 1,
  UNSTABLE_BONUS: 3,
  UNSTABLE_EXPIRY_TURNS: 2, // destroyed at end of turn + 2 ("your next turn")
  UNSTABLE_EXPIRY: 'endOfNextOwnTurn', // DESIGN; 'startOfOwnTurnAfterNext' = proposal M-02
  // Stat budget & text
  STAT_BUDGET_MIN: 8,
  STAT_BUDGET_MAX: 10,
  KEYWORD_COST: 1,
  MAX_TEXT_SENTENCES: 1,
  // Durations (turn-index offsets)
  DURATION_NEXT_OWN_TURN: 2,
  // Appraisal
  APPRAISAL_ROUNDS: [3, 6, 9],
  APPRAISAL_MIN_POWER: 5, // 7 before the 2026-10-16 flip: Split and Symbiosis kept monsters under 7 (docs/BALANCE_LOG.md)
  // Moods (Composed = above AGITATED_AT)
  MOOD_AGITATED_AT: 15,
  MOOD_DESPERATE_AT: 7,
  // Deck generation
  DECK_MIN_ELEMENTS: 3,
  DECK_MIN_KINDS: 4,
  CURVE_LOW_MAX_POWER: 5,
  CURVE_LOW_MIN_COUNT: 4,
  CURVE_HIGH_MIN_POWER: 6,
  CURVE_HIGH_MIN_COUNT: 3,
  DECKGEN_MAX_ATTEMPTS: 1000,
  SHUFFLE_MAX_ATTEMPTS: 1000,
  // Difficulty check
  SIM_RUNS_PER_SEED: 500,
  SEED_WINRATE_MIN: 0.3,
  SEED_WINRATE_MAX: 0.7,
  SEED_MAX_REROLLS: 20,
  BOT_NOISE_EPSILON: 0.1,
  DIFFICULTY_STAR_CUTS: [0.5667, 0.4333],
  // Daily loop
  RESET_HOUR_LOCAL: 0,
  OBJECTIVES_PER_DAY: 3,
  // Balance targets (sim report pass/fail)
  TARGET_EXPERT_WINRATE: [0.45, 0.55],
  TARGET_NOVICE_WINRATE: [0.2, 0.3],
  TARGET_NOVICE_POINT: 0.25,
  TARGET_MEDIAN_ROUNDS: [9, 11],
  TARGET_TYPICAL_END_ROUNDS: [8, 12],
  TARGET_FULL_LENGTH_SHARE: [0.15, 0.3],
  TARGET_GRAFTS_PER_WIN: [1.5, 3],
  TARGET_APPRAISAL_SUCCESS: [0.3, 0.6],
  TARGET_UNPRICED_APPEARS: [0.2, 0.4],
  TARGET_SEED_REJECT_MAX: 0.15,
  TARGET_DUEL_MINUTES: [3, 5],
  TARGET_RULES_LEARN_SECONDS: 60,
  // Simulator
  SIM_QUICK_GAMES: 2000,
  SIM_FULL_GAMES: 50000,
  SIM_SEED_CHECK_DATES: 60,
  PERF_DUELS_PER_SEC_PER_CORE: 1000,
  // Engine safety
  MAX_TRIGGER_CHAIN: 64,
  // Collector AI (D-211): the win search's node cap, a safety cap read by `ai`
  AI_SEARCH_NODE_BUDGET: 600,
  // Feature flags
  FLAGS,
  // Content numbers (D-171): referenced only as "$NAME" from data or keyword effects, and as {NAME} in text.
  // Open record: add a line for a new card number. Names must not repeat a core key.
  CONTENT_NUMBERS: {
    // Player spells & traps
    UNMAKE_MAX_POWER: 5, BLOODLUST_POWER: 3, SCRYING_DRAW: 2, SIPHON_DRAIN: 3, SIPHON_GAIN: 3, MIRROR_SIGIL_PENALTY: 3, LAST_RITES_DRAW: 1,
    // Collector spells & traps
    PROVENANCE_DRAW: 2, GILT_POWER: 2, GILT_GUARD: 2, FORFEIT_MAX_POWER: 4, COUNTERFEIT_PENALTY: 3, INSURANCE_HEAL: 3,
    // Objectives
    OBJ_HIGH_LIFE: 15, OBJ_WIN_BY_ROUND: 8,
    // Collector AI params
    AI_FACEDOWN_ATTACK_MIN_POWER: 7,
  },
} as const satisfies Globals;

export const DEFAULT_GLOBALS: Globals = deepFreeze(GLOBAL_VALUES);

// CONTENT_NUMBERS is not a core key: a --set reaches its entries by name, never the whole record (D-171).
const GLOBAL_KEYS: readonly string[] = Object.keys(GlobalsSchema.shape).filter((key) => key !== 'CONTENT_NUMBERS');
const FLAG_KEYS: readonly string[] = Object.keys(GlobalsSchema.shape.FLAGS.shape);
const CONTENT_PREFIX = 'CONTENT_NUMBERS.';

/** A VALUE is parsed as JSON; text that is not JSON (a bare word) stays a string. */
function parseOverrideValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A failed override (D-199). `errors` are §10.3 records with file `globals.ts`, one per problem, and `message` is those
 * records rendered as lines, so the sim CLI can print them and the web dev build can show them like content errors.
 */
export class OverridesError extends Error {
  readonly errors: readonly ContentError[];

  constructor(errors: readonly ContentError[]) {
    super(errors.map(formatError).join('\n'));
    this.name = 'OverridesError';
    this.errors = errors;
  }
}

/** A whole-object override of these keys would add or replace many entries at once, so each is set by name (D-199). */
const WHOLE_OBJECT_KEYS: Readonly<Record<string, string>> = {
  FLAGS: 'FLAGS.<NAME>=<value>',
  CONTENT_NUMBERS: 'CONTENT_NUMBERS.<NAME>=<value>',
};

/**
 * ARCHITECTURE.md §11, D-147, D-171, D-199. Applies "KEY=VALUE" and "FLAGS.KEY=VALUE" overrides to `base` in order, e.g.
 * "PLAYER_LIFE=18", "FLAGS.ASCEND=false", "APPRAISAL_ROUNDS=[3,6]". Unknown keys are rejected, and so are whole-object
 * overrides of FLAGS and CONTENT_NUMBERS. The merged object is validated with GlobalsSchema and returned deep-frozen.
 * Every problem is collected into one OverridesError. Card overrides ("card.<id>.power") are handled by sim/overrides.ts.
 */
export function withOverrides(base: Globals, sets: readonly string[]): Globals {
  const problems: ContentError[] = [];
  const problem = (id: string, text: string, fix: string): void => {
    problems.push({ file: 'globals.ts', id, field: '', problem: text, fix });
  };
  const merged: Record<string, unknown> = { ...base };
  for (const set of sets) {
    const eq = set.indexOf('=');
    if (eq <= 0) {
      problem(`"${set}"`, 'not in KEY=VALUE form', 'write it as KEY=VALUE');
      continue;
    }
    const key = set.slice(0, eq);
    const value = parseOverrideValue(set.slice(eq + 1));
    const whole = Object.hasOwn(WHOLE_OBJECT_KEYS, key) ? WHOLE_OBJECT_KEYS[key] : undefined;
    if (whole !== undefined) {
      problem(key, 'set one entry at a time', `write ${whole}`);
      continue;
    }
    if (key.startsWith('FLAGS.')) {
      const flag = key.slice('FLAGS.'.length);
      if (!FLAG_KEYS.includes(flag)) {
        problem(key, 'unknown flag', `use one of: ${FLAG_KEYS.join(', ')}`);
        continue;
      }
      const current = isRecord(merged['FLAGS']) ? merged['FLAGS'] : {};
      merged['FLAGS'] = { ...current, [flag]: value };
    } else if (GLOBAL_KEYS.includes(key)) {
      merged[key] = value;
    } else {
      // D-171: NAME=V routes to CONTENT_NUMBERS when NAME is there; "CONTENT_NUMBERS.NAME=V" is the explicit form.
      const name = key.startsWith(CONTENT_PREFIX) ? key.slice(CONTENT_PREFIX.length) : key;
      if (Object.hasOwn(base.CONTENT_NUMBERS, name)) {
        const current = isRecord(merged['CONTENT_NUMBERS']) ? merged['CONTENT_NUMBERS'] : {};
        merged['CONTENT_NUMBERS'] = { ...current, [name]: value };
      } else {
        problem(key, 'unknown key', 'use a key from globals.ts or a name already in CONTENT_NUMBERS');
      }
    }
  }
  if (problems.length > 0) throw new OverridesError(problems);

  const result = GlobalsSchema.safeParse(merged);
  if (!result.success) {
    const errors = globalsProblems(result.error).map(
      (p): ContentError => ({ file: 'globals.ts', id: p.key, field: p.field, problem: p.problem, fix: p.fix }),
    );
    throw new OverridesError(errors);
  }
  return deepFreeze(result.data);
}
