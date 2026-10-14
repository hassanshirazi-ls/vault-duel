// Hook dispatch (ARCHITECTURE.md §8.3, §8.5). One Dispatcher serves one dispatch: build it from
// the current Tx state immediately before dispatching. Subscribers are collected up front into a
// local list (Tx caller contract 1), then called. A trap subscriber's spendTrap writes during the list, so the
// contexts read the state live through a StateSource (D-186) instead of keeping the state they were built over.
import { makeRefs } from '../effects/targets';
import type { EffectSink } from '../effects/run';
import { activeKwOf, activeSide, locate, locSide, locSlot, monsterOf } from '../stats';
import type { KwMask } from '../types/content';
import type {
  AttackEvt,
  EventHookName,
  CombatSnapshot,
  DestroyEvt,
  DestroyedEvt,
  GraftEvt,
  Hooks,
  SummonEvt,
  SummonReq,
  TrapHooks,
  TurnEvt,
} from '../types/hooks';
import type { GameState, Iid, Side } from '../types/state';
import {
  AttackContext,
  CombatContext,
  EventContext,
  QueryContext,
  TargetQueryContext,
  sourceOf,
} from './context';
import type { CombatFlags, StateRef, StateSource } from './context';
import { lowBit } from './registry';
import type { Env } from './registry';

interface Sub {
  readonly iid: Iid;
  readonly side: Side;
  /** keyword bits of this card that implement the hook (monsters); 0 for traps */
  readonly mask: KwMask;
  /** compiled trap hook table (traps only) */
  readonly trap: TrapHooks | null;
  /** DefIdx of a trap (identical-trap rule, D-071); -1 for monsters */
  readonly def: number;
}

export class Dispatcher {
  private readonly src: StateSource;

  /** `s` is a fixed state, or a live source such as the `Run` (D-186). */
  constructor(
    readonly env: Env,
    s: StateRef,
    readonly sink: EffectSink,
  ) {
    this.src = sourceOf(s);
  }

  get s(): GameState {
    return this.src.state;
  }

  /**
   * Subscribers for one event in §8.3.1 order: (b) `own` first (onDestroyed's destroyed monster),
   * (c) active side's board monsters in slot order, (d) inactive side's, (e) active side's traps in
   * slot order, (f) inactive side's. Keyword bits inside a card run in registry (bit) order.
   * (a), engine system rules, are the caller's business (§5).
   */
  private collect(hook: EventHookName, own: Sub | null): Sub[] {
    const { s, env } = this;
    const subs: Sub[] = [];
    if (own !== null) subs.push(own);
    const active = activeSide(s);
    const hookMask = env.reg.masks[hook];
    for (let k = 0; k < 2; k++) {
      const side = (k === 0 ? active : 1 - active) as Side;
      const board = s.sides[side].board;
      for (let i = 0; i < board.length; i++) {
        const m = board[i];
        if (m === null || m === undefined) continue;
        const mask = activeKwOf(s, env, m) & hookMask;
        if (mask !== 0) subs.push({ iid: m.iid, side, mask, trap: null, def: -1 });
      }
    }
    for (let k = 0; k < 2; k++) {
      const side = (k === 0 ? active : 1 - active) as Side;
      const traps = s.sides[side].traps;
      for (let i = 0; i < traps.length; i++) {
        const t = traps[i];
        if (t === null || t === undefined) continue;
        const def = s.inst[t.iid]?.def;
        const hooks = def === undefined ? null : (env.reg.trapHooks[def] ?? null);
        if (hooks !== null && hooks[hook] !== undefined) subs.push({ iid: t.iid, side, mask: 0, trap: hooks, def: def as number });
      }
    }
    return subs;
  }

  private run<C extends QueryContext>(subs: readonly Sub[], ctx: C, call: (h: Hooks | TrapHooks, ctx: C) => void): void {
    const spent: number[] = []; // trap defs (x2 + side) already spent in this dispatch
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i] as Sub;
      ctx.bind(sub.iid, sub.side, sub.trap !== null);
      if (sub.trap !== null) {
        // Two identical traps of one side: only the leftmost is used (D-071). Judgment call: implemented per dispatch,
        // so each monster of a destruction batch can still use one trap of the pair (D-158).
        const key = sub.def * 2 + sub.side;
        if (spent.includes(key)) continue;
        call(sub.trap, ctx);
        if (ctx.trapSpent) spent.push(key);
        continue;
      }
      for (let b = sub.mask | 0; b !== 0; b &= b - 1) {
        const hooks = this.env.reg.kw[lowBit(b)];
        if (hooks !== undefined) call(hooks, ctx);
      }
    }
  }

  onSummon(evt: SummonEvt): void {
    const ctx = new EventContext(this.env, this.src, this.sink, evt, makeRefs({}));
    this.run(this.collect('onSummon', null), ctx, (h, c) => h.onSummon?.(c));
  }

  /** Returns the iid that cancelled the attack, or -1 (§8.3.4). */
  onAttackDeclared(evt: AttackEvt): Iid | -1 {
    const refs = makeRefs({ attacker: evt.attacker, defender: evt.target });
    const ctx = new AttackContext(this.env, this.src, this.sink, evt, refs, evt.attacker);
    this.run(this.collect('onAttackDeclared', null), ctx, (h, c) => h.onAttackDeclared?.(c));
    return ctx.cancelledBy;
  }

  /** Subscribers read only `snapshot`; the flags are OR-folded after the whole list ran (D-124, §8.3.6). */
  beforeCombat(evt: AttackEvt, snapshot: CombatSnapshot): { readonly pierce: boolean; readonly brittleWin: boolean } {
    const flags: CombatFlags = { pierce: false, brittleWin: false };
    const refs = makeRefs({ attacker: evt.attacker, defender: evt.target });
    const ctx = new CombatContext(this.env, this.src, this.sink, evt, refs, snapshot, flags);
    this.run(this.collect('beforeCombat', null), ctx, (h, c) => h.beforeCombat?.(c));
    return { pierce: flags.pierce, brittleWin: flags.brittleWin };
  }

  /** `evt` is the last-known information; the destroyed monster's own hooks run first (§8.3.1b). */
  onDestroyed(evt: DestroyedEvt): void {
    const mask = evt.kw & this.env.reg.masks.onDestroyed;
    const own: Sub | null = mask !== 0 ? { iid: evt.iid, side: evt.side, mask, trap: null, def: -1 } : null;
    const refs = makeRefs({ destroyed: evt.iid, destroyer: evt.by });
    const ctx = new EventContext(this.env, this.src, this.sink, evt, refs);
    this.run(this.collect('onDestroyed', own), ctx, (h, c) => h.onDestroyed?.(c));
  }

  onTurn(hook: 'onTurnStart' | 'onTurnEnd', evt: TurnEvt): void {
    const ctx = new EventContext(this.env, this.src, this.sink, evt, makeRefs({}));
    this.run(this.collect(hook, null), ctx, (h, c) => (hook === 'onTurnStart' ? h.onTurnStart?.(c) : h.onTurnEnd?.(c)));
  }

  onGraft(evt: GraftEvt): void {
    const ctx = new EventContext(this.env, this.src, this.sink, evt, makeRefs({ grafted: evt.iid }));
    this.run(this.collect('onGraft', null), ctx, (h, c) => h.onGraft?.(c));
  }

  /**
   * Replacement hook: only the monster's own active keywords are asked (Ward is about itself), in
   * bit order, and the first 'prevent' wins (§8.3.6). A monster not on a board is not protected.
   */
  beforeDestroy(evt: DestroyEvt): 'prevent' | 'allow' {
    const m = monsterOf(this.s, evt.iid);
    if (m === null) return 'allow';
    const mask = activeKwOf(this.s, this.env, m) & this.env.reg.masks.beforeDestroy;
    if (mask === 0) return 'allow';
    const loc = locate(this.s, evt.iid);
    const ctx = new EventContext(this.env, this.src, this.sink, evt, makeRefs({ destroyed: evt.iid, destroyer: evt.by }));
    ctx.bind(evt.iid, locSide(loc));
    for (let b = mask | 0; b !== 0; b &= b - 1) {
      if (this.env.reg.kw[lowBit(b)]?.beforeDestroy?.(ctx) === 'prevent') return 'prevent';
    }
    return 'allow';
  }
}

// ---- query folds (order-independent, §8.3.6) -----------------------------------------------

/**
 * Targets an attacker may pick on the defending board: every monster, narrowed to the face-up
 * monsters whose restrictTargets hook says "mandatory target" if there are any (D-037, D-038).
 */
export function attackTargets(env: Env, s: GameState, attacker: Iid, defSide: Side): Iid[] {
  const all: Iid[] = [];
  const mandatory: Iid[] = [];
  const board = s.sides[defSide].board;
  const hookMask = env.reg.masks.restrictTargets;
  for (let i = 0; i < board.length; i++) {
    const m = board[i];
    if (m === null || m === undefined) continue;
    all.push(m.iid);
    const mask = activeKwOf(s, env, m) & hookMask;
    if (mask === 0) continue;
    const q = new TargetQueryContext(env, s, m.iid, defSide, attacker);
    for (let b = mask | 0; b !== 0; b &= b - 1) {
      if (env.reg.kw[lowBit(b)]?.restrictTargets?.(q) === true) {
        mandatory.push(m.iid);
        break;
      }
    }
  }
  return mandatory.length > 0 ? mandatory : all;
}

/** OR over the monster's active keywords (Vain, D-052). */
export function mustAttack(env: Env, s: GameState, iid: Iid): boolean {
  const loc = locate(s, iid);
  if (loc < 0) return false;
  const side = locSide(loc);
  const m = s.sides[side].board[locSlot(loc)];
  if (m === null || m === undefined) return false;
  const mask = activeKwOf(s, env, m) & env.reg.masks.mustAttack;
  if (mask === 0) return false;
  const q = new QueryContext(env, s, iid, side);
  for (let b = mask | 0; b !== 0; b &= b - 1) {
    if (env.reg.kw[lowBit(b)]?.mustAttack?.(q) === true) return true;
  }
  return false;
}

/**
 * Summon requirement of a card in hand (printed + inherited keywords; it is not on a board yet).
 * Most restrictive wins: any 'sacrifice' beats 'normal'; several 'sacrifice' results keep only the
 * zones they all allow.
 */
export function summonRequirement(env: Env, s: GameState, iid: Iid, owner: Side, printed: KwMask): SummonReq {
  const mask = printed & env.reg.masks.summonRequirement;
  let result: SummonReq = { kind: 'normal' };
  if (mask === 0) return result;
  const q = new QueryContext(env, s, iid, owner);
  for (let b = mask | 0; b !== 0; b &= b - 1) {
    const r = env.reg.kw[lowBit(b)]?.summonRequirement?.(q);
    if (r === undefined || r.kind === 'normal') continue;
    result =
      result.kind === 'normal'
        ? r
        : { kind: 'sacrifice', appraised: true, zones: result.zones.filter((z) => r.zones.includes(z)) };
  }
  return result;
}
