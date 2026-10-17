// Bond actions (ARCHITECTURE.md §5.6a, §5.6b, §6.2; D-305 to D-316): Split and Symbiosis, the shared bond slot,
// and the release of a symbiote when its host leaves the board. Graft is the third bond action (graft.ts).
//
//   split m          FLAGS.SPLIT: an own face-up Chimera comes apart into its stored materials (they leave the discard)
//   symbiose c host  FLAGS.SYMBIOSIS: a hand monster is attached under a face-up own monster (+Guard, its keyword)
//   releaseSymbiote  called by the destroy batch and by board-to-hand effects, and nowhere else
//
// Both are player-only (D-305): `canBond(side)` is a rule, not data. With FLAGS.BOND_ACTION off they are plays,
// like Graft; with it on they use the bond slot (`GameState.bond`), beside the one card play (D-306).
import { EngineError } from './errors';
import type { Env } from './hooks/registry';
import { makeMonster } from './monster';
import type { Run } from './pipeline';
import { activeKwOf, activeSide, effectiveGuard, locate, locSlot } from './stats';
import { freeBoardSlot, playUsed } from './summon';
import { DefType } from './types/content';
import type { GameState, Iid, Monster, Side } from './types/state';

/** D-305: Split and Symbiosis are player-only. The Collector never bonds; hardcoded because DESIGN fixes it. */
export const canBond = (side: Side): boolean => side === 0;

/**
 * The slot a bond action needs (D-306): with BOND_ACTION on, the bond is open and the turn is in its main or attack
 * step; off, the bond actions are plays, so the play is unused and the Reposition step still open.
 */
export function bondSlotOpen(s: GameState, env: Env): boolean {
  if (env.g.FLAGS.BOND_ACTION) return s.bond === 0 && (s.step === 'main' || s.step === 'attack');
  return s.step === 'main' && !s.played;
}

/** Tail of a bond action: the bond slot (BOND_ACTION) or the one play (D-155, D-306). */
export function bondTail(run: Run): void {
  if (run.env.g.FLAGS.BOND_ACTION) run.tx.set('bond', 1);
  else playUsed(run);
}

/** A card that can be a symbiote: a base monster (not a Chimera card, spell or trap). */
export function isBaseMonsterCard(s: GameState, env: Env, iid: Iid): boolean {
  const inst = s.inst[iid];
  return inst !== undefined && inst.chimera === null && env.c.type[inst.def] === DefType.Monster;
}

// ---- Split -----------------------------------------------------------------------------------------

/** Every stored material of the Chimera `m` is in its owner's discard (D-307): the Chimera is whole and unsplit. */
function materialsInDiscard(s: GameState, m: Monster): boolean {
  const info = s.inst[m.iid]?.chimera;
  if (info === null || info === undefined || info.materials.length === 0) return false;
  for (let i = 0; i < info.materials.length; i++) {
    const p = info.materials[i] as Iid;
    const owner = s.inst[p]?.owner;
    if (owner === undefined || !s.sides[owner].discard.includes(p)) return false;
  }
  return true;
}

/** `split m` legality apart from the bond slot (§6.2): FLAGS.SPLIT, the player, a splittable Chimera. */
export function canSplit(s: GameState, env: Env, side: Side, m: Monster): boolean {
  return (
    env.g.FLAGS.SPLIT &&
    canBond(side) &&
    !m.faceDown &&
    m.sym < 0 &&
    m.entered !== s.turn &&
    materialsInDiscard(s, m)
  );
}

/** `split` action (§5.6a). One step, atomic, no pending state. Not a destruction: no Ward, Destroyed or hooks. */
export function split(run: Run, iid: Iid): void {
  const { tx, env } = run;
  const s0 = tx.state;
  const side = activeSide(s0);
  const loc = locate(s0, iid);
  const info = s0.inst[iid]?.chimera;
  if (loc < 0 || info === null || info === undefined) throw new EngineError(`split: ${iid} is not a Chimera on the board`);
  const slot0 = locSlot(loc);
  const m = s0.sides[side].board[slot0] as Monster;
  const parts = info.materials;
  const slots: number[] = [];

  // The Chimera record leaves the board and its instance goes to no zone (D-307): it can never come back.
  tx.setSlot(side, slot0, null);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i] as Iid;
    const owner = tx.state.inst[p]?.owner ?? side;
    if (!tx.zoneRemove(owner, 'discard', p)) throw new EngineError(`split: material ${p} is not in the discard`);
    const slot = i === 0 ? slot0 : freeBoardSlot(tx.state, side);
    if (slot < 0) {
      tx.zonePush(owner, 'hand', p); // never lost; the hand may exceed HAND_SIZE, which only limits drawing (D-011)
      slots.push(-1);
      continue;
    }
    // A fresh record: Ward back, no mods, no Unstable, no Shroud, no symbiote. It cannot attack this turn in either
    // SICKNESS_MODE (attacked = turn), and entered = turn blocks a reposition or lane move (D-282, D-307).
    tx.setSlot(side, slot, makeMonster(p, { pos: m.pos, entered: s0.turn, attacked: s0.turn, permP: env.g.SPLIT_PART_PERM_P }));
    slots.push(slot);
  }
  bondTail(run);
  run.emit({ e: 'Split', side, iid, parts, slots, pos: m.pos });
  run.flush();
}

// ---- Symbiosis -------------------------------------------------------------------------------------

/** `symbiose c host` legality of the host apart from the bond slot (§6.2): a face-up board monster with no symbiote. */
export function canHost(side: Side, host: Monster): boolean {
  return canBond(side) && !host.faceDown && host.sym < 0;
}

/** `symbiose` action (§5.6b): the hand card leaves every zone and is attached to the host record. */
export function symbiose(run: Run, c: Iid, host: Iid): void {
  const { tx, env } = run;
  const s0 = tx.state;
  const side = activeSide(s0);
  const loc = locate(s0, host);
  if (loc < 0) throw new EngineError(`symbiose: ${host} is not on the board`);
  if (!tx.zoneRemove(side, 'hand', c)) throw new EngineError(`symbiose: card ${c} is not in the hand`);
  const slot = locSlot(loc);
  const after = tx.patchMonster(side, slot, { sym: c });
  bondTail(run);
  run.emit({
    e: 'Bonded',
    side,
    host,
    symbiote: c,
    kw: activeKwOf(tx.state, env, after),
    guard: effectiveGuard(tx.state, env, host),
  });
  run.flush();
}
