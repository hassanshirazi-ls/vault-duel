// Moods (D-080, D-081): the engine computes the mood from his life and stores it in the state; the AI reads it.
// Each mood is a set of overrides merged over the base `collector.json › ai` block (ARCHITECTURE.md §13.2):
// lists and `reposition` replace, `params` merge per rule and then per key, and `castHighValueSpell` merges per
// spell id (D-204). The three moods are merged once, when the policy is built.
import type { Mood } from '@vault-duel/engine';
import type { AiConfig, AttackRuleId, CastEntry, PlayRuleId, Reposition, SummonLaneId, TieKey } from './config';

/** Mood index (engine `Mood`: 0, 1, 2) to its key in `collector.json › ai.moods`. */
export const MOOD_NAMES = ['composed', 'agitated', 'desperate'] as const;

type Params = AiConfig['params'];
type Merged<K extends Exclude<keyof Params, 'castHighValueSpell'>> = Partial<NonNullable<Params[K]>>;

export interface EffectiveAi {
  readonly mood: Mood;
  readonly play: readonly PlayRuleId[];
  readonly attack: readonly AttackRuleId[];
  readonly reposition: Reposition;
  readonly allowFaceDown: boolean;
  readonly trapPreference: readonly string[];
  readonly tieBreak: readonly TieKey[];
  /** D-286: the summon-lane rules in order; read only with FLAGS.LANES */
  readonly summonLane: readonly SummonLaneId[] | undefined;
  readonly params: {
    readonly setTrapWhenBehind: Merged<'setTrapWhenBehind'>;
    readonly summonFallback: Merged<'summonFallback'>;
    readonly faceDownIfStrong: Merged<'faceDownIfStrong'>;
    readonly killWithoutLoss: Merged<'killWithoutLoss'>;
    readonly summonBeater: Merged<'summonBeater'>;
    readonly utility: Merged<'utility'>;
  };
  /** The entry for a Collector spell id: the mood's replaces the base's for that id only (D-204). */
  cast(spellId: string): CastEntry | undefined;
}

export function effectiveAi(ai: AiConfig, mood: Mood): EffectiveAi {
  const over = ai.moods[MOOD_NAMES[mood]];
  const mp = over.params;
  return {
    mood,
    play: over.play ?? ai.play,
    attack: over.attack ?? ai.attack,
    reposition: over.reposition ?? ai.reposition,
    allowFaceDown: ai.allowFaceDown,
    trapPreference: ai.trapPreference,
    tieBreak: ai.tieBreak,
    summonLane: mp?.summonLane ?? ai.params.summonLane,
    params: {
      setTrapWhenBehind: { ...ai.params.setTrapWhenBehind, ...mp?.setTrapWhenBehind },
      summonFallback: { ...ai.params.summonFallback, ...mp?.summonFallback },
      faceDownIfStrong: { ...ai.params.faceDownIfStrong, ...mp?.faceDownIfStrong },
      killWithoutLoss: { ...ai.params.killWithoutLoss, ...mp?.killWithoutLoss },
      summonBeater: { ...ai.params.summonBeater, ...mp?.summonBeater },
      utility: { ...ai.params.utility, ...mp?.utility },
    },
    cast: (spellId) =>
      (mp?.castHighValueSpell !== undefined && Object.hasOwn(mp.castHighValueSpell, spellId)
        ? mp.castHighValueSpell[spellId]
        : undefined) ??
      (ai.params.castHighValueSpell !== undefined && Object.hasOwn(ai.params.castHighValueSpell, spellId)
        ? ai.params.castHighValueSpell[spellId]
        : undefined),
  };
}

export function effectiveByMood(ai: AiConfig): readonly [EffectiveAi, EffectiveAi, EffectiveAi] {
  return [effectiveAi(ai, 0), effectiveAi(ai, 1), effectiveAi(ai, 2)];
}
