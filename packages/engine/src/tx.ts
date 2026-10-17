// Copy-on-write transaction over GameState (ARCHITECTURE.md §4, §18.2).
//
// The base state is never mutated. The first write to a path (root -> sides tuple -> one
// SideState -> one zone array) copies only that path; every other branch stays shared by
// reference. Objects the Tx has already copied are owned and mutated in place by later
// writes in the same transaction. Monster/TrapSlot records are replaced, never mutated.
// `commit()` returns the new state, or the base state itself when nothing was written.
import { EngineError } from './errors';
import type {
  GameState,
  Instance,
  Iid,
  Monster,
  SideState,
  TrapSlot,
} from './types/state';
import type { Side } from './types/state';

type Mut<T> = { -readonly [K in keyof T]: T[K] };

export type IidZone = 'deck' | 'hand' | 'discard' | 'vault';
export type Zone = IidZone | 'board' | 'traps';
export type SideScalar = 'life';
/** Root fields written by whole-value replacement. */
export type RootField =
  | 'rng'
  | 'turn'
  | 'step'
  | 'played'
  | 'bond'
  | 'spell'
  | 'redrawsLeft'
  | 'pending'
  | 'appraisal'
  | 'collector'
  | 'twist'
  | 'track'
  | 'result'
  | 'log'
  | 'nActions';

const ZONE_BIT: Readonly<Record<Zone, number>> = {
  deck: 1,
  hand: 2,
  discard: 4,
  vault: 8,
  board: 16,
  traps: 32,
};

export class Tx {
  readonly base: GameState;
  private root: Mut<GameState> | null = null;
  private sides: [SideState, SideState] | null = null;
  private sideOwned: [Mut<SideState> | null, Mut<SideState> | null] = [null, null];
  private zoneOwned: [number, number] = [0, 0]; // bitmask of ZONE_BIT per side
  private instOwned = false;
  private done = false;

  constructor(base: GameState) {
    this.base = base;
  }

  /** Current view (base until the first write). Treat as read-only; it changes as the Tx is written. */
  get state(): GameState {
    return this.root ?? this.base;
  }

  /** True once any write happened. */
  get dirty(): boolean {
    return this.root !== null;
  }

  /** Finish the transaction. Returns the base state unchanged when there were no writes. */
  commit(): GameState {
    this.done = true;
    return this.state;
  }

  // ---- ownership -------------------------------------------------------------------------

  private ownRoot(): Mut<GameState> {
    if (this.done) throw new EngineError('Tx already committed');
    if (this.root === null) this.root = { ...this.base };
    return this.root;
  }

  private ownSides(): [SideState, SideState] {
    const root = this.ownRoot();
    if (this.sides === null) {
      this.sides = [root.sides[0], root.sides[1]];
      root.sides = this.sides;
    }
    return this.sides;
  }

  private ownSide(side: Side): Mut<SideState> {
    const sides = this.ownSides();
    let s = this.sideOwned[side];
    if (s === null) {
      s = { ...sides[side] };
      this.sideOwned[side] = s;
      sides[side] = s;
    }
    return s;
  }

  private ownZone<T>(side: Side, zone: Zone): T[] {
    const s = this.ownSide(side);
    const arr = s[zone] as T[];
    const bit = ZONE_BIT[zone];
    if ((this.zoneOwned[side] & bit) === 0) {
      this.zoneOwned[side] |= bit;
      const copy = arr.slice();
      (s as Record<Zone, unknown>)[zone] = copy;
      return copy;
    }
    return arr;
  }

  // ---- root writes -----------------------------------------------------------------------

  set<K extends RootField>(key: K, value: GameState[K]): void {
    (this.ownRoot() as Record<RootField, unknown>)[key] = value;
  }

  /** Append a card instance (Chimeras are appended at commit, §4). Returns its iid. */
  pushInstance(inst: Instance): Iid {
    const root = this.ownRoot();
    if (!this.instOwned) {
      this.instOwned = true;
      root.inst = root.inst.slice();
    }
    return (root.inst as Instance[]).push(inst) - 1;
  }

  // ---- side writes -----------------------------------------------------------------------

  setLife(side: Side, life: number): void {
    this.ownSide(side).life = life;
  }

  /** Replace a whole iid zone (deck/hand/discard/vault). The array is adopted, not copied. */
  setZone(side: Side, zone: IidZone, iids: readonly Iid[]): void {
    const s = this.ownSide(side);
    (s as Record<IidZone, readonly Iid[]>)[zone] = iids;
    this.zoneOwned[side] &= ~ZONE_BIT[zone]; // adopted array is not ours to mutate
  }

  zonePush(side: Side, zone: IidZone, iid: Iid): void {
    this.ownZone<Iid>(side, zone).push(iid);
  }

  /** Insert at index 0 (e.g. top of deck). */
  zoneUnshift(side: Side, zone: IidZone, iid: Iid): void {
    this.ownZone<Iid>(side, zone).unshift(iid);
  }

  /** Remove the first occurrence of iid; returns false (and does not copy) if absent. */
  zoneRemove(side: Side, zone: IidZone, iid: Iid): boolean {
    const idx = this.state.sides[side][zone].indexOf(iid);
    if (idx < 0) return false;
    this.ownZone<Iid>(side, zone).splice(idx, 1);
    return true;
  }

  /** Remove and return the first n entries of a zone (draws). */
  zoneTake(side: Side, zone: IidZone, n: number): Iid[] {
    const cur = this.state.sides[side][zone];
    const k = Math.min(n, cur.length);
    if (k <= 0) return [];
    return this.ownZone<Iid>(side, zone).splice(0, k);
  }

  setSlot(side: Side, slot: number, m: Monster | null): void {
    this.ownZone<Monster | null>(side, 'board')[slot] = m;
  }

  /** Replace the monster in a slot with a patched copy. Throws if the slot is empty. */
  patchMonster(side: Side, slot: number, patch: Partial<Mut<Omit<Monster, 'iid'>>>): Monster {
    const cur = this.state.sides[side].board[slot];
    if (cur === null || cur === undefined) throw new EngineError(`patchMonster: empty slot ${slot}`);
    const next: Monster = { ...cur, ...patch };
    this.ownZone<Monster | null>(side, 'board')[slot] = next;
    return next;
  }

  setTrap(side: Side, slot: number, t: TrapSlot | null): void {
    this.ownZone<TrapSlot | null>(side, 'traps')[slot] = t;
  }
}
