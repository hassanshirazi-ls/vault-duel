// The Collector policy (ARCHITECTURE.md §13.3): a pure function of the view. One call picks one action; the engine
// applies it and the next call sees the new state, so the turn runs
//   1. reposition (D-089)  2. the mood's play list, first non-null  3. the mood's attack list, first non-empty
//   4. endTurn, or a forced Vain attack (D-091).
// Ties: leftmost slot, then card id (D-090). Nothing here chooses at random.
import type { Action, CompiledContent, GameState, Globals, IntentPolicy } from '@vault-duel/engine';
import { createBrain } from '../shared/brain';
import type { Brain } from '../shared/brain';
import { attackersInOrder } from './attacks';
import { bestTarget } from './best-target';
import { liveCollectorAi } from './config';
import type { AiConfig, AttackRuleId, PlayRuleId } from './config';
import { makeIntentPolicy } from './intent';
import { effectiveByMood } from './moods';
import type { EffectiveAi } from './moods';
import { repositionChoice } from './reposition';
import { ATTACK_RULES, PLAY_RULES } from './rules';
import type { RuleCtx } from './rules/context';
import { buildView, collectorView } from './view';
import type { CollectorView, ViewChoice } from './view';

export interface CollectorOptions {
  readonly content: CompiledContent;
  readonly globals: Globals;
  /** `collector.json › ai`; the live file when omitted */
  readonly ai?: AiConfig;
}

export interface Collector {
  /** The Collector's redacted view of a state in which he is to move. */
  view(state: GameState): CollectorView;
  /** The index in `view.choices` (and in the engine's legal actions) of the action he takes. */
  decide(view: CollectorView): number;
  /** His next action in `state`; always one of `getLegalActions(state)`. */
  act(state: GameState): Action;
  /** Inject into `createEngine` (D-096, D-150). It builds its own view of the state. */
  readonly intentPolicy: IntentPolicy;
  /** An engine for the duel, wired to this Collector's intent policy. */
  readonly brain: Brain;
}

/** Each base list may only name rules the registry has, and each rule needs its params (checked when a rule runs). */
function checkLists(ai: AiConfig): void {
  const lists: readonly { name: string; ids: readonly string[] }[] = [
    { name: 'play', ids: ai.play },
    { name: 'attack', ids: ai.attack },
  ];
  for (const l of lists) {
    for (const id of l.ids) {
      if (!(l.name === 'play' ? Object.hasOwn(PLAY_RULES, id) : Object.hasOwn(ATTACK_RULES, id))) {
        throw new Error(`collector.json › ai › ${l.name}: no rule "${id}"`);
      }
    }
  }
}

/** The action a view's decision names. Exported for tests that walk rules directly. */
export function decideWith(eff: EffectiveAi, globals: Globals, aceId: string, view: CollectorView): number {
  const ctx: RuleCtx = { view, ai: eff, globals, aceId };
  const pick = (c: ViewChoice | null): number | null => (c === null ? null : c.index);

  const rep = pick(repositionChoice(ctx));
  if (rep !== null) return rep;

  for (const id of eff.play as readonly PlayRuleId[]) {
    const p = pick(PLAY_RULES[id](ctx));
    if (p !== null) return p;
  }
  for (const id of eff.attack as readonly AttackRuleId[]) {
    const first = ATTACK_RULES[id](ctx)[0];
    if (first !== undefined) return first.index;
  }

  const end = view.choices.find((c) => c.t === 'endTurn');
  if (end !== undefined) return end.index;
  // endTurn is not legal: a Vain monster must attack (D-052, D-091), whatever the mood's list says.
  for (const m of attackersInOrder(view, eff.tieBreak)) {
    if (!m.forced) continue;
    const t = bestTarget(view, m.slot);
    if (t !== null) return t.index;
  }
  const any = view.choices[0];
  if (any === undefined) throw new Error('collector: no legal action');
  return any.index;
}

export function createCollector(options: CollectorOptions): Collector {
  const ai = options.ai ?? liveCollectorAi();
  checkLists(ai);
  const { content, globals } = options;
  const brain = createBrain(content, globals);
  const moods = effectiveByMood(ai);
  const aceId = content.ids[content.collector.ace] as string;
  const view = (state: GameState): CollectorView => collectorView(brain, state);
  const decide = (v: CollectorView): number => decideWith(moods[v.mood], globals, aceId, v);
  const intentPolicy = makeIntentPolicy({ brain, moods, aceId });
  return {
    view,
    decide,
    act: (state) => {
      const built = buildView(brain, state);
      return built.actions[decide(built.view)] as Action;
    },
    intentPolicy,
    brain,
  };
}
