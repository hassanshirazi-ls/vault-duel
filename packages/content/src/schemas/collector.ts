// collector.json (ARCHITECTURE.md §10.1, §10.2, §13.2, D-097, D-145). The AI block is data consumed by ai/collector.
// Rule ids and string parameter values are closed enums (D-145): a typo fails content:check, and packages/ai
// tests that its rule registry matches AI_PLAY_RULES ∪ AI_ATTACK_RULES. Content never imports ai.
import { z } from 'zod';
import { Id, Num } from './common';

export const AI_PLAY_RULES = z.enum([
  'winThisTurn',
  'summonAce',
  'summonBeater',
  'setTrapWhenBehind',
  'castHighValueSpell',
  'summonFallback',
  'utility',
]);

export const AI_ATTACK_RULES = z.enum([
  'lethal',
  'killWithoutLoss',
  'faceDownIfStrong',
  'directIfEmpty',
  'holdExceptVain',
  'attackAnything',
]);

export const AI_REPOSITION = z.enum(['toAttackIfUsable', 'allAttack', 'laneAware']);

const AI_COMPARE_TRAP = z.enum(['fewer', 'fewerOrEqual']);
const AI_COMPARE_BEATER = z.enum(['previewAttack']);
const AI_POSITION = z.enum(['attack', 'guard', 'guardUnlessBeater']);
const AI_SLOW_POSITION = z.enum(['attack', 'guard']);
const AI_SLOW_PICK = z.enum(['highestGuard']);
const AI_PICK = z.enum(['highestPower']);
const AI_WHEN = z.enum(['contestedAttack']);
/** D-286: the summon-lane rules, in the order they narrow the free lanes (read only with FLAGS.LANES). */
export const AI_SUMMON_LANES = z.enum(['sentinelCenter', 'facingBeatable', 'facingEmpty', 'leftmostFree']);
const AI_UTILITY_STEP = z.enum(['castDrawSpell', 'setTrap', 'pass']);
export const AI_TIE_BREAK = z.enum(['leftmostSlot', 'cardId', 'instanceId']);

/** One castHighValueSpell entry (D-204): exactly one mode, so a new Collector spell needs data only. */
const CastWhen = z
  .object({ pick: z.exactOptional(AI_PICK), when: z.exactOptional(AI_WHEN) })
  .strict()
  .refine((cast) => (cast.pick === undefined) !== (cast.when === undefined), {
    message: 'needs exactly one of "pick" or "when"',
    params: { fix: 'keep exactly one of "pick" or "when"' },
  });

/** Per-rule parameters (§13.2). Base params are complete; mood overrides may set any subset. */
const AiParams = z
  .object({
    setTrapWhenBehind: z.object({ compare: AI_COMPARE_TRAP }).strict(),
    summonFallback: z
      .object({ position: AI_POSITION, slowPosition: AI_SLOW_POSITION, slowPick: AI_SLOW_PICK })
      .strict()
      .partial(),
    faceDownIfStrong: z.object({ minPower: Num }).strict(),
    killWithoutLoss: z.object({ allowTrades: z.boolean() }).strict(),
    castHighValueSpell: z.record(Id, CastWhen),
    summonBeater: z.object({ compare: AI_COMPARE_BEATER, skipBrittleCountered: z.boolean() }).strict(),
    utility: z.object({ order: z.array(AI_UTILITY_STEP) }).strict(),
    summonLane: z.array(AI_SUMMON_LANES),
  })
  .strict()
  .partial();

const MoodOverride = z
  .object({
    play: z.exactOptional(z.array(AI_PLAY_RULES)),
    attack: z.exactOptional(z.array(AI_ATTACK_RULES)),
    reposition: z.exactOptional(AI_REPOSITION),
    params: z.exactOptional(AiParams),
  })
  .strict();

export const CollectorAi = z
  .object({
    allowFaceDown: z.boolean(),
    reposition: AI_REPOSITION,
    play: z.array(AI_PLAY_RULES),
    attack: z.array(AI_ATTACK_RULES),
    params: AiParams,
    moods: z
      .object({ composed: MoodOverride, agitated: MoodOverride, desperate: MoodOverride })
      .strict(),
    trapPreference: z.array(Id),
    tieBreak: z.array(AI_TIE_BREAK),
  })
  .strict();

/** The parsed collector.json › ai block (D-210). The compiled content carries it, deep-frozen. */
export type CollectorAiConfig = z.output<typeof CollectorAi>;

export const Collector = z
  .object({
    deck: z.array(Id),
    ace: Id,
    canGraft: z.literal(false),
    ai: CollectorAi,
    dialogue: z
      // levy (D-352): optional lines for the moment he takes a monster; the mood lines are used when it is missing
      .object({ composed: z.array(z.string()), agitated: z.array(z.string()), desperate: z.array(z.string()), levy: z.array(z.string()).optional() })
      .strict(),
  })
  .strict();
