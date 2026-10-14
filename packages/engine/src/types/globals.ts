// ARCHITECTURE.md §11: the type of globals. Values live in packages/content/src/globals.ts.
export interface Flags {
  readonly ASCEND: boolean;
  readonly UNSTABLE: boolean;
  readonly APPRAISAL: boolean;
  readonly MOODS: boolean;
  readonly INTENTS: boolean;
  readonly WEEKLY_TWIST: boolean;
  readonly REDRAW: boolean;
  readonly BONUS_OBJECTIVES: boolean;
  readonly ANIMATIONS: boolean;
  readonly DEBUG_OVERLAY: boolean;
  readonly APPRAISED_ENTERS_GUARD: boolean;
  readonly ACE_SET_ASIDE: boolean;
  readonly CHIMERA_TO_HAND: boolean;
}

export type Range = readonly [number, number];
export type StarCuts = readonly [number, number];

export interface Globals {
  // Identity & seeding
  readonly CONTENT_VERSION: string;
  readonly SEED_PREFIX: string;
  // Life & length
  readonly PLAYER_LIFE: number;
  readonly COLLECTOR_LIFE: number;
  readonly MAX_ROUNDS: number;
  // Decks
  readonly PLAYER_DECK_SIZE: number;
  readonly COLLECTOR_DECK_SIZE: number;
  readonly COLLECTOR_DECK_MONSTERS: number;
  readonly COLLECTOR_DECK_SPELLS: number;
  readonly COLLECTOR_DECK_TRAPS: number;
  readonly DECK_MONSTERS: number;
  readonly DECK_SPELLS: number;
  readonly DECK_TRAPS: number;
  readonly MAX_COPIES: number;
  readonly POOL_MONSTERS: number;
  readonly POOL_SPELLS: number;
  readonly POOL_TRAPS: number;
  // Hand, draw, turn
  readonly OPENING_HAND: number;
  readonly HAND_SIZE: number;
  readonly MAX_DRAW_PER_TURN: number;
  readonly REDRAWS: number;
  readonly OPENING_MIN_MONSTERS: number;
  readonly FIRST_ATTACK_ROUND_PLAYER: number;
  readonly PLAYS_PER_TURN: number;
  readonly REPOSITIONS_PER_TURN: number;
  readonly ATTACKS_PER_TURN: number;
  // Board
  readonly BOARD_SLOTS: number;
  readonly TRAP_SLOTS: number;
  // Combat
  readonly ELEMENT_BONUS: number;
  readonly STAT_FLOOR: number;
  // Keywords & Flaws
  readonly MAX_BASE_KEYWORDS: number;
  readonly MAX_INHERITED_KEYWORDS: number;
  readonly WARD_CHARGES: number;
  readonly HAUNT_PENALTY: number;
  readonly TETHERED_PENALTY: number;
  readonly RELIC_FLAWS: number;
  readonly SLOW_TURNS: number;
  // Graft
  readonly MIN_GRAFT_MATERIALS: number;
  readonly MAX_GRAFT_MATERIALS: number;
  readonly ASCEND_POWER: number;
  readonly ASCEND_GUARD: number;
  readonly UNSTABLE_BONUS: number;
  readonly UNSTABLE_EXPIRY_TURNS: number;
  readonly UNSTABLE_EXPIRY: 'endOfNextOwnTurn' | 'startOfOwnTurnAfterNext';
  // Stat budget & text
  readonly STAT_BUDGET_MIN: number;
  readonly STAT_BUDGET_MAX: number;
  readonly KEYWORD_COST: number;
  readonly MAX_TEXT_SENTENCES: number;
  // Player spells & traps
  readonly UNMAKE_MAX_POWER: number;
  readonly BLOODLUST_POWER: number;
  readonly SCRYING_DRAW: number;
  readonly SIPHON_DRAIN: number;
  readonly SIPHON_GAIN: number;
  readonly MIRROR_SIGIL_PENALTY: number;
  readonly LAST_RITES_DRAW: number;
  // Collector spells & traps
  readonly PROVENANCE_DRAW: number;
  readonly GILT_POWER: number;
  readonly GILT_GUARD: number;
  readonly FORFEIT_MAX_POWER: number;
  readonly COUNTERFEIT_PENALTY: number;
  readonly INSURANCE_HEAL: number;
  // Durations
  readonly DURATION_NEXT_OWN_TURN: number;
  // Appraisal
  readonly APPRAISAL_ROUNDS: readonly number[];
  readonly APPRAISAL_MIN_POWER: number;
  // Moods
  readonly MOOD_AGITATED_AT: number;
  readonly MOOD_DESPERATE_AT: number;
  // Collector AI numbers from DESIGN
  readonly AI_FACEDOWN_ATTACK_MIN_POWER: number;
  // Deck generation
  readonly DECK_MIN_ELEMENTS: number;
  readonly DECK_MIN_KINDS: number;
  readonly CURVE_LOW_MAX_POWER: number;
  readonly CURVE_LOW_MIN_COUNT: number;
  readonly CURVE_HIGH_MIN_POWER: number;
  readonly CURVE_HIGH_MIN_COUNT: number;
  readonly DECKGEN_MAX_ATTEMPTS: number;
  readonly SHUFFLE_MAX_ATTEMPTS: number;
  // Difficulty check
  readonly SIM_RUNS_PER_SEED: number;
  readonly SEED_WINRATE_MIN: number;
  readonly SEED_WINRATE_MAX: number;
  readonly SEED_MAX_REROLLS: number;
  readonly BOT_NOISE_EPSILON: number;
  readonly DIFFICULTY_STAR_CUTS: StarCuts;
  // Daily loop
  readonly RESET_HOUR_LOCAL: number;
  readonly OBJECTIVES_PER_DAY: number;
  readonly OBJECTIVE_STARS_MAX: number;
  readonly OBJ_HIGH_LIFE: number;
  readonly OBJ_WIN_BY_ROUND: number;
  // Balance targets
  readonly TARGET_EXPERT_WINRATE: Range;
  readonly TARGET_NOVICE_WINRATE: Range;
  readonly TARGET_NOVICE_POINT: number;
  readonly TARGET_MEDIAN_ROUNDS: Range;
  readonly TARGET_TYPICAL_END_ROUNDS: Range;
  readonly TARGET_FULL_LENGTH_SHARE: Range;
  readonly TARGET_GRAFTS_PER_WIN: Range;
  readonly TARGET_APPRAISAL_SUCCESS: Range;
  readonly TARGET_UNPRICED_APPEARS: Range;
  readonly TARGET_SEED_REJECT_MAX: number;
  readonly TARGET_DUEL_MINUTES: Range;
  readonly TARGET_RULES_LEARN_SECONDS: number;
  // Simulator
  readonly SIM_QUICK_GAMES: number;
  readonly SIM_FULL_GAMES: number;
  readonly SIM_SEED_CHECK_DATES: number;
  readonly PERF_DUELS_PER_SEC_PER_CORE: number;
  // Engine safety
  readonly MAX_TRIGGER_CHAIN: number;
  // Feature flags
  readonly FLAGS: Flags;
}

export type NumericGlobal = { [K in keyof Globals]: Globals[K] extends number ? K : never }[keyof Globals];
