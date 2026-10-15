// The Collector's data: `collector.json › ai` (ARCHITECTURE.md §13.2). The type is the content schema's own output,
// so a schema change is a compile error here instead of a silent drift (D-145).
import { parseContent, RAW_CONTENT } from '@vault-duel/content';
import type { CollectorAi } from '@vault-duel/content';

export type AiConfig = ReturnType<(typeof CollectorAi)['parse']>;
export type PlayRuleId = AiConfig['play'][number];
export type AttackRuleId = AiConfig['attack'][number];
export type RuleId = PlayRuleId | AttackRuleId;
export type TieKey = AiConfig['tieBreak'][number];
export type Reposition = AiConfig['reposition'];
export type CastEntry = NonNullable<NonNullable<AiConfig['params']['castHighValueSpell']>[string]>;

/** The live `collector.json › ai`, read from the bundled content files (browser-safe). */
export function liveCollectorAi(): AiConfig {
  const collector = parseContent(RAW_CONTENT).data.collector;
  if (collector === undefined) throw new Error('collector.json did not parse; run pnpm content:check');
  return collector.ai;
}
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
