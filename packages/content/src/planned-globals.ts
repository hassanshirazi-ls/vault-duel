// Planned globals (ARCHITECTURE.md §11, D-205): every core global and flag whose reader is a module that isn't built yet.
// A planned global is not pinned, so any sane value is accepted and takes effect when its reader lands. The reader
// tripwire (test/globals-readers.test.ts) keeps this list true: delete a line in the change that wires the reader.
// Browser-safe: no node:* import. Flags are written FLAGS.<NAME>.

export interface PlannedGlobal {
  readonly reader: 'engine' | 'ai' | 'sim' | 'web';
  readonly where: string;
}

export const PLANNED_GLOBALS: Readonly<Record<string, PlannedGlobal>> = {
  OBJECTIVES_PER_DAY: { reader: 'ai', where: 'ai/difficulty.ts › prepareDay (D-102)' },
  OBJECTIVE_STARS_MAX: { reader: 'engine', where: 'engine meta/objectives.ts (D-102)' },
  RESET_HOUR_LOCAL: { reader: 'web', where: 'web daily/date.ts (D-104)' },
  'FLAGS.BONUS_OBJECTIVES': { reader: 'engine', where: 'engine meta/objectives.ts (BO-1)' },
  'FLAGS.ANIMATIONS': { reader: 'web', where: 'web duel store (§16)' },
  'FLAGS.DEBUG_OVERLAY': { reader: 'web', where: 'web debug overlay (§16)' },
  // ai: the difficulty check (§15, DC-1 to DC-3). SIM_RUNS_PER_SEED is the duels per seed in rateSeed.
  // ai: the Collector's win search stops at this many nodes (D-082, D-211). It is a safety cap; the cap never binds at launch.
  AI_SEARCH_NODE_BUDGET: { reader: 'ai', where: 'ai/collector/win-search.ts › node budget (D-082, D-211)' },
  SIM_RUNS_PER_SEED: { reader: 'ai', where: 'ai/difficulty.ts › rateSeed (DC-1)' },
  SEED_WINRATE_MIN: { reader: 'ai', where: 'ai/difficulty.ts › rateSeed (DC-2)' },
  SEED_WINRATE_MAX: { reader: 'ai', where: 'ai/difficulty.ts › rateSeed (DC-2)' },
  SEED_MAX_REROLLS: { reader: 'ai', where: 'ai/difficulty.ts › rateSeed (DC-2)' },
  BOT_NOISE_EPSILON: { reader: 'ai', where: 'ai/bots/noise.ts (DC-1)' },
  DIFFICULTY_STAR_CUTS: { reader: 'ai', where: 'ai/difficulty.ts › rateSeed (DC-3)' },
  // sim: the quick, full and seed runs, and the balance report (§15).
  SIM_QUICK_GAMES: { reader: 'sim', where: 'sim/src/cli.ts › quick (§15)' },
  SIM_FULL_GAMES: { reader: 'sim', where: 'sim/src/cli.ts › full (§15)' },
  SIM_SEED_CHECK_DATES: { reader: 'sim', where: 'sim/src/cli.ts › full --seed-dates (§15)' },
  TARGET_EXPERT_WINRATE: { reader: 'sim', where: 'sim/report.ts (BT-1)' },
  TARGET_NOVICE_WINRATE: { reader: 'sim', where: 'sim/report.ts (BT-2)' },
  TARGET_NOVICE_POINT: { reader: 'sim', where: 'sim/report.ts (BT-2)' },
  TARGET_MEDIAN_ROUNDS: { reader: 'sim', where: 'sim/report.ts (BT-3)' },
  TARGET_TYPICAL_END_ROUNDS: { reader: 'sim', where: 'sim/report.ts (BT-3)' },
  TARGET_FULL_LENGTH_SHARE: { reader: 'sim', where: 'sim/report.ts (BT-4)' },
  TARGET_GRAFTS_PER_WIN: { reader: 'sim', where: 'sim/report.ts (BT-5)' },
  TARGET_APPRAISAL_SUCCESS: { reader: 'sim', where: 'sim/report.ts (BT-6)' },
  TARGET_UNPRICED_APPEARS: { reader: 'sim', where: 'sim/report.ts (BT-7)' },
  TARGET_SEED_REJECT_MAX: { reader: 'sim', where: 'sim/difficulty-batch.ts (BT-8)' },
  TARGET_DUEL_MINUTES: { reader: 'sim', where: 'sim/report.ts (§15)' },
  TARGET_RULES_LEARN_SECONDS: { reader: 'sim', where: 'sim/report.ts (§15)' },
  PERF_DUELS_PER_SEC_PER_CORE: { reader: 'sim', where: 'sim/report.ts › duels per second per core (measurement)' },
};
