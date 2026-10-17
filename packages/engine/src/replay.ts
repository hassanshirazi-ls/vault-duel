// Replay and state hashing (ARCHITECTURE.md §2, §17 property 4; D-108). The action log is a persistent
// cons list on the state; `replay(seed, toActions(s))` must hash equal to `s`.
import { EngineError } from './errors';
import { cyrb128 } from './rng';
import type { Action } from './types/actions';
import type { GameEvent } from './types/events';
import type { ChimeraInfo, GameState, Instance, Monster, SideState } from './types/state';

/** The actions applied so far, oldest first. Empty when the engine runs with `{ log: false }`. */
export function toActions(state: GameState): Action[] {
  const out: Action[] = [];
  for (let n = state.log; n !== null; n = n.prev) out.push(n.a);
  return out.reverse();
}

// Explicit field lists: object key order must not matter (§19), so nothing iterates keys. The Covered
// checks below fail to compile when a field is added to a state type and not hashed.
const monsterTuple = (m: Monster | null): unknown =>
  m === null
    ? null
    : [m.iid, m.pos, m.faceDown, m.entered, m.repositioned, m.attacked, m.wardUsed, m.permP, m.permG,
       m.timed.map((t) => [t.p, t.g, t.until]), m.unstableUntil, m.shroudUntil, m.appraised,
       // the bond fields are hashed only when set, so a state that never bonds hashes as it did before D-305
       ...(m.sym >= 0 ? [m.sym] : [])];
type MonsterCovered = Exclude<keyof Monster, 'sym' | 'iid' | 'pos' | 'faceDown' | 'entered' | 'repositioned' | 'attacked' | 'wardUsed' | 'permP' | 'permG' | 'timed' | 'unstableUntil' | 'shroudUntil' | 'appraised'>;

const sideTuple = (s: SideState): unknown => [
  s.life, s.deck, s.hand, s.discard, s.board.map(monsterTuple), s.traps.map((t) => (t === null ? null : [t.iid, t.set])), s.vault,
];
type SideCovered = Exclude<keyof SideState, 'life' | 'deck' | 'hand' | 'discard' | 'board' | 'traps' | 'vault'>;

const chimeraTuple = (c: ChimeraInfo | null): unknown =>
  c === null ? null : [c.element, c.kw, c.ascended, c.materials, c.grafted];
type ChimeraCovered = Exclude<keyof ChimeraInfo, 'element' | 'kw' | 'ascended' | 'materials' | 'grafted'>;
const instTuple = (i: Instance): unknown => [i.def, i.owner, chimeraTuple(i.chimera)];
type InstCovered = Exclude<keyof Instance, 'def' | 'owner' | 'chimera'>;

type StateCovered = Exclude<
  keyof GameState,
  'v' | 'cfg' | 'seed' | 'rng' | 'turn' | 'step' | 'played' | 'bond' | 'redrawsLeft' | 'pending' | 'sides' | 'inst' | 'appraisal' | 'collector' | 'twist' | 'track' | 'result' | 'log' | 'nActions'
>;
type PendingCovered = Exclude<keyof NonNullable<GameState['pending']>, 'kind' | 'stage' | 'mats' | 'kw'>;
type TrackCovered = Exclude<keyof GameState['track'], 'round' | 'grafts' | 'families' | 'unpriced' | 'appraisedLost'>;
type AppraisalCovered = Exclude<keyof GameState['appraisal'], 'attempts' | 'successes' | 'taken'>;
type ResultCovered = Exclude<keyof NonNullable<GameState['result']>, 'winner' | 'reason' | 'round'>;
const allCovered: [MonsterCovered, SideCovered, ChimeraCovered, InstCovered, StateCovered, PendingCovered, TrackCovered, AppraisalCovered, ResultCovered] extends [never, never, never, never, never, never, never, never, never] ? true : never = true;
void allCovered;

/** Canonical string of everything in a state except the log (which only records how it was reached). */
export function canonicalState(s: GameState): string {
  const p = s.pending;
  const r = s.result;
  return JSON.stringify([
    s.v, s.cfg, s.seed, s.rng, s.turn, s.step, s.played, s.redrawsLeft,
    p === null ? null : [p.kind, p.stage, p.mats, p.kw],
    s.sides.map(sideTuple), s.inst.map(instTuple),
    [s.appraisal.attempts, s.appraisal.successes, s.appraisal.taken],
    [s.collector.mood, s.collector.intent], s.twist,
    [s.track.round, s.track.grafts, s.track.families, s.track.unpriced, s.track.appraisedLost],
    r === null ? null : [r.winner, r.reason, r.round],
    s.nActions,
    ...(s.bond !== 0 ? [s.bond] : []),
  ]);
}

/** 128-bit hash of `canonicalState` as 32 hex digits. */
export function hashState(s: GameState): string {
  return cyrb128(canonicalState(s)).map((w) => w.toString(16).padStart(8, '0')).join('');
}

/** The part of the engine facade `replay` needs. */
export interface Replayable {
  newGame(seed: string, opts?: { readonly twist?: number }): { readonly state: GameState; readonly events: readonly GameEvent[] };
  applyAction(state: GameState, action: Action): { readonly state: GameState; readonly events: readonly GameEvent[] };
}

export interface ReplayOptions {
  readonly twist?: number;
  /** the `state.cfg` the actions were recorded under; a different engine configuration throws (D-191, §11) */
  readonly cfg?: string;
}

/**
 * Rebuild a state from its seed and action list. Throws EngineError at the first illegal action (unless trusted),
 * and, when `opts.cfg` is given, before applying any action if the new game's `cfg` differs (D-191).
 */
export function replay(engine: Replayable, seed: string, actions: readonly Action[], opts: ReplayOptions = {}): GameState {
  const { cfg, ...game } = opts;
  let state = engine.newGame(seed, game).state;
  if (cfg !== undefined && state.cfg !== cfg) {
    throw new EngineError(`replay: cfg mismatch (recorded ${cfg}, this engine ${state.cfg})`);
  }
  for (const a of actions) state = engine.applyAction(state, a).state;
  return state;
}
