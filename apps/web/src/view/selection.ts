// Tap card, tap target (D-237). Given what is selected and the sorted legal actions, this says what glows and what a
// tap on each thing does. Every action it returns is a member of `getLegalActions` (it only picks from `LegalGroups`).
import type { Action, Iid, SummonMode } from '@vault-duel/engine';
import type { LegalGroups } from './legal';

export type Selection =
  | { readonly t: 'hand'; readonly iid: Iid; readonly faceDown: boolean; readonly guard: boolean; readonly sac?: Iid; readonly attach?: boolean }
  | { readonly t: 'board'; readonly iid: Iid };

export interface Plan {
  /** summon without a lane (lanes off): tapping any empty monster slot plays this */
  readonly summon: Action | null;
  /** lane -> the action that plays the selected card there (lanes on: a summon, or a Covetous summon with the chosen sacrifice) */
  readonly lanes: ReadonlyMap<number, Action>;
  /** Covetous sacrifices that still need a lane: tapping one picks it, then the lanes light up */
  readonly sacs: ReadonlySet<Iid>;
  /** destination lane -> the lane move of the selected board monster */
  readonly moves: ReadonlyMap<number, Action>;
  /** monster-targeting actions (attack, targeted cast, covetous sacrifice), by the board card to tap */
  readonly targets: ReadonlyMap<Iid, Action>;
  /** casts aimed at a card in a discard pile (Grave Recall), by the card to pick: shown in a picker sheet, not on the board */
  readonly discard: ReadonlyMap<Iid, Extract<Action, { t: 'cast' }>>;
  /** attack straight at the Collector's life */
  readonly direct: Action | null;
  /** tapping an empty trap slot sets the card */
  readonly setTrap: Action | null;
  /** plays with no target: an untargeted spell */
  readonly cast: Action | null;
  readonly reposition: Action | null;
  /** the summon modes this card may use, for the toggles */
  readonly modes: ReadonlySet<SummonMode>;
  /** the selected hand monster can attach under a host (FLAGS.SYMBIOSIS): offers the Attach button */
  readonly canAttach: boolean;
  /** the selected Chimera can split (FLAGS.SPLIT): offers the Split button */
  readonly split: Action | null;
  readonly anything: boolean;
}

const NO_CARDS: ReadonlySet<Iid> = new Set();

export const summonMode = (s: Extract<Selection, { t: 'hand' }>): SummonMode => (s.faceDown ? 'down' : s.guard ? 'grd' : 'atk');

/** `inDiscard` says which cards sit in a discard pile (the view reads that from the state); casts aimed at them go to `Plan.discard`. */
export function planFor(groups: LegalGroups, sel: Selection | null, inDiscard: ReadonlySet<Iid> = NO_CARDS): Plan {
  const targets = new Map<Iid, Action>();
  const discard = new Map<Iid, Extract<Action, { t: 'cast' }>>();
  const modes = new Set<SummonMode>();
  const lanes = new Map<number, Action>();
  const sacs = new Set<Iid>();
  const moves = new Map<number, Action>();
  let summon: Action | null = null;
  let direct: Action | null = null;
  let setTrap: Action | null = null;
  let cast: Action | null = null;
  let reposition: Action | null = null;
  let split: Action | null = null;
  let canAttach = false;
  if (sel?.t === 'hand' && sel.attach === true) {
    // attach mode: only the hosts light up, each one a legal `symbiose`
    for (const a of groups.symbioses.get(sel.iid) ?? []) targets.set(a.host, a);
    canAttach = true;
  } else if (sel?.t === 'hand') {
    canAttach = (groups.symbioses.get(sel.iid)?.length ?? 0) > 0;
    const want = summonMode(sel);
    for (const a of groups.summons.get(sel.iid) ?? []) {
      modes.add(a.mode);
      if (a.mode !== want) continue;
      if (a.lane === undefined) summon = a;
      else lanes.set(a.lane, a);
    }
    for (const a of groups.summonCovetous.get(sel.iid) ?? []) {
      modes.add(a.mode);
      if (a.mode !== want) continue;
      if (a.lane === undefined) targets.set(a.sac, a);
      else {
        sacs.add(a.sac);
        if (sel.sac === a.sac) lanes.set(a.lane, a);
      }
    }
    for (const a of groups.casts.get(sel.iid) ?? []) {
      if (a.target >= 0 && inDiscard.has(a.target)) discard.set(a.target, a);
      else if (a.target >= 0) targets.set(a.target, a);
      else cast = a;
    }
    setTrap = groups.setTraps.get(sel.iid) ?? null;
  } else if (sel?.t === 'board') {
    for (const a of groups.attacks.get(sel.iid) ?? []) {
      if (a.target >= 0) targets.set(a.target, a);
      else direct = a;
    }
    reposition = groups.repositions.get(sel.iid) ?? null;
    split = groups.splits.get(sel.iid) ?? null;
    for (const a of groups.moveLanes.get(sel.iid) ?? []) moves.set(a.to, a);
  }
  const anything = summon !== null || lanes.size > 0 || sacs.size > 0 || moves.size > 0 || targets.size > 0 || discard.size > 0 || direct !== null || setTrap !== null || cast !== null || reposition !== null || split !== null || canAttach;
  return { summon, lanes, sacs, moves, targets, discard, direct, setTrap, cast, reposition, modes, canAttach, split, anything };
}

/** Does a board monster have anything to do (so tapping it selects it instead of inspecting)? */
export function boardActionable(groups: LegalGroups, iid: Iid): boolean {
  return (groups.attacks.get(iid)?.length ?? 0) > 0 || groups.repositions.has(iid) || groups.splits.has(iid) || (groups.moveLanes.get(iid)?.length ?? 0) > 0;
}
