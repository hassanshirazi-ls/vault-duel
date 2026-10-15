// Play rule 2: "If The Unpriced is summonable, summon it." The ace is `collector.json › ace`; summonable means the engine
// lists a summon of it (for The Unpriced, a Covetous summon sacrificing a monster he took by Appraisal). It goes in
// attack position (D-089, D-213). A normal summon comes first. Covetous sacrifice order (D-213): a vault monster before
// a board one, the lowest Power first within each zone (vault: printed, board: effective), then `tieBreak`
// (board: leftmost slot; vault: card id, then instance id).
import { tieCompare } from './context';
import type { PlayRule } from './context';
import type { ChoiceOf, ViewChoice } from '../view';

export const summonAce: PlayRule = ({ view, ai, aceId }) => {
  const normal = view.choices.filter((c): c is ChoiceOf<'summon'> => c.t === 'summon' && c.mode === 'atk' && c.card.id === aceId);
  const first = normal.sort((a, b) => a.card.iid - b.card.iid)[0];
  if (first !== undefined) return first;

  const sacPower = (c: ChoiceOf<'summonCovetous'>): number =>
    c.sac.zone === 'board' ? (view.board[c.sac.slot]?.power ?? 0) : c.sac.zone === 'vault' ? c.sac.card.power : 0;
  /** vault first (D-213): a vault card has no use but this sacrifice */
  const zoneRank = (c: ChoiceOf<'summonCovetous'>): number => (c.sac.zone === 'vault' ? 0 : c.sac.zone === 'board' ? 1 : 2);
  const sacKey = (c: ChoiceOf<'summonCovetous'>): { slot: number; id: string; iid: number } => {
    if (c.sac.zone === 'vault') return { slot: -1, id: c.sac.card.id, iid: c.sac.card.iid };
    if (c.sac.zone === 'board') {
      const m = view.board[c.sac.slot];
      return { slot: c.sac.slot, id: m?.card.id ?? '', iid: m?.card.iid ?? 0 };
    }
    return { slot: -1, id: '', iid: 0 };
  };
  const covetous = view.choices
    .filter((c): c is ChoiceOf<'summonCovetous'> => c.t === 'summonCovetous' && c.mode === 'atk' && c.card.id === aceId)
    .sort((a, b) => a.card.iid - b.card.iid || zoneRank(a) - zoneRank(b) || sacPower(a) - sacPower(b) || tieCompare(ai.tieBreak, sacKey(a), sacKey(b)));
  const pick: ViewChoice | undefined = covetous[0];
  return pick ?? null;
};
