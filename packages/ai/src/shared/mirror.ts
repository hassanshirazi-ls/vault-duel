// Read-only mirror of the engine's derived-stat and combat-preview queries (stats.ts, combat.ts previewCombat).
//
// Spec gap: the engine package root exports neither effectivePower/Guard nor previewCombat (both need the engine's
// internal Env), but the Collector view and the bots need them. Until the engine exposes them, this module computes
// them from the public pieces: GameState, CompiledContent (typed arrays, keyword hook tables) and Globals, running
// the keywords' own hooks, so a new keyword needs no change here. mirror.test.ts checks it against the real engine
// (damage and CombatResolved events) on many states, so drift fails a test. Delete this file when the engine exports
// the queries. It never writes state.
import { DefType, Pool, resolveNum } from '@vault-duel/engine';
import type {
  AttackEvt,
  CombatCtx,
  CombatSnapshot,
  CompiledContent,
  Cond,
  GameState,
  Globals,
  Hooks,
  Iid,
  KwMask,
  Monster,
  QueryCtx,
  Side,
} from '@vault-duel/engine';

const LOC_STRIDE = 16;

/** Index of the lowest set bit of a non-zero mask. */
function lowBit(m: number): number {
  return 31 - Math.clz32(m & -m);
}

export interface Preview {
  readonly direct: boolean;
  /** attacker Power including the element bonus */
  readonly aP: number;
  /** the stat the attacker faces: Power in attack position, Guard in guard position; 0 for a direct attack */
  readonly dStat: number;
  readonly advantage: boolean;
  readonly pierce: boolean;
  readonly brittle: boolean;
  readonly destroyAttacker: boolean;
  readonly destroyDefender: boolean;
  /** life the attacker's controller loses / the defender's controller loses */
  readonly dmgToAttacker: number;
  readonly dmgToDefender: number;
  /** an active Ward-style replacement would save the attacker / the defender from destruction */
  readonly attackerWarded: boolean;
  readonly defenderWarded: boolean;
}

export class Mirror {
  private readonly kw: readonly Hooks[];

  constructor(
    readonly c: CompiledContent,
    readonly g: Globals,
  ) {
    this.kw = c.keywords.map((k) => k.hooks);
  }

  // ---- locating ---------------------------------------------------------------------------

  /** `side * 16 + slot` of a board monster, or -1. */
  loc(s: GameState, iid: Iid): number {
    for (let side = 0; side < 2; side++) {
      const board = s.sides[side as Side].board;
      for (let i = 0; i < board.length; i++) if (board[i]?.iid === iid) return side * LOC_STRIDE + i;
    }
    return -1;
  }

  /** Board slot of a monster, or -1. */
  slotOf(s: GameState, iid: Iid): number {
    const loc = this.loc(s, iid);
    return loc < 0 ? -1 : loc % LOC_STRIDE;
  }

  monster(s: GameState, iid: Iid): Monster | null {
    const loc = this.loc(s, iid);
    return loc < 0 ? null : (s.sides[loc >= LOC_STRIDE ? 1 : 0].board[loc % LOC_STRIDE] ?? null);
  }

  // ---- card facts -------------------------------------------------------------------------

  element(s: GameState, iid: Iid): number {
    const inst = s.inst[iid];
    if (inst === undefined) return -1;
    return inst.chimera !== null ? inst.chimera.element : (this.c.element[inst.def] ?? -1);
  }

  /** Chimeras have no kind. */
  kind(s: GameState, iid: Iid): number {
    const inst = s.inst[iid];
    if (inst === undefined || inst.chimera !== null) return -1;
    return this.c.kind[inst.def] ?? -1;
  }

  isMonsterCard(s: GameState, iid: Iid): boolean {
    const inst = s.inst[iid];
    if (inst === undefined) return false;
    const t = this.c.type[inst.def];
    return t === DefType.Monster || t === DefType.Family;
  }

  printedKw(s: GameState, iid: Iid): KwMask {
    const inst = s.inst[iid];
    if (inst === undefined) return 0;
    return ((this.c.kw[inst.def] ?? 0) | (inst.chimera?.kw ?? 0)) >>> 0;
  }

  /** Keyword bits that count: none face-down, a used Ward no longer counts. */
  activeKwOf(s: GameState, m: Monster): KwMask {
    if (m.faceDown) return 0;
    let kw = this.printedKw(s, m.iid);
    if (m.wardUsed) kw &= ~this.c.hookMask.beforeDestroy;
    return kw >>> 0;
  }

  // ---- effective stats --------------------------------------------------------------------

  private printed(s: GameState, iid: Iid, power: boolean): number {
    const inst = s.inst[iid];
    if (inst === undefined) return 0;
    let v = (power ? this.c.power : this.c.guard)[inst.def] ?? 0;
    if (inst.chimera?.ascended === true) v += power ? this.g.ASCEND_POWER : this.g.ASCEND_GUARD;
    return v;
  }

  private twistBonus(s: GameState, iid: Iid, power: boolean): number {
    if (!this.g.FLAGS.WEEKLY_TWIST || s.twist < 0) return 0;
    const twist = this.c.twists[s.twist];
    if (twist === undefined) return 0;
    let sum = 0;
    for (let i = 0; i < twist.modifiers.length; i++) {
      const mod = twist.modifiers[i];
      const v = power ? mod?.power : mod?.guard;
      if (mod === undefined || v === undefined || v === 0) continue;
      if (this.cond(mod.where, s, iid, false)) sum += v;
    }
    return sum;
  }

  private stat(s: GameState, iid: Iid, power: boolean, twist: boolean): number {
    let v = this.printed(s, iid, power);
    const loc = this.loc(s, iid);
    if (loc < 0) return Math.max(this.g.STAT_FLOOR, v); // off-board: printed stats only
    const side = (loc >= LOC_STRIDE ? 1 : 0) as Side;
    const m = s.sides[side].board[loc % LOC_STRIDE] as Monster;
    v += power ? m.permP : m.permG;
    for (let i = 0; i < m.timed.length; i++) {
      const t = m.timed[i];
      if (t !== undefined && s.turn <= t.until) v += power ? t.p : t.g;
    }
    if (power && m.unstableUntil >= 0) v += this.g.UNSTABLE_BONUS;
    const mask = this.activeKwOf(s, m) & (power ? this.c.hookMask.staticPower : this.c.hookMask.staticGuard);
    if (mask !== 0) {
      const q = new Query(this, s, iid, side, -1);
      for (let b = mask | 0; b !== 0; b &= b - 1) {
        const hooks = this.kw[lowBit(b)];
        v += (power ? hooks?.staticPower?.(q) : hooks?.staticGuard?.(q)) ?? 0;
      }
    }
    if (twist) v += this.twistBonus(s, iid, power);
    return Math.max(this.g.STAT_FLOOR, v);
  }

  power(s: GameState, iid: Iid): number {
    return this.stat(s, iid, true, true);
  }
  guard(s: GameState, iid: Iid): number {
    return this.stat(s, iid, false, true);
  }

  // ---- conditions (twists, hook `holds`) --------------------------------------------------

  cond(cond: Cond, s: GameState, iid: Iid, twist = true): boolean {
    if ('all' in cond) return cond.all.every((k) => this.cond(k, s, iid, twist));
    if ('any' in cond) return cond.any.some((k) => this.cond(k, s, iid, twist));
    if ('not' in cond) return !this.cond(cond.not, s, iid, twist);
    if ('faceUp' in cond) {
      const m = this.monster(s, iid);
      return m !== null && !m.faceDown;
    }
    if ('powerLte' in cond) return this.stat(s, iid, true, twist) <= resolveNum(this.g, cond.powerLte);
    if ('powerGte' in cond) return this.stat(s, iid, true, twist) >= resolveNum(this.g, cond.powerGte);
    if ('type' in cond) return this.isMonsterCard(s, iid);
    if ('relic' in cond) {
      const inst = s.inst[iid];
      return inst !== undefined && this.c.type[inst.def] === DefType.Monster && this.c.pool[inst.def] === Pool.Collector;
    }
    if ('chimera' in cond) return (s.inst[iid]?.chimera ?? null) !== null;
    if ('onBoard' in cond) return this.loc(s, iid) >= 0;
    if ('directAttack' in cond) return false; // needs an event; none is in play when the mirror evaluates
    if ('graftedThisTurn' in cond) return s.inst[iid]?.chimera?.grafted === s.turn;
    if ('element' in cond) {
      const e = this.element(s, iid);
      return e >= 0 && this.c.elementIds[e] === cond.element;
    }
    if ('kind' in cond) {
      const k = this.kind(s, iid);
      return k >= 0 && this.c.kindIds[k] === cond.kind;
    }
    const bit = this.c.kwBit[cond.keyword];
    const m = this.monster(s, iid);
    return bit !== undefined && m !== null && (this.activeKwOf(s, m) & (1 << bit)) !== 0;
  }

  // ---- element advantage ------------------------------------------------------------------

  beats(a: number, b: number): boolean {
    if (a < 0 || b < 0) return false;
    return this.c.beats[a * this.c.nElements + b] === 1;
  }

  hasAdvantage(s: GameState, attacker: Iid, defender: Iid): boolean {
    return this.beats(this.element(s, attacker), this.element(s, defender));
  }

  // ---- keyword-derived facts --------------------------------------------------------------

  /** Some active keyword of a board monster says it must attack if able (Vain). */
  mustAttack(s: GameState, iid: Iid): boolean {
    const loc = this.loc(s, iid);
    if (loc < 0) return false;
    const side = (loc >= LOC_STRIDE ? 1 : 0) as Side;
    const m = s.sides[side].board[loc % LOC_STRIDE] as Monster;
    const mask = this.activeKwOf(s, m) & this.c.hookMask.mustAttack;
    if (mask === 0) return false;
    const q = new Query(this, s, iid, side, -1);
    for (let b = mask | 0; b !== 0; b &= b - 1) if (this.kw[lowBit(b)]?.mustAttack?.(q) === true) return true;
    return false;
  }

  /**
   * A card summoned now is held back from attacking beyond the universal summoning sickness: an active keyword
   * restricts its attack permission on its entry turn (Slow). `s` must hold the card on a board with entered = turn.
   */
  restrictedOnEntry(s: GameState, iid: Iid): boolean {
    const loc = this.loc(s, iid);
    if (loc < 0) return false;
    const side = (loc >= LOC_STRIDE ? 1 : 0) as Side;
    const m = s.sides[side].board[loc % LOC_STRIDE] as Monster;
    const mask = this.activeKwOf(s, m) & this.c.hookMask.attackPermission;
    if (mask === 0) return false;
    const q = new Query(this, s, iid, side, -1);
    for (let b = mask | 0; b !== 0; b &= b - 1) {
      if (this.kw[lowBit(b)]?.attackPermission?.(q)?.restrict === 'none') return true;
    }
    return false;
  }

  // ---- combat preview ---------------------------------------------------------------------

  /**
   * The §5.4 resolve table without side effects: no reveal, no traps, no queued effects. `target === -1` is a direct
   * attack. A face-down target must not be passed (its outcome is unknown); `aPDelta` adds Power to the attacker.
   */
  preview(s: GameState, attacker: Iid, target: Iid | -1, aPDelta = 0): Preview {
    if (target < 0) {
      const aP = this.power(s, attacker) + aPDelta;
      return {
        direct: true, aP, dStat: 0, advantage: false, pierce: false, brittle: false,
        destroyAttacker: false, destroyDefender: false, dmgToAttacker: 0, dmgToDefender: aP,
        attackerWarded: false, defenderWarded: false,
      };
    }
    const t = this.monster(s, target);
    const defPos = t === null ? 0 : t.pos;
    const advantage = this.hasAdvantage(s, attacker, target);
    const snap: CombatSnapshot = {
      aP: this.power(s, attacker) + aPDelta + (advantage ? this.g.ELEMENT_BONUS : 0),
      dP: this.power(s, target),
      dG: this.guard(s, target),
      defPos,
      advantage,
    };
    let pierce = false;
    let brittleWin = false;
    const evt: AttackEvt = { attacker, target };
    for (let side = 0; side < 2; side++) {
      const board = s.sides[side as Side].board;
      for (let i = 0; i < board.length; i++) {
        const m = board[i];
        if (m === null || m === undefined) continue;
        const mask = this.activeKwOf(s, m) & this.c.hookMask.beforeCombat;
        if (mask === 0) continue;
        const ctx = new Combat(this, s, m.iid, side as Side, attacker, evt, snap);
        for (let b = mask | 0; b !== 0; b &= b - 1) this.kw[lowBit(b)]?.beforeCombat?.(ctx);
        if (ctx.pierce) pierce = true;
        if (ctx.brittleWin) brittleWin = true;
      }
    }
    const { aP, dP, dG } = snap;
    let destroyAttacker = false;
    let destroyDefender = false;
    let dmgToAttacker = 0;
    let dmgToDefender = 0;
    if (defPos === 0) {
      if (brittleWin || aP > dP) {
        destroyDefender = true;
        dmgToDefender = Math.max(0, aP - dP);
      } else if (aP < dP) {
        destroyAttacker = true;
        dmgToAttacker = dP - aP;
      } else {
        destroyAttacker = true;
        destroyDefender = true;
      }
    } else if (brittleWin || aP > dG) {
      destroyDefender = true;
      dmgToDefender = pierce ? Math.max(0, aP - dG) : 0;
    } else if (aP < dG) {
      dmgToAttacker = dG - aP;
    }
    const ward = this.c.hookMask.beforeDestroy;
    const am = this.monster(s, attacker);
    return {
      direct: false,
      aP,
      dStat: defPos === 0 ? dP : dG,
      advantage,
      pierce,
      brittle: brittleWin,
      destroyAttacker,
      destroyDefender,
      dmgToAttacker,
      dmgToDefender,
      attackerWarded: am !== null && (this.activeKwOf(s, am) & ward) !== 0,
      defenderWarded: t !== null && (this.activeKwOf(s, t) & ward) !== 0,
    };
  }
}

/** Query context over a fixed state. */
class Query implements QueryCtx {
  readonly g: Globals;
  readonly c: CompiledContent;
  self: Iid;
  side: Side;

  constructor(
    protected readonly m: Mirror,
    readonly s: GameState,
    self: Iid,
    side: Side,
    private readonly attackerIid: Iid,
  ) {
    this.g = m.g;
    this.c = m.c;
    this.self = self;
    this.side = side;
  }

  power(i: Iid): number {
    return this.m.power(this.s, i);
  }
  guard(i: Iid): number {
    return this.m.guard(this.s, i);
  }
  controller(i: Iid): Side | -1 {
    const loc = this.m.loc(this.s, i);
    return loc < 0 ? -1 : loc >= LOC_STRIDE ? 1 : 0;
  }
  slot(i: Iid): number {
    const loc = this.m.loc(this.s, i);
    return loc < 0 ? -1 : loc % LOC_STRIDE;
  }
  isFaceUp(i: Iid): boolean {
    const mon = this.m.monster(this.s, i);
    return mon !== null && !mon.faceDown;
  }
  hasKw(i: Iid, id: string): boolean {
    const bit = this.c.kwBit[id];
    const mon = this.m.monster(this.s, i);
    return bit !== undefined && mon !== null && (this.m.activeKwOf(this.s, mon) & (1 << bit)) !== 0;
  }
  monsters(side: Side): readonly Iid[] {
    const out: Iid[] = [];
    const board = this.s.sides[side].board;
    for (let i = 0; i < board.length; i++) {
      const mon = board[i];
      if (mon !== null && mon !== undefined) out.push(mon.iid);
    }
    return out;
  }
  enteredThisTurn(i: Iid): boolean {
    return this.m.monster(this.s, i)?.entered === this.s.turn;
  }
  ownTurnsSinceEntered(i: Iid): number {
    const loc = this.m.loc(this.s, i);
    if (loc < 0) return -1;
    const mon = this.s.sides[loc >= LOC_STRIDE ? 1 : 0].board[loc % LOC_STRIDE];
    if (mon === null || mon === undefined) return -1;
    const x = loc >= LOC_STRIDE ? 1 : 0;
    return ((this.s.turn - x) >> 1) - ((mon.entered - x) >> 1);
  }
  isAttacker(i: Iid): boolean {
    return i === this.attackerIid;
  }
  num(name: string): number {
    return resolveNum(this.g, `$${name}`);
  }
}

/** beforeCombat context: collects the Pierce and Brittle flags; effects and events are discarded. */
class Combat extends Query implements CombatCtx {
  pierce = false;
  brittleWin = false;

  constructor(
    m: Mirror,
    s: GameState,
    self: Iid,
    side: Side,
    attacker: Iid,
    readonly evt: AttackEvt,
    readonly combat: CombatSnapshot,
  ) {
    super(m, s, self, side, attacker);
  }

  setPierce(): void {
    this.pierce = true;
  }
  setBrittleWin(): void {
    this.brittleWin = true;
  }
  effect(): void {
    // a preview queues nothing
  }
  emit(): void {
    // a preview emits nothing
  }
  holds(cond: Cond, iid: Iid): boolean {
    return this.m.cond(cond, this.s, iid);
  }
}
