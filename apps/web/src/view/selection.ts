// Tap card, tap target (D-237). Given what is selected and the sorted legal actions, this says what glows and what a
// tap on each thing does. Every action it returns is a member of `getLegalActions` (it only picks from `LegalGroups`).
import type { Action, Iid, SummonMode } from '@vault-duel/engine';
import type { LegalGroups } from './legal';

export type Selection =
  | { readonly t: 'hand'; readonly iid: Iid; readonly faceDown: boolean; readonly guard: boolean }
  | { readonly t: 'board'; readonly iid: Iid };

export interface Plan {
  /** summon: tapping an empty monster slot plays this */
  readonly summon: Action | null;
  /** monster-targeting actions (attack, targeted cast, covetous sacrifice), by the board card to tap */
  readonly targets: ReadonlyMap<Iid, Action>;
  /** attack straight at the Collector's life */
  readonly direct: Action | null;
  /** tapping an empty trap slot sets the card */
  readonly setTrap: Action | null;
  /** plays with no target: an untargeted spell */
  readonly cast: Action | null;
  readonly reposition: Action | null;
  /** the summon modes this card may use, for the toggles */
  readonly modes: ReadonlySet<SummonMode>;
  readonly anything: boolean;
}

export const summonMode = (s: Extract<Selection, { t: 'hand' }>): SummonMode => (s.faceDown ? 'down' : s.guard ? 'grd' : 'atk');

export function planFor(groups: LegalGroups, sel: Selection | null): Plan {
  const targets = new Map<Iid, Action>();
  const modes = new Set<SummonMode>();
  let summon: Action | null = null;
  let direct: Action | null = null;
  let setTrap: Action | null = null;
  let cast: Action | null = null;
  let reposition: Action | null = null;
  if (sel?.t === 'hand') {
    const want = summonMode(sel);
    for (const a of groups.summons.get(sel.iid) ?? []) {
      modes.add(a.mode);
      if (a.mode === want) summon = a;
    }
    for (const a of groups.summonCovetous.get(sel.iid) ?? []) {
      modes.add(a.mode);
      if (a.mode === want) targets.set(a.sac, a);
    }
    for (const a of groups.casts.get(sel.iid) ?? []) {
      if (a.target >= 0) targets.set(a.target, a);
      else cast = a;
    }
    setTrap = groups.setTraps.get(sel.iid) ?? null;
  } else if (sel?.t === 'board') {
    for (const a of groups.attacks.get(sel.iid) ?? []) {
      if (a.target >= 0) targets.set(a.target, a);
      else direct = a;
    }
    reposition = groups.repositions.get(sel.iid) ?? null;
  }
  const anything = summon !== null || targets.size > 0 || direct !== null || setTrap !== null || cast !== null || reposition !== null;
  return { summon, targets, direct, setTrap, cast, reposition, modes, anything };
}

/** Does a board monster have anything to do (so tapping it selects it instead of inspecting)? */
export function boardActionable(groups: LegalGroups, iid: Iid): boolean {
  return (groups.attacks.get(iid)?.length ?? 0) > 0 || groups.repositions.has(iid);
}
