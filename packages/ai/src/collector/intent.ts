// Intent (D-095, D-096, D-150): a forecast of his next turn, computed once at the start of the player's turn.
// Priority: appraise (his next turn is an Appraisal round and the opponent has an eligible target) > attack (his attack
// rules would make at least one attack on the board as it is, after the repositions he would make) > scheme (his play
// rules would cast a spell or set a trap) > guard.
// It builds `collectorView` itself from the state it is given (D-150), so it sees what the Collector sees: his turn is
// modelled as the next turn index of the same state, with no draw (unknown to him) and no change of life or mood.
import type { GameState, Intent, IntentPolicy } from '@vault-duel/engine';
import type { Brain } from '../shared/brain';
import { ATTACK_RULES, PLAY_RULES } from './rules';
import type { RuleCtx } from './rules/context';
import { repositionChoice } from './reposition';
import type { EffectiveAi } from './moods';
import { collectorView } from './view';
import type { CollectorView } from './view';

export interface IntentDeps {
  readonly brain: Brain;
  readonly moods: readonly [EffectiveAi, EffectiveAi, EffectiveAi];
  readonly aceId: string;
}

/** Does his next turn start with an Appraisal that finds a target? */
function appraises(brain: Brain, hyp: GameState): boolean {
  const g = brain.globals;
  const round = (hyp.turn >> 1) + 1;
  if (!g.FLAGS.APPRAISAL || !g.APPRAISAL_ROUNDS.includes(round)) return false;
  for (const m of hyp.sides[0].board) {
    if (m === null || m.faceDown || hyp.turn < m.shroudUntil) continue;
    if (brain.mirror.power(hyp, m.iid) >= g.APPRAISAL_MIN_POWER) return true;
  }
  return false;
}

export function makeIntentPolicy(deps: IntentDeps): IntentPolicy {
  const { brain, moods, aceId } = deps;
  return (s: GameState): Intent => {
    // His next turn: the next odd turn index (the engine calls this on an even one, at the start of a player turn).
    const hyp: GameState = { ...s, turn: s.turn + 1 + (s.turn & 1), step: 'main', played: false, pending: null };
    if (appraises(brain, hyp)) return 'appraise';

    let view: CollectorView = collectorView(brain, hyp);
    const eff = moods[view.mood];
    const ctx = (v: CollectorView): RuleCtx => ({ view: v, ai: eff, globals: brain.globals, aceId });

    // The repositions he would make first (each at most once, so this ends).
    for (let i = 0; i < brain.globals.BOARD_SLOTS; i++) {
      const rep = repositionChoice(ctx(view));
      if (rep === null) break;
      const next = view.after(rep);
      if (next === null) break;
      view = next;
    }

    const c = ctx(view);
    for (const id of eff.attack) if (ATTACK_RULES[id](c).length > 0) return 'attack';
    for (const id of eff.play) {
      const p = PLAY_RULES[id](c);
      if (p === null) continue;
      return p.t === 'cast' || p.t === 'setTrap' ? 'scheme' : 'guard';
    }
    return 'guard';
  };
}
