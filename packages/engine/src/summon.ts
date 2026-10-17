// Summon, Covetous summon and set trap (ARCHITECTURE.md §5, §6; D-014, D-021, D-025, D-037, D-047,
// D-054, D-055, D-058, D-122, D-137). legal.ts decides legality; these functions assume a legal
// action and throw EngineError only when an invariant they rely on does not hold.
import { summonRequirement } from './hooks/dispatch';
import type { Env } from './hooks/registry';
import { makeMonster } from './monster';
import type { Run } from './pipeline';
import { activeSide, locate, locSide, locSlot, printedKw } from './stats';
import { EngineError } from './errors';
import type { SummonMode } from './types/actions';
import type { SummonReq } from './types/hooks';
import type { GameState, Iid, Pos, Side } from './types/state';

/** Leftmost empty monster slot, or -1 (D-021). */
export function freeBoardSlot(s: GameState, side: Side): number {
  const board = s.sides[side].board;
  for (let i = 0; i < board.length; i++) if (board[i] === null) return i;
  return -1;
}

/** Empty monster lanes (slot indexes), ascending (D-284). */
export function freeLanes(s: GameState, side: Side): number[] {
  const board = s.sides[side].board;
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) if (board[i] === null) out.push(i);
  return out;
}

/**
 * The slot a new monster enters: the leftmost free one, or the chosen lane under FLAGS.LANES (D-284). The engine
 * requires a lane with LANES on and rejects one with LANES off.
 */
export function entrySlot(run: Run, side: Side, lane: number | undefined): number {
  const { tx, env } = run;
  if (!env.g.FLAGS.LANES) {
    if (lane !== undefined) throw new EngineError('lane given but FLAGS.LANES is off');
    const slot = freeBoardSlot(tx.state, side);
    if (slot < 0) throw new EngineError('summon: no free monster slot');
    return slot;
  }
  if (lane === undefined) throw new EngineError('FLAGS.LANES is on: a lane is required');
  if (!Number.isInteger(lane) || lane < 0 || lane >= tx.state.sides[side].board.length || tx.state.sides[side].board[lane] !== null) {
    throw new EngineError(`lane ${lane} is not an empty lane`);
  }
  return lane;
}

/** Leftmost empty trap slot, or -1 (D-021). */
export function freeTrapSlot(s: GameState, side: Side): number {
  const traps = s.sides[side].traps;
  for (let i = 0; i < traps.length; i++) if (traps[i] === null) return i;
  return -1;
}

/** Summon requirement of a hand card (most restrictive across its Flaws, D-137). */
export function requirementOf(s: GameState, env: Env, side: Side, c: Iid): SummonReq {
  return summonRequirement(env, s, c, side, printedKw(s, env, c));
}

/**
 * Sacrifice candidates for a Covetous summon, in the fixed order of D-137: own board in slot order,
 * then the vault in vault order, filtered by the requirement's `zones` (never by its array order).
 * Board candidates are monsters acquired through Appraisal and always leave a free slot; vault
 * candidates need a free slot now (D-054). Empty for a card whose requirement is `normal`.
 */
export function sacrificeCandidates(s: GameState, env: Env, side: Side, c: Iid): Iid[] {
  const req = requirementOf(s, env, side, c);
  if (req.kind !== 'sacrifice') return [];
  const out: Iid[] = [];
  const sd = s.sides[side];
  if (req.zones.includes('board')) {
    for (let i = 0; i < sd.board.length; i++) {
      const m = sd.board[i];
      if (m !== null && m !== undefined && m.appraised) out.push(m.iid);
    }
  }
  if (req.zones.includes('vault') && freeBoardSlot(s, side) >= 0) {
    for (let i = 0; i < sd.vault.length; i++) out.push(sd.vault[i] as Iid);
  }
  return out;
}

const POS_OF_MODE = { atk: 0, grd: 1, down: 1 } as const satisfies Record<SummonMode, Pos>;

/** Common tail of a play: the one play of the turn is used and the Reposition step closes (D-014). */
export function playUsed(run: Run): void {
  run.tx.set('played', true);
  run.tx.set('step', 'attack');
}

/** Put a monster on the leftmost free slot, or the chosen lane (summon, Covetous). Returns the slot. */
function enter(run: Run, side: Side, iid: Iid, mode: SummonMode, lane: number | undefined): number {
  const { tx } = run;
  const slot = entrySlot(run, side, lane);
  tx.setSlot(side, slot, makeMonster(iid, { pos: POS_OF_MODE[mode], faceDown: mode === 'down', entered: tx.state.turn }));
  run.emit({ e: 'Summoned', side, iid, slot, pos: POS_OF_MODE[mode], faceDown: mode === 'down' });
  return slot;
}

function takeFromHand(run: Run, side: Side, c: Iid): void {
  if (!run.tx.zoneRemove(side, 'hand', c)) throw new EngineError(`card ${c} is not in the hand of side ${side}`);
}

/** `summon` action: hand -> leftmost free slot in the chosen mode, then onSummon (§5; D-122). */
export function summon(run: Run, c: Iid, mode: SummonMode, lane?: number): number {
  const side = activeSide(run.state);
  takeFromHand(run, side, c);
  const slot = enter(run, side, c, mode, lane);
  playUsed(run);
  run.dispatcher().onSummon({ iid: c, side, slot, covetous: false });
  run.flush();
  return slot;
}

/**
 * `summonCovetous` action (D-054): sacrifice an Appraised monster from the board or the vault (not
 * destruction: no Ward, Echo, Haunt or trap hooks, D-058), it goes to its owner's discard (D-047),
 * then the card enters face-up and onSummon fires with `covetous: true`.
 */
export function summonCovetous(run: Run, c: Iid, sac: Iid, mode: 'atk' | 'grd', lane?: number): number {
  const { tx, env } = run;
  const side = activeSide(tx.state);
  takeFromHand(run, side, c);
  const loc = locate(tx.state, sac);
  let sacSym: Iid = -1; // the sacrificed host's attached symbiote leaves with it (D-308)
  if (loc >= 0) {
    if (locSide(loc) !== side) throw new EngineError(`covetous: ${sac} is on the other board`);
    sacSym = tx.state.sides[side].board[locSlot(loc)]?.sym ?? -1;
    tx.setSlot(side, locSlot(loc), null);
    run.emit({ e: 'Sacrificed', iid: sac, reason: 'covetous', from: 'board' });
  } else if (tx.zoneRemove(side, 'vault', sac)) {
    run.emit({ e: 'Sacrificed', iid: sac, reason: 'covetous', from: 'vault' });
  } else {
    throw new EngineError(`covetous: ${sac} is neither on the board nor in the vault`);
  }
  tx.zonePush(tx.state.inst[sac]?.owner ?? side, 'discard', sac);
  if (sacSym >= 0) {
    run.emit({ e: 'Sacrificed', iid: sacSym, reason: 'covetous', from: 'board' });
    tx.zonePush(tx.state.inst[sacSym]?.owner ?? side, 'discard', sacSym);
  }
  const slot = enter(run, side, c, mode, lane);
  run.emit({ e: 'CovetousSummoned', iid: c, sacrificed: sac, slot });
  if (tx.state.inst[c]?.def === env.c.collector.ace && !tx.state.track.unpriced) {
    tx.set('track', { ...tx.state.track, unpriced: true });
  }
  playUsed(run);
  run.dispatcher().onSummon({ iid: c, side, slot, covetous: true });
  run.flush();
  return slot;
}

/** `setTrap` action: hand -> leftmost free trap slot, set this turn. No hooks fire (§5). */
export function setTrap(run: Run, c: Iid): number {
  const { tx } = run;
  const side = activeSide(tx.state);
  const slot = freeTrapSlot(tx.state, side);
  if (slot < 0) throw new EngineError('setTrap: no free trap slot');
  takeFromHand(run, side, c);
  tx.setTrap(side, slot, { iid: c, set: tx.state.turn });
  run.emit({ e: 'TrapSet', side, iid: c, slot });
  playUsed(run);
  return slot;
}
