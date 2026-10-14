// Appraisal step (ARCHITECTURE.md §5.7; D-075 to D-079, D-077): at the start of a Collector turn in
// APPRAISAL_ROUNDS the Collector takes the player's highest-Power eligible monster. turn.ts decides
// when to call it (flag and round check); this module only does the step.
//
//   attempts++, AppraisalAttempt
//   candidates: player board, face-up, not Shrouded, effective Power >= APPRAISAL_MIN_POWER
//   none -> AppraisalFailed; else highest Power, ties leftmost
//   board-to-board move keeps everything (D-077) but `entered = turn`, `appraised = true`
//   no free Collector slot -> vault (a zone: no record, so no board state is kept)
import { markRound } from './track';
import type { Run } from './pipeline';
import { effectivePower, roundOf } from './stats';
import { freeBoardSlot } from './summon';
import { RoundFlag } from './types/state';
import type { Iid, Monster } from './types/state';

const PLAYER = 0;
const COLLECTOR = 1;

/** Slot of the monster the Collector would take from the player's board right now, or -1 (D-076). */
export function appraisalTarget(run: Run): number {
  const { env } = run;
  const s = run.state;
  const board = s.sides[PLAYER].board;
  let best = -1;
  let bestPower = -1;
  for (let i = 0; i < board.length; i++) {
    const m = board[i];
    if (m === null || m === undefined || m.faceDown || s.turn < m.shroudUntil) continue;
    const p = effectivePower(s, env, m.iid);
    if (p >= env.g.APPRAISAL_MIN_POWER && p > bestPower) {
      best = i; // strictly greater: ties keep the leftmost
      bestPower = p;
    }
  }
  return best;
}

export function appraisal(run: Run): void {
  const { tx, env } = run;
  const s0 = tx.state;
  const round = roundOf(s0);
  tx.set('appraisal', { ...s0.appraisal, attempts: s0.appraisal.attempts + 1 });
  run.emit({ e: 'AppraisalAttempt', round });

  const fromSlot = appraisalTarget(run);
  if (fromSlot < 0) {
    run.emit({ e: 'AppraisalFailed', round, reason: 'noTarget' });
    return;
  }
  const m = tx.state.sides[PLAYER].board[fromSlot] as Monster;
  const iid: Iid = m.iid;
  tx.setSlot(PLAYER, fromSlot, null);

  const toSlot = freeBoardSlot(tx.state, COLLECTOR);
  if (toSlot >= 0) {
    // Judgment call: FLAGS.APPRAISED_ENTERS_GUARD is proposal M-03 (default off); implemented as "enters in guard".
    const pos = env.g.FLAGS.APPRAISED_ENTERS_GUARD ? 1 : m.pos;
    tx.setSlot(COLLECTOR, toSlot, { ...m, pos, entered: tx.state.turn, appraised: true });
    run.emit({ e: 'Appraised', iid, fromSlot, to: 'board', toSlot });
  } else {
    tx.zonePush(COLLECTOR, 'vault', iid);
    run.emit({ e: 'Appraised', iid, fromSlot, to: 'vault', toSlot: -1 });
  }
  const a = tx.state.appraisal;
  tx.set('appraisal', { ...a, successes: a.successes + 1, taken: [...a.taken, iid] });
  markRound(tx, RoundFlag.Appraised);
  tx.set('track', { ...tx.state.track, appraisedLost: tx.state.track.appraisedLost + 1 });
}
