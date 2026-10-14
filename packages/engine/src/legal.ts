// getLegalActions: the single legality source (ARCHITECTURE.md §6.2). UI, AI, bots and the reducer
// only ever choose from, or check against, this enumeration. Order is fixed and part of determinism:
//
//   over -> nothing | pending Graft -> stage actions + graftCancel | mulligan -> keep, redraw
//   main and not yet played: reposition, summon, summonCovetous, cast, setTrap, graftBegin
//   main or attack: attack, endTurn
//
// Query hooks (Sentinel, Swift, Vain, Slow, Covetous) are consulted through stats.ts / dispatch.ts /
// summon.ts, so keyword constraints show up here without any keyword-specific code.
import { attackOptions } from './combat';
import { targetCandidates } from './effects/targets';
import { forEachGraftAction, graftAllowed } from './graft';
import { mustAttack } from './hooks/dispatch';
import type { Env } from './hooks/registry';
import { activeSide, isMonsterCard } from './stats';
import { freeBoardSlot, freeTrapSlot, requirementOf, sacrificeCandidates } from './summon';
import type { Action, ActionVisitor, SummonMode } from './types/actions';
import type { GameState, Iid, Side } from './types/state';

const SUMMON_MODES: readonly SummonMode[] = ['atk', 'grd', 'down'];
const COVETOUS_MODES = ['atk', 'grd'] as const;

/** Reposition step and the play: reposition, summon, summonCovetous, cast, setTrap, graftBegin. */
function forEachPlay(env: Env, s: GameState, side: Side, visit: ActionVisitor): boolean {
  const sd = s.sides[side];
  for (let i = 0; i < sd.board.length; i++) {
    const m = sd.board[i];
    // §6.2 literally: entered earlier and not yet repositioned. Judgment call: PLAYS/REPOSITIONS_PER_TURN globals are not read
    // (turn indices allow one per monster), and D-022's "unless a keyword grants it" has no reposition hook.
    if (m !== null && m !== undefined && m.entered < s.turn && m.repositioned !== s.turn) {
      if (visit({ t: 'reposition', m: m.iid })) return true; // a face-down monster has the one option (D-023)
    }
  }
  const hand = sd.hand;
  const slotFree = freeBoardSlot(s, side) >= 0;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i] as Iid;
    // Judgment call: a Chimera card in hand (Echo, Grave Recall) is a monster and may be summoned in any of the three modes.
    if (!isMonsterCard(s, env, c) || !slotFree) continue;
    if (requirementOf(s, env, side, c).kind !== 'normal') continue;
    for (const mode of SUMMON_MODES) if (visit({ t: 'summon', c, mode })) return true;
  }
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i] as Iid;
    if (!isMonsterCard(s, env, c)) continue;
    for (const sac of sacrificeCandidates(s, env, side, c)) {
      for (const mode of COVETOUS_MODES) if (visit({ t: 'summonCovetous', c, sac, mode })) return true;
    }
  }
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i] as Iid;
    const def = s.inst[c]?.def;
    const spell = def === undefined ? null : (env.c.spell[def] ?? null);
    if (spell === null) continue;
    if (spell.target === undefined) {
      if (visit({ t: 'cast', c, target: -1 })) return true;
      continue;
    }
    for (const target of targetCandidates(s, env, side, spell.target, spell.effects)) {
      if (visit({ t: 'cast', c, target })) return true; // targeted spells need >= 1 legal target (D-067)
    }
  }
  if (freeTrapSlot(s, side) >= 0) {
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i] as Iid;
      const def = s.inst[c]?.def;
      if (def !== undefined && (env.c.trap[def] ?? null) !== null && visit({ t: 'setTrap', c })) return true;
    }
  }
  return graftAllowed(s, env, side) && visit({ t: 'graftBegin' });
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
  if (s.step === 'main' && !s.played && forEachPlay(env, s, side, visit)) return;
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
    case 'summon':
      return b.t === 'summon' && a.c === b.c && a.mode === b.mode;
    case 'summonCovetous':
      return b.t === 'summonCovetous' && a.c === b.c && a.sac === b.sac && a.mode === b.mode;
    case 'cast':
      return b.t === 'cast' && a.c === b.c && a.target === b.target;
    case 'setTrap':
      return b.t === 'setTrap' && a.c === b.c;
    case 'graftPick':
      return b.t === 'graftPick' && a.m === b.m;
    case 'graftKeywords':
      return b.t === 'graftKeywords' && a.kw === b.kw;
    case 'graftPosition':
      return b.t === 'graftPosition' && a.pos === b.pos;
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
