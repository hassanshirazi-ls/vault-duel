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

/**
 * LANES (D-286): "If a lane is open and he holds a monster that beats the monster it would attack from that lane (the
 * opposite one, or the Sentinel it is redirected to), play the card and lane whose target has the highest Power; ties
 * leftmost lane, then card id." Each (card, lane) is looked up on the redacted copy; its targets are the engine's lane
 * targets, so a Sentinel cover is already in them. M-10: only the monster it would face can hit a Brittle card back.
 */
const summonBeaterLanes: PlayRule = ({ view, ai }) => {
  const compare = ai.params.summonBeater.compare;
  if (compare === undefined) throw new Error('collector.json › ai › params.summonBeater.compare is missing');
  const beats = BEATER_COMPARE[compare];
  const skipBrittle = ai.params.summonBeater.skipBrittleCountered === true;
  const options: { choice: ChoiceOf<'summon'>; target: number; lane: number }[] = [];
  for (const choice of view.choices) {
    if (choice.t !== 'summon' || choice.mode !== 'atk' || choice.card.type !== 'monster' || choice.lane === undefined) continue;
    const pv = view.previewSummon(choice.card, choice.lane);
    if (pv === null) continue;
    let best = -1;
    for (const slot of pv.targets) {
      const foe = view.foeBoard[slot];
      if (foe === null || foe === undefined || foe.faceDown || !beats(pv.asAttacker(slot))) continue;
      if (skipBrittle) {
        const back = pv.asDefender(slot);
        if (back.known && back.brittle) continue;
      }
      if (foe.power > best) best = foe.power;
    }
    if (best >= 0) options.push({ choice, target: best, lane: choice.lane });
  }
  options.sort(
    (a, b) =>
      b.target - a.target ||
      a.lane - b.lane ||
      tieCompare(ai.tieBreak, { slot: -1, id: a.choice.card.id, iid: a.choice.card.iid }, { slot: -1, id: b.choice.card.id, iid: b.choice.card.iid }),
  );
  return options[0]?.choice ?? null;
};

export const summonBeater: PlayRule = (ctx) => {
  const { view, ai } = ctx;
  if (ctx.globals.FLAGS.LANES) return summonBeaterLanes(ctx);
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
