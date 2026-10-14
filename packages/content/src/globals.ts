// ARCHITECTURE.md §11: every number and feature flag of the game. Shape is checked against the
// engine's `Globals` and `Flags` types (packages/engine/src/types/globals.ts) by `satisfies`.
import { deepFreeze } from '@vault-duel/engine';
import type { Flags, Globals } from '@vault-duel/engine';
import { GlobalsSchema, globalsProblems } from './schemas/globals';

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
} as const satisfies Flags;

const GLOBAL_VALUES = {
  // Identity & seeding
  CONTENT_VERSION: '0.1.0',
  SEED_PREFIX: 'vault-duel',
  // Life & length
  PLAYER_LIFE: 20,
  COLLECTOR_LIFE: 25,
  MAX_ROUNDS: 12,
  // Decks
  PLAYER_DECK_SIZE: 24,
  COLLECTOR_DECK_SIZE: 20,
  COLLECTOR_DECK_MONSTERS: 13,
  COLLECTOR_DECK_SPELLS: 4,
  COLLECTOR_DECK_TRAPS: 3,
  DECK_MONSTERS: 15,
  DECK_SPELLS: 5,
  DECK_TRAPS: 4,
  MAX_COPIES: 2,
  POOL_MONSTERS: 25, // validator warnings only
  POOL_SPELLS: 6, // validator warnings only
  POOL_TRAPS: 4, // validator warnings only
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
  // Player spells & traps
  UNMAKE_MAX_POWER: 5,
  BLOODLUST_POWER: 3,
  SCRYING_DRAW: 2,
  SIPHON_DRAIN: 3,
  SIPHON_GAIN: 3,
  MIRROR_SIGIL_PENALTY: 3,
  LAST_RITES_DRAW: 1,
  // Collector spells & traps
  PROVENANCE_DRAW: 2,
  GILT_POWER: 2,
  GILT_GUARD: 2,
  FORFEIT_MAX_POWER: 4,
  COUNTERFEIT_PENALTY: 3,
  INSURANCE_HEAL: 3,
  // Durations (turn-index offsets)
  DURATION_NEXT_OWN_TURN: 2,
  // Appraisal
  APPRAISAL_ROUNDS: [3, 6, 9],
  APPRAISAL_MIN_POWER: 7,
  // Moods (Composed = above AGITATED_AT)
  MOOD_AGITATED_AT: 15,
  MOOD_DESPERATE_AT: 7,
  // Collector AI numbers from DESIGN
  AI_FACEDOWN_ATTACK_MIN_POWER: 7,
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
  OBJECTIVE_STARS_MAX: 3,
  OBJ_HIGH_LIFE: 15,
  OBJ_WIN_BY_ROUND: 8,
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
  // Feature flags
  FLAGS,
} as const satisfies Globals;

export const DEFAULT_GLOBALS: Globals = deepFreeze(GLOBAL_VALUES);

const GLOBAL_KEYS: readonly string[] = Object.keys(GlobalsSchema.shape);
const FLAG_KEYS: readonly string[] = Object.keys(GlobalsSchema.shape.FLAGS.shape);

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
 * ARCHITECTURE.md §11, D-147. Applies "KEY=VALUE" and "FLAGS.KEY=VALUE" overrides to `base` in order, e.g.
 * "PLAYER_LIFE=18", "FLAGS.ASCEND=false", "APPRAISAL_ROUNDS=[3,6]". Unknown keys are rejected. The merged object
 * is validated with GlobalsSchema and returned deep-frozen. Throws one Error listing every problem, one per line,
 * in the §10.3 shape. Card overrides ("card.<id>.power") are not globals and are handled by sim/overrides.ts.
 */
export function withOverrides(base: Globals, sets: readonly string[]): Globals {
  const problems: string[] = [];
  const merged: Record<string, unknown> = { ...base };
  for (const set of sets) {
    const eq = set.indexOf('=');
    if (eq <= 0) {
      problems.push(`"${set}" › not in KEY=VALUE form › write it as KEY=VALUE`);
      continue;
    }
    const key = set.slice(0, eq);
    const value = parseOverrideValue(set.slice(eq + 1));
    if (key.startsWith('FLAGS.')) {
      const flag = key.slice('FLAGS.'.length);
      if (!FLAG_KEYS.includes(flag)) {
        problems.push(`globals.ts › ${key} › unknown flag › use one of: ${FLAG_KEYS.join(', ')}`);
        continue;
      }
      const current = isRecord(merged['FLAGS']) ? merged['FLAGS'] : {};
      merged['FLAGS'] = { ...current, [flag]: value };
    } else if (GLOBAL_KEYS.includes(key)) {
      merged[key] = value;
    } else {
      problems.push(`globals.ts › ${key} › unknown key › use a key from globals.ts`);
    }
  }
  if (problems.length > 0) throw new Error(problems.join('\n'));

  const result = GlobalsSchema.safeParse(merged);
  if (!result.success) {
    const lines = globalsProblems(result.error).map(
      (p) => `globals.ts › ${p.key} › ${p.field ? `${p.field}: ` : ''}${p.problem} › ${p.fix}`,
    );
    throw new Error(lines.join('\n'));
  }
  return deepFreeze(result.data);
}
