// Play rule 2: "If The Unpriced is summonable, summon it." The ace is `collector.json › ace`; summonable means the engine
// lists a summon of it (for The Unpriced, a Covetous summon sacrificing a monster he took by Appraisal). It goes in
// attack position (D-089, D-213). A normal summon comes first. Covetous sacrifice order (D-213): a vault monster before
// a board one, the lowest Power first within each zone (vault: printed, board: effective), then `tieBreak`
// (board: leftmost slot; vault: card id, then instance id).
import { tieCompare } from './context';
import type { PlayRule } from './context';
import { chooseLane } from './summonLane';
import type { ChoiceOf, Sacrifice, ViewChoice } from '../view';

const sameSac = (a: Sacrifice, b: Sacrifice): boolean =>
  a.zone === b.zone && (a.zone === 'board' ? a.slot === (b as typeof a).slot : a.zone === 'vault' ? a.card.iid === (b as typeof a).card.iid : true);

export const summonAce: PlayRule = (ctx) => {
  const { view, ai, aceId } = ctx;
  const lanes = ctx.globals.FLAGS.LANES;
  const normal = view.choices.filter((c): c is ChoiceOf<'summon'> => c.t === 'summon' && c.mode === 'atk' && c.card.id === aceId);
  const first = normal.sort((a, b) => a.card.iid - b.card.iid)[0];
  if (first !== undefined) {
    if (!lanes) return first;
    // D-286: the lane comes from summonLane.
    const same = normal.filter((c) => c.card.iid === first.card.iid && c.lane !== undefined);
    const lane = chooseLane(ctx, first.card, same.map((c) => c.lane as number));
    return same.find((c) => c.lane === lane) ?? first;
  }

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
  if (!lanes || pick === undefined || pick.t !== 'summonCovetous') return pick ?? null;
  // D-286: the sacrifice is settled; the lane comes from summonLane (the sacrifice's own lane is free once it is paid).
  const same = covetous.filter((c) => c.card.iid === pick.card.iid && sameSac(c.sac, pick.sac) && c.lane !== undefined);
  const lane = chooseLane(ctx, pick.card, same.map((c) => c.lane as number), (l) => view.previewSummon(pick.card, l, pick.sac));
  return same.find((c) => c.lane === lane) ?? pick;
};
