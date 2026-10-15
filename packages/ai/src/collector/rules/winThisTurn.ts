// Play rule 1: "If he can win this turn, do it" (D-082, D-220). The attack phase takes a win that needs no play (rule
// `lethal`); this rule finds the play that makes one possible. Every legal play is tried on the redacted copy, so a
// Swift summon that clears a blocker counts as much as a Forfeit or a Gilt Frame: summons in each mode, Covetous
// summons, casts and trap sets. Public information only. A draw-only cast finds nothing on the copy (his deck is
// redacted), so it is skipped as a pure optimisation. Order: the hand card's id, its instance id, the engine's legal order.
// No pruning: a bound over unknown plays would have to be an upper bound over Swift summons and damage spells too.
import type { PlayRule } from './context';
import type { ViewChoice } from '../view';

type Play = Extract<ViewChoice, { t: 'summon' | 'summonCovetous' | 'cast' | 'setTrap' }>;

const isPlay = (c: ViewChoice): c is Play =>
  (c.t === 'summon' || c.t === 'summonCovetous' || c.t === 'setTrap' || c.t === 'cast') && !(c.t === 'cast' && c.card.drawOnly);

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const winThisTurn: PlayRule = ({ view }) => {
  if (view.winningAttacks().length > 0) return null; // no play needed
  const plays = view.choices.filter(isPlay).sort((a, b) => cmp(a.card.id, b.card.id) || a.card.iid - b.card.iid || a.index - b.index);
  for (const choice of plays) if (view.winsAfter(choice)) return choice;
  return null;
};
