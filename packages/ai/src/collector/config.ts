// The Collector's data: `collector.json › ai` (ARCHITECTURE.md §13.2). The type is the content schema's own output,
// so a schema change is a compile error here instead of a silent drift (D-145).
import type { CollectorAiConfig } from '@vault-duel/content';

export type AiConfig = CollectorAiConfig;
export type PlayRuleId = AiConfig['play'][number];
export type AttackRuleId = AiConfig['attack'][number];
export type RuleId = PlayRuleId | AttackRuleId;
export type TieKey = AiConfig['tieBreak'][number];
export type Reposition = AiConfig['reposition'];
export type CastEntry = NonNullable<NonNullable<AiConfig['params']['castHighValueSpell']>[string]>;

export type PickId = NonNullable<CastEntry['pick']>;
export type WhenId = NonNullable<CastEntry['when']>;
export type UtilityStep = NonNullable<NonNullable<AiConfig['params']['utility']>['order']>[number];
type Params = AiConfig['params'];
type Field<R extends keyof Params, K extends keyof NonNullable<Params[R]>> = NonNullable<NonNullable<Params[R]>[K]>;
export type TrapCompare = Field<'setTrapWhenBehind', 'compare'>;
export type BeaterCompare = Field<'summonBeater', 'compare'>;
export type SummonPosition = Field<'summonFallback', 'position'>;
export type SlowPosition = Field<'summonFallback', 'slowPosition'>;
export type SlowPick = Field<'summonFallback', 'slowPick'>;
