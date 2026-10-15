// Play rule 1: "If he can win this turn, do it" (D-082). The attack phase takes a win that needs no play (rule `lethal`);
// this rule finds the play that makes one possible: a spell (Forfeit clearing a blocker, Gilt Frame adding Power).
// Public information only; draw spells are not tried, because the card they would draw is unknown to him.
import { tieCompare } from './context';
import type { PlayRule } from './context';
import type { ChoiceOf } from '../view';

export const winThisTurn: PlayRule = ({ view, ai }) => {
  let buff = 0;
  for (const c of view.hand) if (c.grantsPower > 0) buff += c.grantsPower;
  if (view.attackPotential() + buff < view.foeLife) return null; // cannot reach lethal whatever he casts
  if (view.winningAttacks().length > 0) return null; // no play needed
  const casts = view.choices
    .filter((c): c is ChoiceOf<'cast'> => c.t === 'cast' && !c.card.drawOnly)
    .map((choice) => ({
      choice,
      key: {
        slot: choice.target.kind === 'ownMonster' || choice.target.kind === 'foeMonster' ? choice.target.slot : -1,
        id: choice.card.id,
        iid: choice.card.iid,
      },
    }))
    .sort((a, b) => tieCompare(ai.tieBreak, a.key, b.key));
  for (const { choice } of casts) if (view.winsAfter(choice)) return choice;
  return null;
};
