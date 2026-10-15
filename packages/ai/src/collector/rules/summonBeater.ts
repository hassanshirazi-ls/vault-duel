// Play rule 3: "If a slot is open and he holds a monster that beats your strongest face-up monster, play it" (D-083).
// Strongest = highest effective Power (ties leftmost). A card beats it when previewAttack, with the card's Power after
// the summon plus the element bonus, wins: strictly more than the target's Power (attack position) or Guard (guard).
// The highest-Power qualifier is played in attack position; ties by card id, then instance id. No face-up monster: skip.
// `skipBrittleCountered` (M-10) additionally skips a card the strongest monster would destroy through Brittle.
import { tieCompare } from './context';
import type { PlayRule } from './context';
import type { BeaterCompare } from '../config';
import type { CombatEstimate } from '../combat-estimate';
import type { ChoiceOf, FoeMonster, PublicMonster } from '../view';

const faceUp = (m: FoeMonster | null): m is PublicMonster => m !== null && !m.faceDown;

export function strongestFoe(foeBoard: readonly (FoeMonster | null)[]): PublicMonster | null {
  let best: PublicMonster | null = null;
  for (const m of foeBoard) if (faceUp(m) && (best === null || m.power > best.power)) best = m;
  return best;
}

/** One handler per `compare` value of the schema (D-145): does the card win the attack its preview describes? */
export const BEATER_COMPARE: Readonly<Record<BeaterCompare, (est: CombatEstimate) => boolean>> = {
  previewAttack: (est) => est.known && est.aP > est.dStat,
};

export const summonBeater: PlayRule = ({ view, ai }) => {
  const compare = ai.params.summonBeater.compare;
  if (compare === undefined) throw new Error('collector.json › ai › params.summonBeater.compare is missing');
  const beats = BEATER_COMPARE[compare];
  const target = strongestFoe(view.foeBoard);
  if (target === null) return null;
  const skipBrittle = ai.params.summonBeater.skipBrittleCountered === true;
  const options: { choice: ChoiceOf<'summon'>; power: number }[] = [];
  for (const choice of view.choices) {
    if (choice.t !== 'summon' || choice.mode !== 'atk' || choice.card.type !== 'monster') continue;
    const pv = view.previewSummon(choice.card);
    if (pv === null) continue;
    const est = pv.asAttacker(target.slot);
    if (!beats(est)) continue;
    if (skipBrittle) {
      const back = pv.asDefender(target.slot);
      if (back.known && back.brittle) continue;
    }
    options.push({ choice, power: pv.power });
  }
  options.sort(
    (a, b) =>
      b.power - a.power ||
      tieCompare(ai.tieBreak, { slot: -1, id: a.choice.card.id, iid: a.choice.card.iid }, { slot: -1, id: b.choice.card.id, iid: b.choice.card.iid }),
  );
  return options[0]?.choice ?? null;
};
