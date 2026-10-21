// The Levy warning (D-372): what ending the turn would do, asked of the engine and never worked out here (TA-6). The
// Levy resolves inside the player's `endTurn` action, so `applyAction` on the current frozen state tells exactly who
// is taken, an expiring Unstable Chimera included. ONLY the Levy events of that trial are read; his draw, his hand and
// the rest of the new state are dropped, so nothing hidden can leak. The input state is never changed.
import type { Action, Engine, GameState, Iid } from '@vault-duel/engine';
import { isPlayerToAct } from '../duel/turn';

export type LevyForecast = { readonly kind: 'takes'; readonly iid: Iid } | { readonly kind: 'none' };

const memo = new WeakMap<GameState, LevyForecast | null>();

/**
 * `endTurn` is the legal end-turn action from `getLegalActions` (null when it is not offered). The result is null when
 * no Levy follows this turn (or the warning does not apply), else who is taken or that there is nothing to take.
 * Remembered per state object, so it runs once per state change; the memo is valid for one engine and state (the engine is fixed for a duel).
 * Any throw from the trial gives null.
 */
export function levyForecast(engine: Engine, state: GameState, endTurn: Action | null): LevyForecast | null {
  if (endTurn === null || endTurn.t !== 'endTurn') return null;
  if (!engine.globals.FLAGS.APPRAISAL) return null;
  if (state.result !== null || state.pending !== null || state.step === 'mulligan' || state.step === 'over') return null;
  if (!isPlayerToAct(state)) return null;
  const hit = memo.get(state);
  if (hit !== undefined) return hit;
  let found: LevyForecast | null = null;
  let attempt = false;
  try {
    for (const e of engine.applyAction(state, endTurn).events) {
      if (e.e === 'AppraisalAttempt') attempt = true;
      else if (e.e === 'Appraised') found = { kind: 'takes', iid: e.iid };
      else if (e.e === 'AppraisalFailed') found = { kind: 'none' };
    }
  } catch {
    // decorative: a failed trial must never take the duel screen down
    attempt = false;
  }
  const out = attempt ? found : null;
  memo.set(state, out);
  return out;
}
