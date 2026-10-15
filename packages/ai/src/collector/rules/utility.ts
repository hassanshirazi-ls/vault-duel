// Play rule 7 (D-085): the implicit last step, in `params.utility.order`: cast a draw spell, set a trap, or pass.
// A draw spell is one whose every effect draws for him. For the trap he follows `trapPreference` first and then any
// other held trap by card id (judgment call: the rule says only "a trap if he holds one"). `pass` ends the play phase.
import { preferredTraps } from './setTrapWhenBehind';
import type { PlayRule, RuleCtx } from './context';
import type { UtilityStep } from '../config';
import type { ChoiceOf, ViewChoice } from '../view';

type Step = (ctx: RuleCtx) => ViewChoice | null;

/** One handler per `utility.order` value of the schema (D-145). */
export const UTILITY_STEPS: Readonly<Record<UtilityStep, Step>> = {
  castDrawSpell: ({ view }) => {
    const draws = view.choices
      .filter((c): c is ChoiceOf<'cast'> => c.t === 'cast' && c.card.drawOnly && c.target.kind === 'none')
      .sort((a, b) => (a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0) || a.card.iid - b.card.iid);
    return draws[0] ?? null;
  },
  setTrap: ({ view, ai }) => {
    const preferred = preferredTraps(view, ai.trapPreference)[0];
    if (preferred !== undefined) return preferred;
    const others = view.choices
      .filter((c): c is ChoiceOf<'setTrap'> => c.t === 'setTrap')
      .sort((a, b) => (a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0) || a.card.iid - b.card.iid);
    return others[0] ?? null;
  },
  pass: () => null,
};

export const utility: PlayRule = (ctx) => {
  const order = ctx.ai.params.utility.order;
  if (order === undefined) throw new Error('collector.json › ai › params.utility.order is missing');
  for (const step of order) {
    if (step === 'pass') return null;
    const choice = UTILITY_STEPS[step](ctx);
    if (choice !== null) return choice;
  }
  return null;
};
