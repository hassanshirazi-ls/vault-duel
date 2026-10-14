// ARCHITECTURE.md §4. Plain, JSON-serializable, immutable by convention.
import type { Action } from './actions';
import type { DefIdx, ElemIdx } from './content';
import type { KwMask } from './content';

export type Side = 0 | 1; // 0 = player, 1 = Collector
export type Iid = number; // card instance id = index into state.inst (D-006)
export type Pos = 0 | 1; // 0 = attack, 1 = guard
export type Mood = 0 | 1 | 2; // composed, agitated, desperate
export type Intent = 'attack' | 'appraise' | 'guard' | 'scheme';
export type Rng = readonly [number, number, number, number]; // sfc32 state (uint32 x4)

export interface Instance {
  readonly def: DefIdx;
  readonly owner: Side;
  readonly chimera: ChimeraInfo | null;
}
export interface ChimeraInfo {
  readonly element: ElemIdx;
  readonly kw: KwMask;
  readonly ascended: boolean;
  readonly materials: readonly Iid[];
  readonly grafted: number; // turn index of the Graft that created it (D-139)
}

export interface TimedMod {
  readonly p: number;
  readonly g: number;
  readonly until: number; // applies while state.turn <= until
}

export interface Monster {
  readonly iid: Iid;
  readonly pos: Pos;
  readonly faceDown: boolean;
  readonly entered: number;
  readonly repositioned: number;
  readonly attacked: number;
  readonly wardUsed: boolean;
  readonly permP: number;
  readonly permG: number;
  readonly timed: readonly TimedMod[];
  readonly unstableUntil: number;
  readonly shroudUntil: number;
  readonly appraised: boolean;
}

export interface TrapSlot {
  readonly iid: Iid;
  readonly set: number;
}

export interface SideState {
  readonly life: number;
  readonly deck: readonly Iid[];
  readonly hand: readonly Iid[];
  readonly discard: readonly Iid[];
  readonly board: readonly (Monster | null)[];
  readonly traps: readonly (TrapSlot | null)[];
  readonly vault: readonly Iid[];
}

export type Step = 'mulligan' | 'main' | 'attack' | 'over';

export type GraftStage = 'mat1' | 'mat2' | 'ascend' | 'keywords' | 'position';
export interface PendingGraft {
  readonly kind: 'graft';
  readonly stage: GraftStage;
  readonly mats: readonly Iid[];
  readonly kw: KwMask;
}
export type Pending = PendingGraft;

export interface AppraisalState {
  readonly attempts: number;
  readonly successes: number;
  readonly taken: readonly Iid[];
}

export interface Track {
  readonly round: readonly number[];
  readonly grafts: number;
  readonly families: readonly DefIdx[];
  readonly unpriced: boolean;
  readonly appraisedLost: number;
}

export interface Result {
  readonly winner: Side;
  readonly reason: 'collectorDefeated' | 'playerDefeated' | 'vaultSealed';
  readonly round: number;
}

export interface LogNode {
  readonly a: Action;
  readonly prev: LogNode | null;
}

export interface GameState {
  readonly v: 1;
  readonly cfg: string;
  readonly seed: string;
  readonly rng: Rng;
  readonly turn: number;
  readonly step: Step;
  readonly played: boolean;
  readonly redrawsLeft: number;
  readonly pending: Pending | null;
  readonly sides: readonly [SideState, SideState];
  readonly inst: readonly Instance[];
  readonly appraisal: AppraisalState;
  readonly collector: { readonly mood: Mood; readonly intent: Intent | null };
  readonly twist: number;
  readonly track: Track;
  readonly result: Result | null;
  readonly log: LogNode | null;
  readonly nActions: number;
}

/** Bit flags for Track.round entries (§4 Track). */
export const RoundFlag = { Attacked: 1, Grafted: 2, LostMonster: 4, Appraised: 8 } as const;
