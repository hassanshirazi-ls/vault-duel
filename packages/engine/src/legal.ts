// getLegalActions: the single legality source (ARCHITECTURE.md §6.2). UI, AI, bots and the reducer
// only ever choose from, or check against, this enumeration. Order is fixed and part of determinism:
//
//   over -> nothing | pending Graft -> stage actions + graftCancel | mulligan -> keep, redraw
//   main and not yet played: reposition, moveLane (LANES), summon, summonCovetous, cast, setTrap
//     (FLAGS.TURN_SLOTS, D-335: the main step lasts the whole turn; a summon needs the monster slot, cast and setTrap the
//     spell-or-trap slot, and a monster that has attacked no longer repositions or moves)
//   bond slot open (D-306; the unused play when BOND_ACTION is off): graftBegin, split, symbiose
//   main or attack: attack, endTurn
//
// Query hooks (Sentinel, Swift, Vain, Slow, Covetous) are consulted through stats.ts / dispatch.ts /
// summon.ts, so keyword constraints show up here without any keyword-specific code.
import { attackOptions } from './combat';
import { targetCandidates } from './effects/targets';
import { bondSlotOpen, canHost, canSplit, isBaseMonsterCard } from './bond';
import { forEachGraftAction, graftAllowed } from './graft';
import { mustAttack } from './hooks/dispatch';
import type { Env } from './hooks/registry';
import { activeSide, isMonsterCard, locate, locSlot } from './stats';
import { freeBoardSlot, freeLanes, freeTrapSlot, requirementOf, sacrificeCandidates } from './summon';
import type { Action, ActionVisitor, SummonMode } from './types/actions';
import type { GameState, Iid, Side } from './types/state';

const SUMMON_MODES: readonly SummonMode[] = ['atk', 'grd', 'down'];
const COVETOUS_MODES = ['atk', 'grd'] as const;
const NO_LANES: readonly number[] = [];

/** Reposition step and the play: reposition, summon, summonCovetous, cast, setTrap, graftBegin. */
function forEachPlay(env: Env, s: GameState, side: Side, visit: ActionVisitor): boolean {
  const sd = s.sides[side];
  const slots = env.g.FLAGS.TURN_SLOTS;
  const monsterSlot = !slots || !s.played;
  const spellSlot = !slots || s.spell === 0;
  const mayMove = (m: { readonly attacked: number }): boolean => !slots || m.attacked !== s.turn;
  for (let i = 0; i < sd.board.length; i++) {
    const m = sd.board[i];
    // §6.2 literally: entered earlier and not yet repositioned. Judgment call: PLAYS/REPOSITIONS_PER_TURN globals are not read
    // (turn indices allow one per monster), and D-022's "unless a keyword grants it" has no reposition hook.
    if (m !== null && m !== undefined && m.entered < s.turn && m.repositioned !== s.turn && mayMove(m)) {
      if (visit({ t: 'reposition', m: m.iid })) return true; // a face-down monster has the one option (D-023)
    }
  }
  const lanes = env.g.FLAGS.LANES;
  if (lanes) {
    // lane move or swap: after the repositions, own monsters in slot order, lanes ascending (D-282)
    const range = env.g.LANE_MOVE_RANGE;
    for (let i = 0; i < sd.board.length; i++) {
      const m = sd.board[i];
      if (m === null || m === undefined || m.entered >= s.turn || m.repositioned === s.turn || !mayMove(m)) continue;
      for (let to = Math.max(0, i - range); to <= i + range && to < sd.board.length; to++) {
        if (to === i) continue;
        const other = sd.board[to];
        if (other !== null && other !== undefined) {
          if (!env.g.FLAGS.LANE_SWAP || other.entered >= s.turn || other.repositioned === s.turn || !mayMove(other)) continue;
        }
        if (visit({ t: 'moveLane', m: m.iid, to })) return true;
      }
    }
  }
  const hand = sd.hand;
  const slotFree = monsterSlot && freeBoardSlot(s, side) >= 0;
  const free = lanes && slotFree ? freeLanes(s, side) : NO_LANES;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i] as Iid;
    // Judgment call: a Chimera card in hand (Echo, Grave Recall) is a monster and may be summoned in any of the three modes.
    if (!isMonsterCard(s, env, c) || !slotFree) continue;
    if (requirementOf(s, env, side, c).kind !== 'normal') continue;
    for (const mode of SUMMON_MODES) {
      if (!lanes) {
        if (visit({ t: 'summon', c, mode })) return true;
        continue;
      }
      for (let k = 0; k < free.length; k++) if (visit({ t: 'summon', c, mode, lane: free[k] as number })) return true;
    }
  }
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i] as Iid;
    if (!monsterSlot || !isMonsterCard(s, env, c)) continue;
    for (const sac of sacrificeCandidates(s, env, side, c)) {
      // the sacrifice frees its own lane when it stands on the board (D-284)
      const sacLoc = lanes ? locate(s, sac) : -1;
      const sacLane = sacLoc >= 0 ? locSlot(sacLoc) : -1;
      for (const mode of COVETOUS_MODES) {
        if (!lanes) {
          if (visit({ t: 'summonCovetous', c, sac, mode })) return true;
          continue;
        }
        const board = sd.board;
        for (let lane = 0; lane < board.length; lane++) {
          if (board[lane] !== null && lane !== sacLane) continue;
          if (visit({ t: 'summonCovetous', c, sac, mode, lane })) return true;
        }
      }
    }
  }
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i] as Iid;
    const def = s.inst[c]?.def;
    const spell = def === undefined || !spellSlot ? null : (env.c.spell[def] ?? null);
    if (spell === null) continue;
    if (spell.target === undefined) {
      if (visit({ t: 'cast', c, target: -1 })) return true;
      continue;
    }
    for (const target of targetCandidates(s, env, side, spell.target, spell.effects)) {
      if (visit({ t: 'cast', c, target })) return true; // targeted spells need >= 1 legal target (D-067)
    }
  }
  if (spellSlot && freeTrapSlot(s, side) >= 0) {
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i] as Iid;
      const def = s.inst[c]?.def;
      if (def !== undefined && (env.c.trap[def] ?? null) !== null && visit({ t: 'setTrap', c })) return true;
    }
  }
  return false;
}

/**
 * The bond actions (D-305, D-306): graftBegin, split, symbiose. Same place in the order with BOND_ACTION off (they are
 * plays, so this runs only while the play is unused) and on (the bond slot is open, in the main or attack step).
 */
function forEachBond(env: Env, s: GameState, side: Side, visit: ActionVisitor): boolean {
  if (graftAllowed(s, env, side) && visit({ t: 'graftBegin' })) return true;
  const sd = s.sides[side];
  if (env.g.FLAGS.SPLIT) {
    for (let i = 0; i < sd.board.length; i++) {
      const m = sd.board[i];
      if (m !== null && m !== undefined && canSplit(s, env, side, m) && visit({ t: 'split', m: m.iid })) return true;
    }
  }
  if (env.g.FLAGS.SYMBIOSIS) {
    for (let k = 0; k < sd.hand.length; k++) {
      const c = sd.hand[k] as Iid;
      if (!isBaseMonsterCard(s, env, c)) continue;
      for (let i = 0; i < sd.board.length; i++) {
        const host = sd.board[i];
        if (host !== null && host !== undefined && canHost(side, host) && visit({ t: 'symbiose', c, host: host.iid })) return true;
      }
    }
  }
  return false;
}

/** Attacks, then endTurn unless a Vain monster still has a legal attack (D-052). */
function forEachAttackAndEnd(env: Env, s: GameState, side: Side, visit: ActionVisitor): boolean {
  const board = s.sides[side].board;
  let forced = false;
  for (let i = 0; i < board.length; i++) {
    const m = board[i];
    if (m === null || m === undefined) continue;
    const targets = attackOptions(s, env, m.iid);
    if (targets.length > 0 && mustAttack(env, s, m.iid)) forced = true;
    for (const target of targets) if (visit({ t: 'attack', a: m.iid, target })) return true;
  }
  return !forced && visit({ t: 'endTurn' });
}

/** Visit every legal action of the side to move, in the fixed §6.2 order. Return `true` from the visitor to stop. */
export function forEachLegal(env: Env, s: GameState, visit: ActionVisitor): void {
  if (s.step === 'over' || s.result !== null) return;
  if (s.pending !== null) {
    forEachGraftAction(s, env, visit);
    return;
  }
  if (s.step === 'mulligan') {
    if (visit({ t: 'keep' })) return;
    if (env.g.FLAGS.REDRAW && s.redrawsLeft > 0) visit({ t: 'redraw' });
    return;
  }
  const side = activeSide(s);
  if (s.step === 'main' && (env.g.FLAGS.TURN_SLOTS || !s.played) && forEachPlay(env, s, side, visit)) return;
  if (bondSlotOpen(s, env) && forEachBond(env, s, side, visit)) return;
  forEachAttackAndEnd(env, s, side, visit);
}

export function getLegalActions(env: Env, s: GameState): Action[] {
  const out: Action[] = [];
  forEachLegal(env, s, (a) => {
    out.push(a);
    return false;
  });
  return out;
}

export function countLegal(env: Env, s: GameState): number {
  let n = 0;
  forEachLegal(env, s, () => {
    n++;
    return false;
  });
  return n;
}

/** Structural equality of two actions. */
export function sameAction(a: Action, b: Action): boolean {
  switch (a.t) {
    case 'redraw':
    case 'keep':
    case 'graftBegin':
    case 'graftSkipAscend':
    case 'graftCancel':
    case 'endTurn':
      return a.t === b.t;
    case 'reposition':
      return b.t === 'reposition' && a.m === b.m;
    case 'moveLane':
      return b.t === 'moveLane' && a.m === b.m && a.to === b.to;
    case 'summon':
      return b.t === 'summon' && a.c === b.c && a.mode === b.mode && a.lane === b.lane;
    case 'summonCovetous':
      return b.t === 'summonCovetous' && a.c === b.c && a.sac === b.sac && a.mode === b.mode && a.lane === b.lane;
    case 'cast':
      return b.t === 'cast' && a.c === b.c && a.target === b.target;
    case 'setTrap':
      return b.t === 'setTrap' && a.c === b.c;
    case 'graftPick':
      return b.t === 'graftPick' && a.m === b.m;
    case 'graftKeywords':
      return b.t === 'graftKeywords' && a.kw === b.kw;
    case 'graftPosition':
      return b.t === 'graftPosition' && a.pos === b.pos && a.lane === b.lane;
    case 'split':
      return b.t === 'split' && a.m === b.m;
    case 'symbiose':
      return b.t === 'symbiose' && a.c === b.c && a.host === b.host;
    case 'attack':
      return b.t === 'attack' && a.a === b.a && a.target === b.target;
  }
}

/** Early-exit membership test against the generator (§6.2). */
export function isLegal(env: Env, s: GameState, action: Action): boolean {
  let found = false;
  forEachLegal(env, s, (a) => {
    found = sameAction(a, action);
    return found;
  });
  return found;
}
