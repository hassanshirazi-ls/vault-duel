// Undo back to the start of the player's current turn (D-265). Pure: the action trail in, "how far back may I go" out.
// The engine is deterministic from seed + action log, so undo is `actions.slice(0, to)` replayed by the store. What
// this file decides is only WHERE undo must stop, so that nobody can undo their way to hidden information: a trap
// that sprang, a card that was turned face-up, a card that was drawn. Presentation-side policy; no rule lives here.
import type { Action, GameEvent, GameState } from '@vault-duel/engine';

/** One applied action with what undo needs to judge it. `trail[i]` belongs to `actions[i]`. */
export interface ActionRecord {
  readonly action: Action;
  readonly events: readonly GameEvent[];
  /** the Collector's set traps just BEFORE the action: an outcome then can leak what the trap is or is not */
  readonly collectorTraps: number;
}

/** Why an action cannot be undone (and so nothing before it can be either). */
export type Checkpoint = 'revealed' | 'trap' | 'drawn' | 'trapSet' | 'mulligan';

export type UndoWhy = Checkpoint | 'nothing' | 'endTurn';

export type UndoStatus = { readonly ok: true; readonly to: number } | { readonly ok: false; readonly why: UndoWhy };

/** The short line shown beside a disabled Undo. */
export const UNDO_WHY: Readonly<Record<UndoWhy, string>> = {
  nothing: 'Nothing to undo this turn.',
  endTurn: "Can't undo: the turn was ended.",
  revealed: "Can't undo: a card was revealed.",
  trap: "Can't undo: a trap was revealed.",
  drawn: "Can't undo: cards were drawn.",
  trapSet: "Can't undo: the Monarch has a trap set.",
  mulligan: "Can't undo: the opening hand is settled.",
};

export const collectorTrapCount = (s: GameState): number => s.sides[1].traps.filter((t) => t !== null).length;

/** The actions whose result alone can show whether a set trap is there, so they are checkpoints while one is set. */
const TRAP_SENSITIVE: ReadonlySet<Action['t']> = new Set(['attack', 'summon', 'summonCovetous', 'cast', 'graftPosition']);

/** Is this action a checkpoint (it, and everything before it, can no longer be undone)? Returns the reason, or null. */
export function checkpointOf(rec: ActionRecord): Checkpoint | null {
  const t = rec.action.t;
  if (t === 'keep' || t === 'redraw') return 'mulligan';
  let found: Checkpoint | null = null;
  for (const e of rec.events) {
    if (e.e === 'TrapTriggered' || e.e === 'AttackCancelled') return 'trap';
    if (e.e === 'Revealed') found = 'revealed';
    else if ((e.e === 'CardDrawn' || e.e === 'Redrawn' || e.e === 'HandDealt') && found === null) found = 'drawn';
  }
  if (found !== null) return found;
  return rec.collectorTraps > 0 && TRAP_SENSITIVE.has(t) ? 'trapSet' : null;
}

/** First action of the player's current turn: the one after the last TurnStarted for side 0. -1 when none yet. */
export function turnStart(trail: readonly ActionRecord[]): number {
  for (let i = trail.length - 1; i >= 0; i--) {
    if ((trail[i] as ActionRecord).events.some((e) => e.e === 'TurnStarted' && e.side === 0)) return i + 1;
  }
  return -1;
}

/**
 * Where undo may cut the log: `to` means "keep `trail.slice(0, to)`". It removes the last player action only, never
 * goes past the start of the current turn, and refuses when that action is a checkpoint. A Graft (begin, picks, finish
 * or cancel) is one action to the player, so a trailing Graft is removed whole.
 */
export function undoStatus(trail: readonly ActionRecord[]): UndoStatus {
  const start = turnStart(trail);
  if (start < 0 || trail.length <= start) return { ok: false, why: 'nothing' };
  const lastIdx = trail.length - 1;
  const last = trail[lastIdx] as ActionRecord;
  if (last.action.t === 'endTurn') return { ok: false, why: 'endTurn' };
  const stop = checkpointOf(last);
  if (stop !== null) return { ok: false, why: stop };
  let to = lastIdx;
  if (last.action.t.startsWith('graft')) {
    let j = lastIdx;
    while (j >= start && (trail[j] as ActionRecord).action.t !== 'graftBegin') j--;
    if (j >= start) to = j;
  }
  return { ok: true, to };
}
