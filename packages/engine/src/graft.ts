// Graft (ARCHITECTURE.md §5.6, §6.2 graft stages; D-026, D-056 to D-065).
//
// A Graft is a pending multi-step choice (`state.pending`): graftBegin, graftPick (material 1,
// material 2, optionally an Ascend material), graftKeywords (only when more keywords are available than
// can be inherited), graftPosition (commits). graftCancel is legal at every stage and nothing is applied
// before the commit. legal.ts calls `forEachGraftAction`; the reducer calls the action functions.
import { EngineError } from './errors';
import type { Env } from './hooks/registry';
import { makeMonster } from './monster';
import type { Run } from './pipeline';
import { activeSide, elementOf, kindOf, locate, locSlot, printedKw } from './stats';
import { entrySlot, playUsed } from './summon';
import { markRound } from './track';
import type { Action, ActionVisitor } from './types/actions';
import { DefType } from './types/content';
import type { DefIdx, ElemIdx, KwMask } from './types/content';
import type { Globals } from './types/globals';
import type { GameState, GraftStage, Iid, PendingGraft, Pos, Side } from './types/state';
import { RoundFlag } from './types/state';

// ---- eligibility -----------------------------------------------------------------------------

/** D-026: the player always may; the Collector only when collector.json says so. */
export const canGraft = (env: Env, side: Side): boolean => side === 0 || env.c.collector.canGraft;

/** Only base monsters are materials; Chimeras never are (D-056). */
function isBaseMonster(s: GameState, env: Env, iid: Iid): boolean {
  const inst = s.inst[iid];
  return inst !== undefined && inst.chimera === null && env.c.type[inst.def] === DefType.Monster;
}

const onOwnBoard = (s: GameState, side: Side, iid: Iid): boolean => s.sides[side].board.some((m) => m?.iid === iid);

/** Eligible materials of `side`: base monsters in hand (hand order), then on its board (slot order). Face-down ones count (D-057). */
export function eligibleMaterials(s: GameState, env: Env, side: Side): Iid[] {
  const out: Iid[] = [];
  const sd = s.sides[side];
  for (let i = 0; i < sd.hand.length; i++) if (isBaseMonster(s, env, sd.hand[i] as Iid)) out.push(sd.hand[i] as Iid);
  for (let i = 0; i < sd.board.length; i++) {
    const m = sd.board[i];
    if (m !== null && m !== undefined && isBaseMonster(s, env, m.iid)) out.push(m.iid);
  }
  return out;
}

/** A monster slot is free once the chosen board materials are sacrificed (D-057). */
function slotFeasible(s: GameState, side: Side, mats: readonly Iid[]): boolean {
  const board = s.sides[side].board;
  let free = 0;
  for (let i = 0; i < board.length; i++) if (board[i] === null) free++;
  for (let i = 0; i < mats.length; i++) if (onOwnBoard(s, side, mats[i] as Iid)) free++;
  return free >= 1;
}

/** Chimera family of two materials' kinds, or -1 when the recipe table has no entry. */
function familyOf(s: GameState, env: Env, a: Iid, b: Iid): DefIdx {
  const ka = kindOf(s, env, a);
  const kb = kindOf(s, env, b);
  if (ka < 0 || kb < 0) return -1;
  return env.c.recipe[ka * env.c.nKinds + kb] ?? -1;
}

const pairOk = (s: GameState, env: Env, side: Side, a: Iid, b: Iid): boolean =>
  a !== b && familyOf(s, env, a, b) >= 0 && slotFeasible(s, side, [a, b]);

/** Material 1 candidates: eligible monsters that have at least one valid partner, so no pending Graft is a dead end. Judgment call: §6.2 says "each eligible base monster"; this also requires a feasible partner. */
export function mat1Candidates(s: GameState, env: Env, side: Side): Iid[] {
  const all = eligibleMaterials(s, env, side);
  return all.filter((a) => all.some((b) => pairOk(s, env, side, a, b)));
}

export function mat2Candidates(s: GameState, env: Env, side: Side, mat1: Iid): Iid[] {
  return eligibleMaterials(s, env, side).filter((b) => pairOk(s, env, side, mat1, b));
}

export function ascendCandidates(s: GameState, env: Env, side: Side, mats: readonly Iid[]): Iid[] {
  return eligibleMaterials(s, env, side).filter((x) => !mats.includes(x) && slotFeasible(s, side, [...mats, x]));
}

/** `graftBegin` legality (§6.2): may graft, enough eligible materials, and a feasible pair. */
export function graftAllowed(s: GameState, env: Env, side: Side): boolean {
  return (
    canGraft(env, side) &&
    eligibleMaterials(s, env, side).length >= env.g.MIN_GRAFT_MATERIALS &&
    mat1Candidates(s, env, side).length > 0
  );
}

// ---- keywords --------------------------------------------------------------------------------

/** Bits of the registry that are keywords (not Flaws). Only keywords are inherited (judgment call, see report). */
function keywordBits(env: Env): KwMask {
  let m = 0;
  const kws = env.c.keywords;
  for (let i = 0; i < kws.length; i++) if (kws[i]?.kind === 'keyword') m |= 1 << i;
  return m >>> 0;
}

const popcount = (m: number): number => {
  let n = 0;
  for (let b = m | 0; b !== 0; b &= b - 1) n++;
  return n;
};

/**
 * Distinct union of the materials' printed keywords (D-059, D-182 ruling B). Every material gives its printed
 * keywords wherever it is: a face-down board material and a board material whose Ward is used pass them on
 * exactly as the same card would from the hand. Flaw bits are masked out (D-181).
 */
export function keywordUnion(s: GameState, env: Env, mats: readonly Iid[]): KwMask {
  let u = 0;
  for (let i = 0; i < mats.length; i++) u |= printedKw(s, env, mats[i] as Iid);
  return (u & keywordBits(env)) >>> 0;
}

/** All `n`-subsets of the bits of `mask`, in lexicographic bit order (the order graftKeywords actions are listed in). */
export function subsetsOfSize(mask: KwMask, n: number): KwMask[] {
  const bits: number[] = [];
  for (let i = 0; i < 32; i++) if ((mask & (1 << i)) !== 0) bits.push(i);
  const out: KwMask[] = [];
  const rec = (start: number, left: number, acc: number): void => {
    if (left === 0) {
      out.push(acc >>> 0);
      return;
    }
    for (let i = start; i <= bits.length - left; i++) rec(i + 1, left - 1, acc | (1 << (bits[i] as number)));
  };
  if (n > 0 && n <= bits.length) rec(0, n, 0);
  return out;
}

// ---- stages ----------------------------------------------------------------------------------

/** Stage after the last material is known: pick keywords only when there are too many (§5.6). */
function afterMaterials(s: GameState, env: Env, mats: readonly Iid[]): { stage: GraftStage; kw: KwMask } {
  const union = keywordUnion(s, env, mats);
  return popcount(union) > env.g.MAX_INHERITED_KEYWORDS ? { stage: 'keywords', kw: 0 } : { stage: 'position', kw: union };
}

function pendingOf(s: GameState, stage?: GraftStage): PendingGraft {
  const p = s.pending;
  if (p === null || (stage !== undefined && p.stage !== stage)) {
    throw new EngineError(`graft: no pending Graft at stage ${stage ?? 'any'}`);
  }
  return p;
}

function setStage(run: Run, p: PendingGraft): void {
  run.tx.set('pending', p);
  run.emit({ e: 'GraftStep', stage: p.stage, mats: p.mats });
}

export function graftBegin(run: Run): void {
  run.tx.set('pending', { kind: 'graft', stage: 'mat1', mats: [], kw: 0 });
  run.emit({ e: 'GraftStarted' });
}

export function graftPick(run: Run, m: Iid): void {
  const { tx, env } = run;
  const s = tx.state;
  const p = pendingOf(s);
  const mats = [...p.mats, m];
  if (p.stage === 'mat1') {
    setStage(run, { ...p, stage: 'mat2', mats });
  } else if (p.stage === 'mat2') {
    const ascend =
      env.g.FLAGS.ASCEND &&
      mats.length < env.g.MAX_GRAFT_MATERIALS &&
      ascendCandidates(s, env, activeSide(s), mats).length > 0;
    setStage(run, ascend ? { ...p, stage: 'ascend', mats } : { ...p, mats, ...afterMaterials(s, env, mats) });
  } else if (p.stage === 'ascend') {
    setStage(run, { ...p, mats, ...afterMaterials(s, env, mats) });
  } else {
    throw new EngineError(`graft: cannot pick a material at stage ${p.stage}`);
  }
}

export function graftSkipAscend(run: Run): void {
  const { tx, env } = run;
  const p = pendingOf(tx.state, 'ascend');
  setStage(run, { ...p, ...afterMaterials(tx.state, env, p.mats) });
}

export function graftKeywords(run: Run, kw: KwMask): void {
  const p = pendingOf(run.state, 'keywords');
  setStage(run, { ...p, stage: 'position', kw });
}

export function graftCancel(run: Run): void {
  pendingOf(run.state);
  run.tx.set('pending', null);
  run.emit({ e: 'GraftCancelled' });
}

/** Unstable if any pair of the materials' elements oppose (D-061), gated by FLAGS.UNSTABLE. */
function opposing(s: GameState, env: Env, mats: readonly Iid[]): boolean {
  if (!env.g.FLAGS.UNSTABLE) return false;
  const n = env.c.nElements;
  for (let i = 0; i < mats.length; i++) {
    for (let j = i + 1; j < mats.length; j++) {
      const a = elementOf(s, env, mats[i] as Iid);
      const b = elementOf(s, env, mats[j] as Iid);
      if (a >= 0 && b >= 0 && env.c.opposes[a * n + b] === 1) return true;
    }
  }
  return false;
}

/**
 * Turn index at whose end an Unstable Chimera grafted on `turn` is destroyed (D-062, D-183). With
 * `e = turn + UNSTABLE_EXPIRY_TURNS` (the end of the grafter's next turn): 'endOfNextOwnTurn' is `e`;
 * 'startOfOwnTurnAfterNext' is `e + DURATION_NEXT_OWN_TURN - 1`, i.e. "until the start of turn n" encoded as
 * "through the end of turn n - 1" (D-136), so the end-of-turn destruction step does not change.
 */
export function unstableExpiry(turn: number, g: Globals): number {
  const e = turn + g.UNSTABLE_EXPIRY_TURNS;
  switch (g.UNSTABLE_EXPIRY) {
    case 'endOfNextOwnTurn':
      return e;
    case 'startOfOwnTurnAfterNext':
      return e + g.DURATION_NEXT_OWN_TURN - 1;
  }
}

/** `graftPosition`: commit (§5.6). Materials are sacrificed, not destroyed: no hooks, owner's discard (D-058). */
export function graftPosition(run: Run, pos: Pos, lane?: number): number {
  const { tx, env } = run;
  const p = pendingOf(tx.state, 'position');
  const side = activeSide(tx.state);
  const turn = tx.state.turn;
  const mats = p.mats;
  const family = familyOf(tx.state, env, mats[0] as Iid, mats[1] as Iid);
  if (family < 0) throw new EngineError('graft: no recipe for the chosen materials');
  const element: ElemIdx = elementOf(tx.state, env, mats[0] as Iid);
  const unstable = opposing(tx.state, env, mats);
  const ascended = mats.length > env.g.MIN_GRAFT_MATERIALS;

  for (let i = 0; i < mats.length; i++) {
    const iid = mats[i] as Iid;
    const loc = locate(tx.state, iid);
    if (loc >= 0) {
      tx.setSlot(side, locSlot(loc), null);
      run.emit({ e: 'Sacrificed', iid, reason: 'graft', from: 'board' });
    } else if (tx.zoneRemove(side, 'hand', iid)) {
      run.emit({ e: 'Sacrificed', iid, reason: 'graft', from: 'hand' });
    } else {
      throw new EngineError(`graft: material ${iid} is neither on the board nor in the hand`);
    }
    tx.zonePush(tx.state.inst[iid]?.owner ?? side, 'discard', iid);
  }

  const iid = tx.pushInstance({
    def: family,
    owner: side,
    chimera: { element, kw: p.kw, ascended, materials: mats, grafted: turn },
  });
  const slot = entrySlot(run, side, lane); // after the sacrifice, so a material's lane is free again (D-284)
  tx.setSlot(
    side,
    slot,
    makeMonster(iid, { pos, entered: turn, unstableUntil: unstable ? unstableExpiry(turn, env.g) : -1 }),
  );

  tx.set('pending', null);
  playUsed(run); // same tail as every play (D-155)
  if (side === 0) {
    // Judgment call: Track.grafts / families count the player's Grafts only, like the round flags (D-127).
    const t = tx.state.track;
    tx.set('track', { ...t, grafts: t.grafts + 1, families: t.families.includes(family) ? t.families : [...t.families, family] });
    markRound(tx, RoundFlag.Grafted);
  }
  run.emit({ e: 'Grafted', side, iid, family, element, materials: mats, kw: p.kw, ascended, unstable, slot, pos });
  run.dispatcher().onGraft({ iid, side, family, materials: mats });
  run.flush();
  return slot;
}

// ---- preview -----------------------------------------------------------------------------------

export interface GraftPreview {
  readonly family: DefIdx;
  readonly element: ElemIdx;
  readonly power: number;
  readonly guard: number;
  readonly ascended: boolean;
  readonly unstable: boolean;
  /** turn index at whose end the Chimera is destroyed, or -1 */
  readonly unstableUntil: number;
  /** distinct inheritable keywords of the materials so far */
  readonly keywordsAvailable: KwMask;
  /** the `graftKeywords` choices when more than MAX_INHERITED_KEYWORDS are available, else [] (all are inherited) */
  readonly keywordOptions: readonly KwMask[];
  /** keywords the Chimera would have: auto-inherited, or the chosen pair (0 until chosen) */
  readonly kw: KwMask;
  /** slot it would enter, after the sacrifice */
  readonly slot: number;
}

/** The Chimera the current pending choices would create (§5.6); null with no pending Graft or < 2 materials. */
export function previewGraft(s: GameState, env: Env): GraftPreview | null {
  const p = s.pending;
  if (p === null || p.mats.length < 2) return null;
  const side = activeSide(s);
  const mats = p.mats;
  const family = familyOf(s, env, mats[0] as Iid, mats[1] as Iid);
  if (family < 0) return null;
  const unstable = opposing(s, env, mats);
  const ascended = mats.length > env.g.MIN_GRAFT_MATERIALS;
  const stat = (base: number, ascend: number, unst: number): number =>
    Math.max(env.g.STAT_FLOOR, base + (ascended ? ascend : 0) + (unstable ? unst : 0));
  const available = keywordUnion(s, env, mats);
  const choose = popcount(available) > env.g.MAX_INHERITED_KEYWORDS;
  const board = s.sides[side].board;
  let slot = -1;
  for (let i = 0; i < board.length && slot < 0; i++) {
    if (board[i] === null || mats.includes(board[i]?.iid ?? -1)) slot = i;
  }
  return {
    family,
    element: elementOf(s, env, mats[0] as Iid),
    power: stat(env.c.power[family] ?? 0, env.g.ASCEND_POWER, env.g.UNSTABLE_BONUS),
    guard: stat(env.c.guard[family] ?? 0, env.g.ASCEND_GUARD, 0),
    ascended,
    unstable,
    unstableUntil: unstable ? unstableExpiry(s.turn, env.g) : -1,
    keywordsAvailable: available,
    keywordOptions: choose ? subsetsOfSize(available, env.g.MAX_INHERITED_KEYWORDS) : [],
    kw: choose ? p.kw : available,
    slot,
  };
}

// ---- legal actions -------------------------------------------------------------------------

/** Pending-Graft actions of §6.2, stage by stage, then `graftCancel`. Returns true when the visitor stopped. */
export function forEachGraftAction(s: GameState, env: Env, visit: ActionVisitor): boolean {
  const p = s.pending;
  if (p === null) return false;
  const side = activeSide(s);
  const pick = (m: Iid): boolean => visit({ t: 'graftPick', m });
  switch (p.stage) {
    case 'mat1':
      for (const m of mat1Candidates(s, env, side)) if (pick(m)) return true;
      break;
    case 'mat2':
      for (const m of mat2Candidates(s, env, side, p.mats[0] as Iid)) if (pick(m)) return true;
      break;
    case 'ascend':
      for (const m of ascendCandidates(s, env, side, p.mats)) if (pick(m)) return true;
      if (visit({ t: 'graftSkipAscend' })) return true;
      break;
    case 'keywords':
      for (const kw of subsetsOfSize(keywordUnion(s, env, p.mats), env.g.MAX_INHERITED_KEYWORDS)) {
        if (visit({ t: 'graftKeywords', kw })) return true;
      }
      break;
    case 'position':
      if (!env.g.FLAGS.LANES) {
        for (const pos of [0, 1] as const) if (visit({ t: 'graftPosition', pos })) return true;
        break;
      }
      // one action per (position, lane); the lanes of board materials are free once they are sacrificed (D-284)
      for (const pos of [0, 1] as const) {
        const board = s.sides[side].board;
        for (let lane = 0; lane < board.length; lane++) {
          const occupant = board[lane];
          if (occupant !== null && occupant !== undefined && !p.mats.includes(occupant.iid)) continue;
          if (visit({ t: 'graftPosition', pos, lane })) return true;
        }
      }
      break;
  }
  const cancel: Action = { t: 'graftCancel' };
  return visit(cancel);
}
