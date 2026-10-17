// Start and end of turn (ARCHITECTURE.md §5.1 to §5.3; D-011, D-013, D-016, D-017, D-095, D-096).
// `startTurn` is called by the actions that begin a turn (`keep`, `endTurn`); there are no
// "advance" actions (§5.1). Both functions return early once a result is set (§8.3.5).
import { appraisal } from './appraisal';
import { destroyBatch } from './destroy';
import { endGame } from './pipeline';
import type { Run } from './pipeline';
import { activeSide, roundOf } from './stats';
import type { Iid, Monster, Side } from './types/state';
import type { TurnEvt } from './types/hooks';

/** Ids of `side`'s board monsters matching `pred`, in slot order (collected before any write, §4.1). */
function boardIids(run: Run, side: Side, pred: (m: Monster) => boolean): Iid[] {
  const out: Iid[] = [];
  const board = run.state.sides[side].board;
  for (let i = 0; i < board.length; i++) {
    const m = board[i];
    if (m !== null && m !== undefined && pred(m)) out.push(m.iid);
  }
  return out;
}

/**
 * Draw step (D-011, D-013): n = min(MAX_DRAW_PER_TURN, max(0, HAND_SIZE - hand), deck). The active
 * side draws n cards; a hand that is already full, or a deck that runs short, emits DrawSkipped.
 */
export function drawStep(run: Run, side: Side): void {
  const { tx, env } = run;
  const { g } = env;
  const sd = tx.state.sides[side];
  const wanted = Math.min(g.MAX_DRAW_PER_TURN, Math.max(0, g.HAND_SIZE - sd.hand.length));
  if (wanted === 0) {
    run.emit({ e: 'DrawSkipped', side, reason: 'handFull' });
    return;
  }
  const drawn = tx.zoneTake(side, 'deck', wanted);
  for (let i = 0; i < drawn.length; i++) {
    const iid = drawn[i] as Iid;
    tx.zonePush(side, 'hand', iid);
    run.emit({ e: 'CardDrawn', side, iid, byEffect: false });
  }
  if (drawn.length < wanted) run.emit({ e: 'DrawSkipped', side, reason: 'deckEmpty' });
}

/** §5.2 / D-016. Precondition: `turn` already holds the new turn index. */
export function startTurn(run: Run): void {
  const { tx, env } = run;
  const { g } = env;
  const s0 = tx.state;
  const evt: TurnEvt = { turn: s0.turn, round: roundOf(s0), side: activeSide(s0) };

  // (1) TurnStarted -> Shroud of the active side expires (lazy: no write) -> onTurnStart hooks.
  run.emit({ e: 'TurnStarted', turn: evt.turn, round: evt.round, side: evt.side });
  const shrouded = boardIids(run, evt.side, (m) => m.shroudUntil === evt.turn);
  for (let i = 0; i < shrouded.length; i++) run.emit({ e: 'ShroudExpired', iid: shrouded[i] as Iid });
  run.dispatcher().onTurn('onTurnStart', evt);
  run.flush();
  if (run.over) return;

  // (2) Collector turn, Appraisal rounds only (D-075).
  if (evt.side === 1 && g.FLAGS.APPRAISAL && g.APPRAISAL_ROUNDS.includes(evt.round)) {
    appraisal(run);
    if (run.over) return;
  }

  // (3) Draw step.
  drawStep(run, evt.side);

  // (4) The Reposition step begins.
  tx.set('step', 'main');
  tx.set('played', false);
  if (g.FLAGS.BOND_ACTION) tx.set('bond', 0); // D-306: only written with the flag, so default play is untouched
  if (g.FLAGS.TURN_SLOTS) tx.set('spell', 0); // D-335: likewise

  // (5) Player turn only: compute and freeze the Collector's intent (D-095, D-096). Last, so the policy sees a
  // well-formed decision state (D-221).
  const policy = run.services.intent;
  if (evt.side === 0 && g.FLAGS.INTENTS && policy !== undefined) {
    const intent = policy(tx.state);
    tx.set('collector', { ...tx.state.collector, intent });
    run.emit({ e: 'IntentSet', intent });
  }
}

/** §5.3 / D-017. Ends the active side's turn and starts the next one (or seals the vault). */
export function endTurn(run: Run): void {
  const { tx, env } = run;
  const { g } = env;
  const s0 = tx.state;
  const evt: TurnEvt = { turn: s0.turn, round: roundOf(s0), side: activeSide(s0) };

  run.dispatcher().onTurn('onTurnEnd', evt);
  run.flush();
  if (run.over) return;

  // Unstable Chimeras due this turn: both boards, active side first, slot order (D-062).
  const due: Iid[] = [];
  for (let k = 0; k < 2; k++) {
    const side = (k === 0 ? evt.side : 1 - evt.side) as Side;
    for (const iid of boardIids(run, side, (m) => m.unstableUntil === evt.turn)) due.push(iid);
  }
  if (due.length > 0) {
    for (let i = 0; i < due.length; i++) run.emit({ e: 'UnstableExpired', iid: due[i] as Iid });
    destroyBatch(run, due, 'unstable');
    if (run.over) return;
  }

  // Timed modifiers whose last turn this is stop applying lazily (D-031); the event is for the UI.
  for (let k = 0; k < 2; k++) {
    const side = (k === 0 ? evt.side : 1 - evt.side) as Side;
    const expiring = boardIids(run, side, (m) => m.timed.some((t) => t.until === evt.turn));
    for (let i = 0; i < expiring.length; i++) run.emit({ e: 'ModifierExpired', iid: expiring[i] as Iid });
  }

  run.emit({ e: 'TurnEnded', turn: evt.turn });

  if (evt.turn === 2 * g.MAX_ROUNDS - 1) {
    run.emit({ e: 'VaultSealed' });
    endGame(run, { winner: 1, reason: 'vaultSealed', round: g.MAX_ROUNDS });
    return;
  }
  tx.set('turn', evt.turn + 1);
  startTurn(run);
}
