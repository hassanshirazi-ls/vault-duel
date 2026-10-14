// ARCHITECTURE.md §8.1, §8.2 and §8.4 (KeywordDef; the defineKeyword helper lands in hooks/define.ts).
import type { CompiledContent, DefIdx, KwMask } from './content';
import type { Cond, Effect } from './effects';
import type { GameEvent } from './events';
import type { Globals } from './globals';
import type { GameState, Iid, Pos, Side } from './state';

/** All hook names in a fixed order (iteration over this array, never over object keys). */
export const HOOK_NAMES = [
  'onSummon',
  'onAttackDeclared',
  'beforeCombat',
  'onDestroyed',
  'onTurnStart',
  'onTurnEnd',
  'onGraft',
  'attackPermission',
  'restrictTargets',
  'mustAttack',
  'summonRequirement',
  'staticPower',
  'staticGuard',
  'beforeDestroy',
] as const;

export type HookName = (typeof HOOK_NAMES)[number];

export type AttackPerm = 'none' | 'monstersOnly' | 'any';
export type SummonReq =
  | { readonly kind: 'normal' }
  | { readonly kind: 'sacrifice'; readonly appraised: true; readonly zones: readonly ('board' | 'vault')[] };

// Event payloads. ARCHITECTURE.md names these but does not define them; shapes below are inferred
// from §5 (pipelines) and the §8.4 examples (ctx.evt.iid / ctx.evt.by). See milestone report.
export interface SummonEvt {
  readonly iid: Iid;
  readonly side: Side;
  readonly slot: number;
  readonly covetous: boolean;
}
export interface AttackEvt {
  readonly attacker: Iid;
  readonly target: Iid | -1;
}
/** Last-known information snapshot of a destroyed monster (§5.5). */
export interface DestroyedEvt {
  readonly iid: Iid;
  readonly side: Side;
  readonly slot: number;
  readonly cause: 'combat' | 'effect' | 'unstable';
  readonly by: Iid | -1;
  readonly power: number;
  readonly guard: number;
  readonly kw: KwMask;
}
export interface DestroyEvt {
  readonly iid: Iid;
  readonly cause: 'combat' | 'effect' | 'unstable';
  readonly by: Iid | -1;
}
export interface TurnEvt {
  readonly turn: number;
  readonly round: number;
  readonly side: Side;
}
export interface GraftEvt {
  readonly iid: Iid;
  readonly side: Side;
  readonly family: DefIdx;
  readonly materials: readonly Iid[];
}
/** Read-only snapshot taken after the reveal (§5.4, D-124). */
export interface CombatSnapshot {
  readonly aP: number;
  readonly dP: number;
  readonly dG: number;
  readonly defPos: Pos;
  readonly advantage: boolean;
}

export interface QueryCtx {
  readonly s: GameState;
  readonly self: Iid;
  readonly side: Side;
  readonly g: Globals;
  readonly c: CompiledContent;
  power(i: Iid): number;
  guard(i: Iid): number;
  controller(i: Iid): Side | -1;
  slot(i: Iid): number;
  isFaceUp(i: Iid): boolean;
  hasKw(i: Iid, id: string): boolean;
  monsters(side: Side): readonly Iid[];
  enteredThisTurn(i: Iid): boolean;
  isAttacker(i: Iid): boolean;
  /** A `$NAME` value: `CONTENT_NUMBERS` first, then core globals; EngineError if unknown (D-171). */
  num(name: string): number;
}

/** restrictTargets query context. §8.1 names it without defining it; carries the attacker being checked. */
export interface TargetQueryCtx extends QueryCtx {
  readonly attacker: Iid;
}

export interface HookCtx<E> extends QueryCtx {
  readonly evt: E;
  effect(e: Effect): void;
  emit(ev: GameEvent): void;
  /**
   * Evaluate a DSL condition on a card in the state as it is now, with this event's refs bound
   * (`directAttack` reads attacker/defender). Read-only; used by compiled traps for `TrapDef.when`.
   */
  holds(cond: Cond, iid: Iid): boolean; // judgment call: new HookCtx method, not listed in §8.2
  /**
   * Traps only (traps.ts): spend the trap this subscriber belongs to, immediately: it leaves its slot
   * for its owner's discard and TrapTriggered is emitted (D-071, D-158). Not an effect; nothing is queued.
   * Throws EngineError when `self` is not a set trap. At most one trap per identical definition and side
   * fires per dispatch (D-071 "two identical traps -> only the leftmost").
   */
  spendTrap(): void;
}
export interface AttackCtx extends HookCtx<AttackEvt> {
  readonly cancelled: boolean;
  cancelAttack(by: Iid): void;
}
export interface CombatCtx extends HookCtx<AttackEvt> {
  readonly combat: CombatSnapshot;
  setPierce(): void;
  setBrittleWin(): void;
}

export interface Hooks {
  onSummon?(ctx: HookCtx<SummonEvt>): void;
  onAttackDeclared?(ctx: AttackCtx): void;
  beforeCombat?(ctx: CombatCtx): void;
  onDestroyed?(ctx: HookCtx<DestroyedEvt>): void;
  onTurnStart?(ctx: HookCtx<TurnEvt>): void;
  onTurnEnd?(ctx: HookCtx<TurnEvt>): void;
  onGraft?(ctx: HookCtx<GraftEvt>): void;
  attackPermission?(q: QueryCtx): { readonly grant?: AttackPerm; readonly restrict?: AttackPerm };
  restrictTargets?(q: TargetQueryCtx): boolean;
  mustAttack?(q: QueryCtx): boolean;
  summonRequirement?(q: QueryCtx): SummonReq;
  staticPower?(q: QueryCtx): number;
  staticGuard?(q: QueryCtx): number;
  beforeDestroy?(ctx: HookCtx<DestroyEvt>): 'prevent' | 'allow';
}

export interface KeywordDef {
  readonly id: string;
  readonly name: string;
  readonly kind: 'keyword' | 'flaw';
  readonly icon: string;
  readonly visual: string;
  readonly text: string;
  readonly hooks: Hooks;
  readonly examples?: readonly string[];
}
