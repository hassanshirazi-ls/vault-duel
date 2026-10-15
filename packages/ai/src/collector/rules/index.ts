// The rule registry (D-145). The record types are keyed by the content schema's enums, so a missing rule is a compile
// error here; rules.test.ts also checks the keys at run time against AI_PLAY_RULES and AI_ATTACK_RULES.
import type { AttackRuleId, PlayRuleId } from '../config';
import type { AttackRule, PlayRule } from './context';
import { attackAnything } from './attackAnything';
import { castHighValueSpell } from './castHighValueSpell';
import { directIfEmpty } from './directIfEmpty';
import { faceDownIfStrong } from './faceDownIfStrong';
import { holdExceptVain } from './holdExceptVain';
import { killWithoutLoss } from './killWithoutLoss';
import { lethal } from './lethal';
import { setTrapWhenBehind } from './setTrapWhenBehind';
import { summonAce } from './summonAce';
import { summonBeater } from './summonBeater';
import { summonFallback } from './summonFallback';
import { utility } from './utility';
import { winThisTurn } from './winThisTurn';

export const PLAY_RULES: Readonly<Record<PlayRuleId, PlayRule>> = {
  winThisTurn,
  summonAce,
  summonBeater,
  setTrapWhenBehind,
  castHighValueSpell,
  summonFallback,
  utility,
};

export const ATTACK_RULES: Readonly<Record<AttackRuleId, AttackRule>> = {
  lethal,
  killWithoutLoss,
  faceDownIfStrong,
  directIfEmpty,
  holdExceptVain,
  attackAnything,
};
