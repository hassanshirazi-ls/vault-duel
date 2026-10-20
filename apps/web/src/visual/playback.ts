// The step as a show (D-266). `playerStep` has already applied the player's action and the Collector's whole turn; the
// store keeps the final state. This turns the step's frames into stages the screen walks through one at a time: your
// action, then for each Collector action a telegraph (the card or attacker lit, its target marked) and the action
// itself on the state it produced. Pure and presentation-only: it reads frames and changes nothing in the engine.
import type { Action, GameEvent, GameState, Iid, Side } from '@vault-duel/engine';
import type { Frame } from '../duel/runtime';
import { cueDurationMs, cuesFromEvents, TIMING } from './cues';
import type { Cue } from './cues';

/** What the Collector is about to do, as ids; the screen turns them into highlights and one line of text. */
export interface Telegraph {
  readonly kind: 'attack' | 'summon' | 'summonDown' | 'cast' | 'trap' | 'reposition' | 'moveLane' | 'levy' | 'levyNone';
  /** a levy already carried out (the second half of the beat): the plaque says "took" */
  readonly done?: boolean;
  /** the monster that acts (lit) */
  readonly actor?: Iid;
  /** the card played from his hand */
  readonly card?: Iid;
  /** the monster aimed at (marked); -1 or absent means no monster */
  readonly target?: Iid;
  /** the attack goes straight at your life */
  readonly direct?: boolean;
  /** the empty slot the card is about to fill (marked) */
  readonly slot?: { readonly side: Side; readonly kind: 'monster' | 'trap'; readonly index: number };
}

export interface Stage {
  readonly kind: 'telegraph' | 'act';
  /** the board to show during this stage */
  readonly state: GameState;
  /** the state before the action, for ghosts of cards that are about to burn or be taken */
  readonly before: GameState;
  readonly events: readonly GameEvent[];
  readonly cues: readonly Cue[];
  readonly telegraph: Telegraph | null;
  readonly side: Side;
  readonly ms: number;
}

const slotOf = (after: GameState, iid: Iid): number => after.sides[1].board.findIndex((m) => m !== null && m.iid === iid);

/** The levy at the start of his turn happens inside your end-turn step: `target` is the card taken (marked in your slot first). */
function levyOf(f: Frame): Telegraph | null {
  for (const e of f.events) {
    if (e.e === 'Appraised') return { kind: 'levy', target: e.iid };
    if (e.e === 'AppraisalFailed') return { kind: 'levyNone' };
  }
  return null;
}

/** The telegraph for one Collector frame, or null when there is nothing to announce (end of turn). */
export function telegraphOf(f: Frame): Telegraph | null {
  const levy = levyOf(f);
  if (levy !== null) return levy;
  const a: Action = f.action;
  switch (a.t) {
    case 'attack':
      return a.target >= 0 ? { kind: 'attack', actor: a.a, target: a.target } : { kind: 'attack', actor: a.a, direct: true };
    case 'summon': {
      const i = slotOf(f.after, a.c);
      return { kind: a.mode === 'down' ? 'summonDown' : 'summon', card: a.c, ...(i >= 0 ? { slot: { side: 1 as const, kind: 'monster' as const, index: i } } : {}) };
    }
    case 'summonCovetous': {
      const i = slotOf(f.after, a.c);
      return { kind: 'summon', card: a.c, target: a.sac, ...(i >= 0 ? { slot: { side: 1 as const, kind: 'monster' as const, index: i } } : {}) };
    }
    case 'cast':
      return a.target >= 0 ? { kind: 'cast', card: a.c, target: a.target } : { kind: 'cast', card: a.c };
    case 'setTrap': {
      const i = f.after.sides[1].traps.findIndex((t) => t !== null && t.iid === a.c);
      return { kind: 'trap', ...(i >= 0 ? { slot: { side: 1 as const, kind: 'trap' as const, index: i } } : {}) };
    }
    case 'reposition':
      return { kind: 'reposition', actor: a.m };
    case 'moveLane':
      return { kind: 'moveLane', actor: a.m, slot: { side: 1 as const, kind: 'monster' as const, index: a.to } };
    default:
      return null;
  }
}

/** The stages of one step. Empty when there is nothing to show. */
export function stagesOf(frames: readonly Frame[]): Stage[] {
  const out: Stage[] = [];
  for (const f of frames) {
    const cues = cuesFromEvents(f.events, f.before);
    const levy = levyOf(f);
    const telegraph = f.side === 1 ? telegraphOf(f) : levy;
    if (telegraph !== null) {
      out.push({ kind: 'telegraph', state: f.before, before: f.before, events: [], cues: [], telegraph, side: f.side, ms: telegraph.kind === 'levy' ? TIMING.LEVY_MARK_MS : TIMING.TELEGRAPH_MS });
    }
    const ms = cues.length > 0 ? cueDurationMs(cues) : f.side === 1 && telegraph !== null ? TIMING.SETTLE_MS : 0;
    out.push({ kind: 'act', state: f.after, before: f.before, events: f.events, cues, telegraph: levy === null ? null : { ...levy, done: true }, side: f.side, ms });
  }
  return out;
}

/** Is any of the Collector's stages still to come (this one included)? Then input stays blocked until it ends or is skipped. */
export const blockedAt = (stages: readonly Stage[], index: number): boolean => stages.slice(index).some((s) => s.side === 1);
