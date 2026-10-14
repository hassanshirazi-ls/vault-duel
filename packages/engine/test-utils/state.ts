// Minimal GameState builder for engine tests (not the §17 board DSL).
import type { CompiledContent } from '../src/types/content';
import type {
  ChimeraInfo,
  GameState,
  Instance,
  Iid,
  Monster,
  SideState,
  Side,
  Step,
  TrapSlot,
} from '../src/types/state';

type Mut<T> = { -readonly [K in keyof T]: T[K] };

export const EMPTY_TIMED: Monster['timed'] = [];

export function monster(iid: Iid, over: Partial<Mut<Monster>> = {}): Monster {
  return {
    iid, pos: 0, faceDown: false, entered: 0, repositioned: -1, attacked: -1, wardUsed: false,
    permP: 0, permG: 0, timed: EMPTY_TIMED, unstableUntil: -1, shroudUntil: -1, appraised: false,
    ...over,
  };
}

export function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

interface SideDraft {
  life: number;
  deck: Iid[];
  hand: Iid[];
  discard: Iid[];
  board: (Monster | null)[];
  traps: (TrapSlot | null)[];
  vault: Iid[];
}

export class StateBuilder {
  private readonly inst: Instance[] = [];
  private readonly sides: [SideDraft, SideDraft];
  private turnIdx = 2;
  private stepName: Step = 'main';
  private twistIdx = -1;

  constructor(
    readonly c: CompiledContent,
    boardSlots = 3,
    trapSlots = 2,
  ) {
    const mk = (life: number): SideDraft => ({
      life, deck: [], hand: [], discard: [],
      board: Array.from({ length: boardSlots }, () => null),
      traps: Array.from({ length: trapSlots }, () => null),
      vault: [],
    });
    this.sides = [mk(20), mk(25)];
  }

  /** Create a card instance by fixture id; returns its iid (= index into state.inst). */
  card(id: string, owner: Side, chimera: ChimeraInfo | null = null): Iid {
    const def = this.c.index.get(id);
    if (def === undefined) throw new Error(`fixture: unknown card ${id}`);
    this.inst.push({ def, owner, chimera });
    return this.inst.length - 1;
  }

  turn(t: number): this {
    this.turnIdx = t;
    return this;
  }
  step(s: Step): this {
    this.stepName = s;
    return this;
  }
  twist(i: number): this {
    this.twistIdx = i;
    return this;
  }
  life(side: Side, n: number): this {
    this.sides[side].life = n;
    return this;
  }
  /** Put a card on a board slot (Monster record defaults: face-up attack, entered turn 0). */
  place(side: Side, slot: number, iid: Iid, over: Partial<Mut<Monster>> = {}): this {
    this.sides[side].board[slot] = monster(iid, over);
    return this;
  }
  setTrap(side: Side, slot: number, iid: Iid, set = 0): this {
    this.sides[side].traps[slot] = { iid, set };
    return this;
  }
  hand(side: Side, ...iids: Iid[]): this {
    this.sides[side].hand.push(...iids);
    return this;
  }
  deck(side: Side, ...iids: Iid[]): this {
    this.sides[side].deck.push(...iids);
    return this;
  }
  discard(side: Side, ...iids: Iid[]): this {
    this.sides[side].discard.push(...iids);
    return this;
  }

  build(): GameState {
    const [a, b] = this.sides;
    const side = (d: SideDraft): SideState => ({
      life: d.life, deck: d.deck.slice(), hand: d.hand.slice(), discard: d.discard.slice(),
      board: d.board.slice(), traps: d.traps.slice(), vault: d.vault.slice(),
    });
    return deepFreeze({
      v: 1,
      cfg: 'fixture',
      seed: 'fixture-seed',
      rng: [1, 2, 3, 4],
      turn: this.turnIdx,
      step: this.stepName,
      played: false,
      redrawsLeft: 1,
      pending: null,
      sides: [side(a), side(b)],
      inst: this.inst.slice(),
      appraisal: { attempts: 0, successes: 0, taken: [] },
      collector: { mood: 0, intent: null },
      twist: this.twistIdx,
      track: { round: new Array<number>(12).fill(0), grafts: 0, families: [], unpriced: false, appraisedLost: 0 },
      result: null,
      log: null,
      nActions: 0,
    });
  }
}
