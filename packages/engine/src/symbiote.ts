// Release of an attached symbiote (ARCHITECTURE.md §5.5, §5.6b; D-308). A leaf module (imports no pipeline code) so the
// destroy batch and the board-to-hand effect can both call it without an import cycle.
import { makeMonster } from './monster';
import type { Tx } from './tx';
import type { GameEvent } from './types/events';
import type { Iid, Pos, Side } from './types/state';

/**
 * The host left the board (§5.5, §5.6b): its symbiote comes out as a fresh monster in the host's slot and position.
 * `entered = turn` (it is "summoned", D-280), no mods, no Ward spent, no `onSummon`. `appraised` when it comes out
 * under a controller who is not its owner (the Collector's Appraised host, D-308). The slot was just vacated by the
 * host, so no fallback rule exists.
 */
export function releaseSymbiote(
  tx: Tx,
  emit: (e: GameEvent) => void,
  host: Iid,
  sym: Iid,
  pos: Pos,
  side: Side,
  slot: number,
  cause: 'destroyed' | 'returned',
): void {
  const owner = tx.state.inst[sym]?.owner ?? side;
  tx.setSlot(side, slot, makeMonster(sym, { pos, entered: tx.state.turn, appraised: side !== owner }));
  emit({ e: 'SymbioteEmerged', side, iid: sym, host, slot, cause });
}
