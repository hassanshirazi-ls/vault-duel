// Reposition action (ARCHITECTURE.md §5.1, §6.2; D-014, D-022, D-023, D-024, D-161).
// A face-up monster toggles attack <-> guard. A face-down monster becomes face-up attack, emitting
// Revealed then Repositioned. Either way `repositioned = turn`. No hook fires, the play is not used and
// `step` does not change. Legality (entered earlier, not yet repositioned this turn, before the play and
// before the first attack) is legal.ts's business.
import { EngineError } from './errors';
import type { Run } from './pipeline';
import type { Env } from './hooks/registry';
import { activeSide, effectivePower, locate, locSide, locSlot, monsterOf } from './stats';
import type { GameState, Iid, Monster, Pos, Side } from './types/state';

/**
 * D-338 preview: what an Ambush flip would give `iid` (a face-down board monster), or null when FLAGS.AMBUSH is off or the
 * monster is not face-down. `power` is its effective Power after the flip this turn (keywords wake, +p until the end of the turn).
 * Legality of the reposition itself (entered earlier, not yet repositioned) is legal.ts's business.
 */
export function ambushPreview(s: GameState, env: Env, iid: Iid): { readonly p: number; readonly power: number } | null {
  if (!env.g.FLAGS.AMBUSH) return null;
  const loc = locate(s, iid);
  const m = monsterOf(s, iid);
  if (loc < 0 || m === null || !m.faceDown) return null;
  const side = locSide(loc);
  const p = env.g.AMBUSH_POWER;
  const flipped: Monster = { ...m, faceDown: false, pos: 0, timed: [...m.timed, { p, g: 0, until: s.turn }] };
  const board = s.sides[side].board.slice();
  board[locSlot(loc)] = flipped;
  const sides = [s.sides[0], s.sides[1]] as [typeof s.sides[0], typeof s.sides[1]];
  sides[side as Side] = { ...s.sides[side], board };
  return { p, power: effectivePower({ ...s, sides }, env, iid) };
}

export function reposition(run: Run, iid: Iid): void {
  const { tx } = run;
  const loc = locate(tx.state, iid);
  if (loc < 0) throw new EngineError(`reposition: ${iid} is not on a board`);
  const side = locSide(loc);
  if (side !== activeSide(tx.state)) throw new EngineError(`reposition: ${iid} is not on the active side's board`);
  const slot = locSlot(loc);
  const m = tx.state.sides[side].board[slot];
  if (m === null || m === undefined) throw new EngineError(`reposition: empty slot ${slot}`);
  const turn = tx.state.turn;
  if (m.faceDown) {
    // D-338 Ambush (FLAGS.AMBUSH): +AMBUSH_POWER Power until the end of this turn (timed mod, D-031); it may still attack
    const p = run.env.g.FLAGS.AMBUSH ? run.env.g.AMBUSH_POWER : 0;
    tx.patchMonster(side, slot, p !== 0 ? { faceDown: false, pos: 0, repositioned: turn, timed: [...m.timed, { p, g: 0, until: turn }] } : { faceDown: false, pos: 0, repositioned: turn });
    run.emit({ e: 'Revealed', iid, side });
    run.emit({ e: 'Repositioned', iid, pos: 0 });
    if (run.env.g.FLAGS.AMBUSH) run.emit({ e: 'Ambushed', iid, p: run.env.g.AMBUSH_POWER });
    return;
  }
  const pos: Pos = m.pos === 0 ? 1 : 0;
  tx.patchMonster(side, slot, { pos, repositioned: turn });
  run.emit({ e: 'Repositioned', iid, pos });
}
