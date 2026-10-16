// Lane move (ARCHITECTURE.md §6.2; D-282). A step of up to LANE_MOVE_RANGE lanes into an empty own lane, or (LANE_SWAP) a
// swap with the own monster there. It changes only the slot: position, face-down state, `entered` and every counter
// stay. `repositioned = turn` on every monster that moved, which is the same stamp a position switch uses, so a monster
// does either, not both. No hook fires, the play is not used and `step` does not change. Legality is legal.ts's business.
import { EngineError } from './errors';
import type { Run } from './pipeline';
import { activeSide, locate, locSide, locSlot } from './stats';
import type { Iid } from './types/state';

export function moveLane(run: Run, iid: Iid, to: number): void {
  const { tx } = run;
  const loc = locate(tx.state, iid);
  if (loc < 0) throw new EngineError(`moveLane: ${iid} is not on a board`);
  const side = locSide(loc);
  if (side !== activeSide(tx.state)) throw new EngineError(`moveLane: ${iid} is not on the active side's board`);
  const from = locSlot(loc);
  const board = tx.state.sides[side].board;
  if (to < 0 || to >= board.length || to === from) throw new EngineError(`moveLane: lane ${to} is not a destination`);
  const m = board[from];
  if (m === null || m === undefined) throw new EngineError(`moveLane: empty slot ${from}`);
  const other = board[to] ?? null;
  const turn = tx.state.turn;
  tx.setSlot(side, to, { ...m, repositioned: turn });
  tx.setSlot(side, from, other === null ? null : { ...other, repositioned: turn });
  run.emit({ e: 'LaneMoved', iid, from, to, swapped: other === null ? -1 : other.iid });
}
