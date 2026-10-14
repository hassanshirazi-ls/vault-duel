// Reposition action (ARCHITECTURE.md §5.1, §6.2; D-014, D-022, D-023, D-024, D-161).
// A face-up monster toggles attack <-> guard. A face-down monster becomes face-up attack, emitting
// Revealed then Repositioned. Either way `repositioned = turn`. No hook fires, the play is not used and
// `step` does not change. Legality (entered earlier, not yet repositioned this turn, before the play and
// before the first attack) is legal.ts's business.
import { EngineError } from './errors';
import type { Run } from './pipeline';
import { activeSide, locate, locSide, locSlot } from './stats';
import type { Iid, Pos } from './types/state';

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
    tx.patchMonster(side, slot, { faceDown: false, pos: 0, repositioned: turn });
    run.emit({ e: 'Revealed', iid, side });
    run.emit({ e: 'Repositioned', iid, pos: 0 });
    return;
  }
  const pos: Pos = m.pos === 0 ? 1 : 0;
  tx.patchMonster(side, slot, { pos, repositioned: turn });
  run.emit({ e: 'Repositioned', iid, pos });
}
