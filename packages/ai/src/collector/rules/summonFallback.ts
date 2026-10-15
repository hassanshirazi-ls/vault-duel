// Play rule 6: summon his highest-Power monster that is not Slow; if all are Slow, summon the one with the highest Guard
// (D-084). Position from `summonFallback` (D-081, D-089): `position` for the normal case ("guardUnlessBeater" = guard
// unless its Power exceeds your strongest face-up monster's; with none to compare, it counts as exceeding),
// `slowPosition` when every candidate is Slow. A guard summon is face-down only when `allowFaceDown` is on.
// "Power" is the Power right after the summon (Tethered and the twist counted); ties by card id, then instance id.
import { tieCompare } from './context';
import type { PlayRule } from './context';
import { strongestFoe } from './summonBeater';
import type { SlowPick, SlowPosition, SummonPosition } from '../config';
import type { ChoiceOf, OwnCard, SummonMode, SummonPreview } from '../view';

export interface Candidate {
  readonly card: OwnCard;
  readonly pv: SummonPreview;
}

/** Position for the normal case, one handler per `position` value of the schema (D-145). `strongest` is the opponent's strongest face-up monster's Power, or null. */
export const POSITIONS: Readonly<Record<SummonPosition, (power: number, strongest: number | null) => 'attack' | 'guard'>> = {
  attack: () => 'attack',
  guard: () => 'guard',
  guardUnlessBeater: (power, strongest) => (strongest === null || power > strongest ? 'attack' : 'guard'),
};

/** Position when every candidate is Slow, one handler per `slowPosition` value. */
export const SLOW_POSITIONS: Readonly<Record<SlowPosition, 'attack' | 'guard'>> = { attack: 'attack', guard: 'guard' };

/** Which Slow monster, one handler per `slowPick` value: an ordering, best first. */
export const SLOW_PICKS: Readonly<Record<SlowPick, (a: Candidate, b: Candidate) => number>> = {
  highestGuard: (a, b) => b.pv.guard - a.pv.guard,
};

export const summonFallback: PlayRule = ({ view, ai }) => {
  const params = ai.params.summonFallback;
  const seen = new Set<number>();
  const cands: Candidate[] = [];
  for (const c of view.choices) {
    if (c.t !== 'summon' || c.card.type !== 'monster' || seen.has(c.card.iid)) continue;
    seen.add(c.card.iid);
    const pv = view.previewSummon(c.card);
    if (pv !== null) cands.push({ card: c.card, pv });
  }
  if (cands.length === 0) return null;
  const key = (c: Candidate): { slot: number; id: string; iid: number } => ({ slot: -1, id: c.card.id, iid: c.card.iid });

  let pick: Candidate;
  let position: 'attack' | 'guard';
  if (cands.every((c) => c.pv.slow)) {
    if (params.slowPick === undefined) throw new Error('collector.json › ai › params.summonFallback.slowPick is missing');
    if (params.slowPosition === undefined) throw new Error('collector.json › ai › params.summonFallback.slowPosition is missing');
    const order = SLOW_PICKS[params.slowPick];
    pick = [...cands].sort((a, b) => order(a, b) || tieCompare(ai.tieBreak, key(a), key(b)))[0] as Candidate;
    position = SLOW_POSITIONS[params.slowPosition];
  } else {
    if (params.position === undefined) throw new Error('collector.json › ai › params.summonFallback.position is missing');
    pick = [...cands].filter((c) => !c.pv.slow).sort((a, b) => b.pv.power - a.pv.power || tieCompare(ai.tieBreak, key(a), key(b)))[0] as Candidate;
    position = POSITIONS[params.position](pick.pv.power, strongestFoe(view.foeBoard)?.power ?? null);
  }
  const mode: SummonMode = position === 'attack' ? 'atk' : ai.allowFaceDown ? 'down' : 'grd';
  const choice = view.choices.find((c): c is ChoiceOf<'summon'> => c.t === 'summon' && c.card.iid === pick.card.iid && c.mode === mode);
  return choice ?? null;
};
