// Options preview (ARCHITECTURE.md §5.6c; D-313): every legal bond action of the player's turn with its predicted result.
// Pure. Each option is applied through the real `applyAction` to a draft of `s` (structural sharing, no deep clone), and
// the result is read through the same stats functions, so the preview cannot drift from the rules. It returns facts, not a
// verdict: the "best" hint lives in `ai`. Not for the hot sim loop (one applyAction per option).
import { appraisalTargetOf } from './appraisal';
import type { Env } from './hooks/registry';
import { forEachLegal } from './legal';
import { applyAction } from './reducer';
import type { RunOptions } from './reducer';
import { activeKw, activeSide, attackPermission, effectiveGuard, effectivePower, elementOf, locate, locSlot, monsterOf, roundOf } from './stats';
import type { Action } from './types/actions';
import type { DefIdx, ElemIdx, KwMask } from './types/content';
import type { GameEvent } from './types/events';
import type { GameState, Iid, Monster, Pos } from './types/state';

export type BondKind = 'graft' | 'split' | 'symbiosis';

/** The Appraisal the board would face, for the board AFTER the option, against the next Appraisal round. */
export interface AppraisalExposure {
  /** next round in APPRAISAL_ROUNDS at or after the Collector's coming turn, -1 none left (or FLAGS.APPRAISAL off) */
  readonly nextRound: number;
  /** own turns before it fires, 0 = at the start of his next turn */
  readonly turnsAway: number;
  /** monster the §5.7 rule would take, -1 none */
  readonly target: Iid;
  readonly targetPower: number;
  /** 2 = a host with a symbiote */
  readonly cardsLost: 0 | 1 | 2;
}

/** An own monster the option creates or changes (or a part that went to the hand, `slot` -1). */
export interface BondResultMonster {
  readonly iid: Iid;
  readonly def: DefIdx;
  readonly element: ElemIdx;
  readonly power: number;
  readonly guard: number;
  readonly kw: KwMask;
  readonly slot: number;
  readonly pos: Pos;
  readonly canAttackThisTurn: boolean;
  readonly unstableUntil: number;
  /** -1 none */
  readonly symbiote: Iid;
}

export interface BondOption {
  readonly kind: BondKind;
  /** stable: "split:12", "symb:c7>h12", "graft:3,9" (ordered materials; "/k<mask>" when the keywords were chosen) */
  readonly id: string;
  /** applying them in order performs the option; graft: up to but excluding `graftPosition` (`positionFree`) */
  readonly steps: readonly Action[];
  /** graft only: position and lane are chosen at graftPosition (the result shows attack position, leftmost lane) */
  readonly positionFree: boolean;
  /** FLAGS.BOND_ACTION off: the option is the turn's play */
  readonly usesPlay: boolean;
  readonly handCardsAfter: number;
  readonly result: readonly BondResultMonster[];
  /** the whole own board after the option */
  readonly boardAfter: readonly (BondResultMonster | null)[];
  readonly boardPowerDelta: number;
  readonly boardGuardDelta: number;
  readonly bodiesDelta: number;
  readonly exposure: AppraisalExposure;
}

export interface BondPreview {
  /** some bond action is legal now */
  readonly available: boolean;
  readonly baseline: {
    readonly exposure: AppraisalExposure;
    readonly boardPower: number;
    readonly boardGuard: number;
    readonly bodies: number;
  };
  /** fixed order: graft, split, symbiosis (the §6.2 order), then legal-action order */
  readonly options: readonly BondOption[];
}

const DRAFT: RunOptions = { events: true, log: false, trusted: true };
const NO_EXPOSURE: AppraisalExposure = { nextRound: -1, turnsAway: 0, target: -1, targetPower: 0, cardsLost: 0 };

function exposureOf(s: GameState, env: Env): AppraisalExposure {
  if (!env.g.FLAGS.APPRAISAL) return NO_EXPOSURE;
  const round = roundOf(s);
  let next = -1;
  for (const r of env.g.APPRAISAL_ROUNDS) if (r >= round && (next < 0 || r < next)) next = r;
  if (next < 0) return NO_EXPOSURE;
  // judged on the turn the Collector will act, so timed mods and Shroud have run their course (D-075)
  const at: GameState = { ...s, turn: (next - 1) * 2 + 1 };
  const slot = appraisalTargetOf(at, env);
  if (slot < 0) return { nextRound: next, turnsAway: next - round, target: -1, targetPower: 0, cardsLost: 0 };
  const m = s.sides[0].board[slot] as Monster;
  return {
    nextRound: next,
    turnsAway: next - round,
    target: m.iid,
    targetPower: effectivePower(at, env, m.iid),
    cardsLost: m.sym >= 0 ? 2 : 1,
  };
}

function resultOf(s: GameState, env: Env, iid: Iid): BondResultMonster {
  const loc = locate(s, iid);
  const inst = s.inst[iid] as GameState['inst'][number];
  if (loc < 0) {
    // a part that went to the hand: printed facts only
    return {
      iid,
      def: inst.def,
      element: elementOf(s, env, iid),
      power: effectivePower(s, env, iid),
      guard: effectiveGuard(s, env, iid),
      kw: ((env.c.kw[inst.def] ?? 0) | (inst.chimera?.kw ?? 0)) >>> 0,
      slot: -1,
      pos: 0,
      canAttackThisTurn: false,
      unstableUntil: -1,
      symbiote: -1,
    };
  }
  const m = monsterOf(s, iid) as Monster;
  return {
    iid,
    def: inst.def,
    element: elementOf(s, env, iid),
    power: effectivePower(s, env, iid),
    guard: effectiveGuard(s, env, iid),
    kw: activeKw(s, env, iid),
    slot: locSlot(loc),
    pos: m.pos,
    canAttackThisTurn: m.pos === 0 && !m.faceDown && m.attacked !== s.turn && attackPermission(s, env, iid) !== 'none',
    unstableUntil: m.unstableUntil,
    symbiote: m.sym,
  };
}

interface BoardFacts {
  readonly board: (BondResultMonster | null)[];
  readonly power: number;
  readonly guard: number;
  readonly bodies: number;
}

function boardFacts(s: GameState, env: Env): BoardFacts {
  const board = s.sides[0].board;
  const out: (BondResultMonster | null)[] = [];
  let power = 0;
  let guard = 0;
  let bodies = 0;
  for (let i = 0; i < board.length; i++) {
    const m = board[i];
    if (m === null || m === undefined) {
      out.push(null);
      continue;
    }
    const r = resultOf(s, env, m.iid);
    out.push(r);
    power += r.power;
    guard += r.guard;
    bodies++;
  }
  return { board: out, power, guard, bodies };
}

function legalNow(env: Env, s: GameState): Action[] {
  const out: Action[] = [];
  forEachLegal(env, s, (a) => {
    out.push(a);
    return false;
  });
  return out;
}

/** The bond actions the player can take now, with predicted results (§5.6c). Facts only. */
export function bondOptions(s: GameState, env: Env): BondPreview {
  const base = boardFacts(s, env);
  const baseline = { exposure: exposureOf(s, env), boardPower: base.power, boardGuard: base.guard, bodies: base.bodies };
  const empty: BondPreview = { available: false, baseline, options: [] };
  if (s.result !== null || s.step === 'over' || s.step === 'mulligan' || s.pending !== null || activeSide(s) !== 0) return empty;

  const options: BondOption[] = [];
  const usesPlay = !env.g.FLAGS.BOND_ACTION;

  const finish = (
    kind: BondKind,
    id: string,
    steps: readonly Action[],
    positionFree: boolean,
    after: GameState,
    touched: readonly Iid[],
  ): void => {
    const facts = boardFacts(after, env);
    options.push({
      kind,
      id,
      steps,
      positionFree,
      usesPlay,
      handCardsAfter: after.sides[0].hand.length,
      result: touched.map((iid) => resultOf(after, env, iid)),
      boardAfter: facts.board,
      boardPowerDelta: facts.power - base.power,
      boardGuardDelta: facts.guard - base.guard,
      bodiesDelta: facts.bodies - base.bodies,
      exposure: exposureOf(after, env),
    });
  };

  // Graft: walk the pending stages in legal order. Each leaf is one (ordered materials, keyword choice) option.
  const walk = (st: GameState, steps: readonly Action[], chosenKw: boolean): void => {
    const p = st.pending;
    if (p === null) return;
    if (p.stage === 'position') {
      const commit = legalNow(env, st).find((a) => a.t === 'graftPosition' && a.pos === 0);
      if (commit === undefined) return;
      const r = applyAction(env, {}, DRAFT, st, commit);
      const grafted = r.events.find((e): e is Extract<GameEvent, { e: 'Grafted' }> => e.e === 'Grafted');
      if (grafted === undefined) return;
      const id = `graft:${p.mats.join(',')}${chosenKw ? `/k${p.kw}` : ''}`;
      finish('graft', id, steps, true, r.state, [grafted.iid]);
      return;
    }
    for (const a of legalNow(env, st)) {
      if (a.t === 'graftCancel') continue;
      walk(applyAction(env, {}, DRAFT, st, a).state, [...steps, a], chosenKw || a.t === 'graftKeywords');
    }
  };

  for (const a of legalNow(env, s)) {
    if (a.t === 'graftBegin') {
      walk(applyAction(env, {}, DRAFT, s, a).state, [a], false);
    } else if (a.t === 'split') {
      const r = applyAction(env, {}, DRAFT, s, a);
      const ev = r.events.find((e): e is Extract<GameEvent, { e: 'Split' }> => e.e === 'Split');
      finish('split', `split:${a.m}`, [a], false, r.state, ev === undefined ? [] : ev.parts);
    } else if (a.t === 'symbiose') {
      const r = applyAction(env, {}, DRAFT, s, a);
      finish('symbiosis', `symb:c${a.c}>h${a.host}`, [a], false, r.state, [a.host]);
    }
  }
  return { available: options.length > 0, baseline, options };
}
