// @vault-duel/ai public entry point (ARCHITECTURE.md §2). The Collector AI and the player bots.
export { createCollector, decideWith } from './collector/policy';
export type { Collector, CollectorOptions } from './collector/policy';
export { collectorView } from './collector/view';
export type {
  ChoiceOf,
  ChoiceTarget,
  CollectorView,
  FoeMonster,
  OwnCard,
  OwnMonster,
  PublicCard,
  PublicMonster,
  Sacrifice,
  SummonMode,
  SummonPreview,
  ViewChoice,
} from './collector/view';
export type { CombatEstimate } from './collector/combat-estimate';
export type { AiConfig } from './collector/config';
export { MOOD_NAMES } from './collector/moods';
export { ATTACK_RULES, PLAY_RULES } from './collector/rules';
export { createBrain } from './shared/brain';
export { lookAhead } from './shared/look-ahead';
export type { LookAhead, SummonLook } from './shared/look-ahead';
export type { Brain } from './shared/brain';
export { botAction, botContext, playerView } from './bots/player-view';
export type { Bot, BotContext, PlayerView } from './bots/player-view';
export { createNovice } from './bots/novice';
export { createGreedy } from './bots/greedy';
export { evaluate, GREEDY_WEIGHTS } from './bots/evaluate';
export type { EvalWeights } from './bots/evaluate';
