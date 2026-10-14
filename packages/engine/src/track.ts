// Track helpers (ARCHITECTURE.md §4 Track, D-127). `Track.round` is created by newGame with length
// MAX_ROUNDS, zero-filled, indexed by round - 1, and records player-side events only.
import type { Tx } from './tx';
import type { Globals } from './types/globals';
import type { Track } from './types/state';

/** A fresh Track for newGame / initial state (D-127): `round` is MAX_ROUNDS zeros. */
export function emptyTrack(g: Pick<Globals, 'MAX_ROUNDS'>): Track {
  return { round: new Array<number>(g.MAX_ROUNDS).fill(0), grafts: 0, families: [], unpriced: false, appraisedLost: 0 };
}

/** OR a RoundFlag bit into the current round's entry. Copies the array only when the bit is new. */
export function markRound(tx: Tx, flag: number): void {
  const s = tx.state;
  const idx = (s.turn >> 1);
  const cur = s.track.round[idx];
  if (cur === undefined) return; // beyond MAX_ROUNDS: unreachable, nothing to record
  if ((cur & flag) === flag) return;
  const round = s.track.round.slice();
  round[idx] = cur | flag;
  tx.set('track', { ...s.track, round });
}
