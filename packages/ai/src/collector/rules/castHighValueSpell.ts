// Play rule 5: cast a spell with a legal high-value target (D-087, generalised by D-204). The candidates are the spells
// in his hand that have an entry in `params.castHighValueSpell` (mood entries replace the base entry per spell id), in
// card-id order; the first that qualifies is cast, so JSON key order never matters.
//   { pick: "highestPower" }      qualifies with at least one legal cast; cast on the target with the highest Power the
//                                 view shows (face-down skipped); an untargeted spell has its one choice.
//   { when: "contestedAttack" }   a cast on one of his attack-position monsters after which it destroys a face-up target
//                                 that it does not destroy now. The cast is applied to the redacted copy and the
//                                 engine's previewCombat is compared before and after (D-219); pick the cast enabling
//                                 the highest-Power kill.
import { attackInfos } from '../attacks';
import { tieCompare } from './context';
import type { PlayRule, RuleCtx } from './context';
import type { ChoiceOf, ChoiceTarget, CollectorView } from '../view';
import type { CastEntry, PickId, WhenId } from '../config';

/** Power the view shows for a cast target, or null when it has none to show (face-down, or not a monster). */
function targetPower(view: CollectorView, t: ChoiceTarget): number | null {
  switch (t.kind) {
    case 'ownMonster':
      return view.board[t.slot]?.power ?? null;
    case 'foeMonster': {
      const m = view.foeBoard[t.slot];
      return m === null || m === undefined || m.faceDown ? null : m.power;
    }
    case 'ownDiscard':
      return t.card.power;
    default:
      return null;
  }
}

const targetSlot = (t: ChoiceTarget): number => (t.kind === 'ownMonster' || t.kind === 'foeMonster' ? t.slot : -1);
const keyOf = (c: ChoiceOf<'cast'>): { slot: number; id: string; iid: number } => ({ slot: targetSlot(c.target), id: c.card.id, iid: c.card.iid });

function pickHighestPower(ctx: RuleCtx, casts: readonly ChoiceOf<'cast'>[]): ChoiceOf<'cast'> | null {
  const options = casts.flatMap((choice) => {
    if (choice.target.kind === 'none') return [{ choice, power: 0 }];
    const power = targetPower(ctx.view, choice.target);
    return power === null ? [] : [{ choice, power }];
  });
  options.sort((a, b) => b.power - a.power || tieCompare(ctx.ai.tieBreak, keyOf(a.choice), keyOf(b.choice)));
  return options[0]?.choice ?? null;
}

function pickContested(ctx: RuleCtx, casts: readonly ChoiceOf<'cast'>[]): ChoiceOf<'cast'> | null {
  const { view } = ctx;
  const options: { choice: ChoiceOf<'cast'>; kill: number }[] = [];
  for (const choice of casts) {
    if (choice.target.kind !== 'ownMonster') continue;
    const slot = choice.target.slot;
    const mine = view.board[slot];
    if (mine === null || mine === undefined || mine.pos !== 'atk') continue;
    // The cast applied to the redacted copy (D-219): its whole effect list counts, `if` conditions included.
    const next = view.after(choice);
    if (next === null || next.board[slot]?.card.iid !== mine.card.iid) continue;
    let best = -1;
    for (const info of attackInfos(view)) {
      if (info.attacker.slot !== slot || info.foe === null || info.foe.faceDown || !info.est.known) continue;
      if (info.est.destroysDefender) continue; // would be destroyed anyway: the spell is not what enables it
      const foeNow = next.foeBoard[info.foe.slot];
      if (foeNow === null || foeNow === undefined || foeNow.faceDown || foeNow.id !== info.foe.id) continue;
      const boosted = next.previewAttack(slot, info.foe.slot);
      if (boosted.known && boosted.destroysDefender && info.foe.power > best) best = info.foe.power;
    }
    if (best >= 0) options.push({ choice, kill: best });
  }
  options.sort((a, b) => b.kill - a.kill || tieCompare(ctx.ai.tieBreak, keyOf(a.choice), keyOf(b.choice)));
  return options[0]?.choice ?? null;
}

type CastMode = (ctx: RuleCtx, casts: readonly ChoiceOf<'cast'>[]) => ChoiceOf<'cast'> | null;

/** One handler per `pick` value and per `when` value of the schema (D-145); a new mode is an enum value plus an entry here. */
export const PICK_MODES: Readonly<Record<PickId, CastMode>> = { highestPower: pickHighestPower };
export const WHEN_MODES: Readonly<Record<WhenId, CastMode>> = { contestedAttack: pickContested };

export const castHighValueSpell: PlayRule = (ctx) => {
  const { view, ai } = ctx;
  // One representative per spell id (the lowest instance id), in card-id order.
  const spells = view.hand
    .filter((c) => c.type === 'spell' && ai.cast(c.id) !== undefined)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || a.iid - b.iid);
  const done = new Set<string>();
  for (const spell of spells) {
    if (done.has(spell.id)) continue;
    done.add(spell.id);
    const entry = ai.cast(spell.id) as CastEntry;
    const casts = view.choices.filter((c): c is ChoiceOf<'cast'> => c.t === 'cast' && c.card.iid === spell.iid);
    if (casts.length === 0) continue;
    const chosen = entry.pick !== undefined ? PICK_MODES[entry.pick](ctx, casts) : entry.when !== undefined ? WHEN_MODES[entry.when](ctx, casts) : null;
    if (chosen !== null) return chosen;
  }
  return null;
};
