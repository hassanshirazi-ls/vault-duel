// Intent (D-095, D-096, D-150, D-221): a forecast of his next turn, computed once at the start of the player's turn.
// The forecast state is `endTurn` applied to `redactState(s, 1)` with the Brain's engine: the end of the player's turn
// and the start of his own (turn hooks, Unstable expiry, Appraisal) run in the engine, with no draw (his deck is
// redacted). There is no hand-built state. This cannot recurse: the Brain's engine has a stub intent policy, and the
// start of his turn never calls the policy. `s` is only read.
// Priority: appraise (the Appraisal at the start of his turn took a monster) > attack (after the repositions he would make,
// a rule of the mood's attack list returns an attack, or a monster with an active mustAttack keyword has a legal attack)
// > scheme (the first play rule that returns something returns a cast or a trap set) > guard.
// It builds `collectorView` itself from the state it is given (D-150), so it sees what the Collector sees.
import { activeSide, redactState } from '@vault-duel/engine';
import type { GameState, Intent, IntentPolicy } from '@vault-duel/engine';
import type { Brain } from '../shared/brain';
import { ATTACK_RULES, PLAY_RULES } from './rules';
import type { RuleCtx } from './rules/context';
import { repositionChoice } from './reposition';
import type { EffectiveAi } from './moods';
import { collectorView } from './view';
import type { CollectorView } from './view';

const COLLECTOR = 1;

export interface IntentDeps {
  readonly brain: Brain;
  readonly moods: readonly [EffectiveAi, EffectiveAi, EffectiveAi];
  readonly aceId: string;
}

/** A monster with an active mustAttack keyword has a legal attack (a forced attack, D-052). */
function forcedAttack(view: CollectorView): boolean {
  return view.choices.some((c) => c.t === 'attack' && view.board[c.slot]?.forced === true);
}

export function makeIntentPolicy(deps: IntentDeps): IntentPolicy {
  const { brain, moods, aceId } = deps;
  return (s: GameState): Intent => {
    const next = brain.engine.applyAction(redactState(s, COLLECTOR), { t: 'endTurn' }).state;
    if (next.result !== null || activeSide(next) !== COLLECTOR) return 'guard';
    if (next.appraisal.successes > s.appraisal.successes) return 'appraise';

    let view: CollectorView = collectorView(brain, next);
    const eff = moods[view.mood];
    const ctx = (v: CollectorView): RuleCtx => ({ view: v, ai: eff, globals: brain.globals, aceId });

    // The repositions he would make first (each at most once, so this ends).
    for (let i = 0; i < brain.globals.BOARD_SLOTS; i++) {
      const rep = repositionChoice(ctx(view));
      if (rep === null) break;
      const after = view.after(rep);
      if (after === null) break;
      view = after;
    }

    const c = ctx(view);
    for (const id of eff.attack) if (ATTACK_RULES[id](c).length > 0) return 'attack';
    if (forcedAttack(view)) return 'attack';
    for (const id of eff.play) {
      const p = PLAY_RULES[id](c);
      if (p === null) continue;
      return p.t === 'cast' || p.t === 'setTrap' ? 'scheme' : 'guard';
    }
    return 'guard';
  };
}
