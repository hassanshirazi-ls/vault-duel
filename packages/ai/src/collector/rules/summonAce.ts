// Play rule 2: "If The Unpriced is summonable, summon it." The ace is `collector.json › ace`; summonable means the engine
// lists a summon of it (for The Unpriced, a Covetous summon sacrificing a monster he took by Appraisal). It goes in
// attack position (D-089). Which sacrifice when several are legal is not specified: the weakest first (judgment call).
import { tieCompare } from './context';
import type { PlayRule } from './context';
import type { ChoiceOf, ViewChoice } from '../view';

export const summonAce: PlayRule = ({ view, ai, aceId }) => {
  const normal = view.choices.filter((c): c is ChoiceOf<'summon'> => c.t === 'summon' && c.mode === 'atk' && c.card.id === aceId);
  const first = normal.sort((a, b) => a.card.iid - b.card.iid)[0];
  if (first !== undefined) return first;

  const sacPower = (c: ChoiceOf<'summonCovetous'>): number =>
    c.sac.zone === 'board' ? (view.board[c.sac.slot]?.power ?? 0) : c.sac.zone === 'vault' ? c.sac.card.power : 0;
  const zoneRank = (c: ChoiceOf<'summonCovetous'>): number => (c.sac.zone === 'board' ? 0 : 1);
  const sacKey = (c: ChoiceOf<'summonCovetous'>): { slot: number; id: string; iid: number } => ({
    slot: c.sac.zone === 'board' ? c.sac.slot : -1,
    id: c.sac.zone === 'vault' ? c.sac.card.id : '',
    iid: c.card.iid,
  });
  const covetous = view.choices
    .filter((c): c is ChoiceOf<'summonCovetous'> => c.t === 'summonCovetous' && c.mode === 'atk' && c.card.id === aceId)
    .sort((a, b) => a.card.iid - b.card.iid || sacPower(a) - sacPower(b) || zoneRank(a) - zoneRank(b) || tieCompare(ai.tieBreak, sacKey(a), sacKey(b)));
  const pick: ViewChoice | undefined = covetous[0];
  return pick ?? null;
};
