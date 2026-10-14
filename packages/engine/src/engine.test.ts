import { describe, expect, it } from 'vitest';
import { DC, DUEL_GLOBALS, constantIntent, duelEngine } from '../test-utils/duel-fixture';
import { GC } from '../test-utils/graft-fixture';
import { withGlobals } from '../test-utils/globals';
import { StateBuilder } from '../test-utils/state';
import { createEngine } from './engine';
import { EngineError } from './errors';
import { NO_EVENTS } from './reducer';
import { hashState, replay, toActions } from './replay';
import { rerollSeed, seedString } from './setup/seed';
import type { Action } from './types/actions';
import type { GameEvent } from './types/events';
import type { GameState } from './types/state';

const SEED = rerollSeed(seedString(DUEL_GLOBALS, '2026-10-14'), 0);
const names = (events: readonly GameEvent[]): string[] => events.map((e) => e.e);

describe('createEngine (D-096, D-150)', () => {
  it('throws EngineError when FLAGS.INTENTS is on and no intent policy is given', () => {
    expect(() => createEngine(DC, DUEL_GLOBALS)).toThrow(EngineError);
    expect(() => createEngine(DC, DUEL_GLOBALS, {})).toThrow(/intent/);
  });
  it('accepts no policy when the flag is off, and a policy when it is on', () => {
    expect(() => createEngine(DC, withGlobals({ DECK_MIN_KINDS: 2, FLAGS: { INTENTS: false } }))).not.toThrow();
    expect(() => createEngine(DC, DUEL_GLOBALS, { intent: constantIntent })).not.toThrow();
  });
});

describe('mulligan and the start of round 1 (§5.1, §12.4)', () => {
  const e = duelEngine();
  const start = e.newGame(SEED);

  it('newGame deals and waits in the mulligan step', () => {
    expect(start.state.step).toBe('mulligan');
    expect(names(start.events)).toEqual(['GameStarted', 'HandDealt', 'HandDealt']);
    expect(e.getLegalActions(start.state)).toEqual([{ t: 'keep' }, { t: 'redraw' }]);
  });

  it('redraw: the hand goes to the bottom of the deck in order, the next five are drawn, then only keep remains', () => {
    const before = start.state.sides[0];
    const r = e.applyAction(start.state, { t: 'redraw' });
    const after = r.state.sides[0];
    expect(after.hand).toEqual(before.deck.slice(0, 5));
    expect(after.deck).toEqual([...before.deck.slice(5), ...before.hand]);
    expect(r.state.redrawsLeft).toBe(0);
    expect(r.events).toEqual([{ e: 'Redrawn', returned: before.hand, drawn: before.deck.slice(0, 5) }]);
    expect(e.getLegalActions(r.state)).toEqual([{ t: 'keep' }]);
    expect(r.state.sides[1]).toBe(start.state.sides[1]); // untouched branches are shared
  });

  it('keep starts round 1: TurnStarted, a full hand skips the draw, the intent is set, main step', () => {
    const r = e.applyAction(start.state, { t: 'keep' });
    expect(names(r.events)).toEqual(['TurnStarted', 'DrawSkipped', 'IntentSet']);
    expect(r.state).toMatchObject({ turn: 0, step: 'main', played: false, redrawsLeft: 0 });
    expect(r.state.collector.intent).toBe('guard');
  });

  it('with FLAGS.REDRAW off newGame skips the mulligan and begins round 1', () => {
    const noRedraw = duelEngine(withGlobals({ DECK_MIN_KINDS: 2, APPRAISAL_MIN_POWER: 5, FLAGS: { REDRAW: false } }));
    const g = noRedraw.newGame(SEED);
    expect(g.state).toMatchObject({ turn: 0, step: 'main', redrawsLeft: 0 });
    expect(names(g.events)).toEqual(['GameStarted', 'HandDealt', 'HandDealt', 'TurnStarted', 'DrawSkipped', 'IntentSet']);
  });
});

describe('applyAction contract', () => {
  const e = duelEngine();
  const s0 = e.newGame(SEED).state;

  it('rejects an illegal action with EngineError and leaves the input state intact (atomic)', () => {
    const before = hashState(s0);
    expect(() => e.applyAction(s0, { t: 'endTurn' })).toThrow(EngineError);
    expect(() => e.applyAction(s0, { t: 'summon', c: 0, mode: 'atk' })).toThrow(/illegal action/);
    expect(hashState(s0)).toBe(before);
  });

  it('trusted engines skip the legality check; an invariant failure mid-action still leaves the input intact', () => {
    const t = duelEngine(DUEL_GLOBALS, { dev: true, trusted: true });
    const b = new StateBuilder(GC).turn(3);
    const ace = b.card('fx-ace', 1);
    const s = b.hand(1, ace).build();
    const before = JSON.stringify(s);
    expect(() => t.applyAction(s, { t: 'summonCovetous', c: ace, sac: 99, mode: 'atk' })).toThrow(EngineError);
    expect(JSON.stringify(s)).toBe(before);
    expect(s.sides[1].hand).toEqual([ace]);
    expect(() => t.applyAction(s, { t: 'graftPosition', pos: 0 })).toThrow(EngineError);
  });

  it('events: false returns the shared empty array; log: false keeps the log empty', () => {
    const quiet = duelEngine(DUEL_GLOBALS, { dev: true, events: false, log: false });
    const s = quiet.newGame(SEED);
    expect(s.events).toBe(NO_EVENTS);
    const r = quiet.applyAction(s.state, { t: 'keep' });
    expect(r.events).toBe(NO_EVENTS);
    expect(r.state.log).toBeNull();
    expect(r.state.nActions).toBe(1);
  });

  it('the log and nActions record every action in order', () => {
    const r1 = e.applyAction(s0, { t: 'redraw' });
    const r2 = e.applyAction(r1.state, { t: 'keep' });
    expect(r2.state.nActions).toBe(2);
    expect(toActions(r2.state)).toEqual([{ t: 'redraw' }, { t: 'keep' }]);
    expect(toActions(s0)).toEqual([]);
  });

  it('dev mode deep-freezes committed states and the new game; production mode does not', () => {
    const r = e.applyAction(s0, { t: 'keep' });
    expect(Object.isFrozen(r.state)).toBe(true);
    expect(Object.isFrozen(r.state.sides[0].hand)).toBe(true);
    expect(Object.isFrozen(s0.inst)).toBe(true);
    const prod = duelEngine(DUEL_GLOBALS, { dev: false });
    const p = prod.newGame(SEED).state;
    expect(Object.isFrozen(p)).toBe(false);
    expect(Object.isFrozen(prod.applyAction(p, { t: 'keep' }).state)).toBe(false);
  });

  it('a finished game accepts no action', () => {
    const b = new StateBuilder(GC).turn(2).step('over');
    expect(() => e.applyAction({ ...b.build(), result: { winner: 0, reason: 'collectorDefeated', round: 2 } }, { t: 'endTurn' })).toThrow(/over/);
  });
});

describe('turn flow through applyAction (§5.2, §5.3, D-016, D-017)', () => {
  const e = duelEngine();
  const apply = (s: GameState, ...as: Action[]): { state: GameState; events: GameEvent[] } => {
    let state = s;
    const events: GameEvent[] = [];
    for (const a of as) {
      const r = e.applyAction(state, a);
      state = r.state;
      events.push(...r.events);
    }
    return { state, events };
  };

  it('endTurn runs end-of-turn then the Collector start-of-turn (draw), and the player turn again sets the intent', () => {
    const b = new StateBuilder(GC).turn(0);
    const m = b.card('fx-ember-whelp', 0);
    const hand = [0, 1, 2].map(() => b.card('fx-ember-whelp', 1));
    const d = [0, 1, 2].map(() => b.card('fx-ember-whelp', 1));
    const p = [0, 1].map(() => b.card('fx-tide-sprite', 0));
    const s = b.place(0, 0, m).hand(1, ...hand).deck(1, ...d).deck(0, ...p).build();
    const r = apply(s, { t: 'endTurn' });
    expect(r.state).toMatchObject({ turn: 1, step: 'main', played: false });
    expect(names(r.events)).toEqual(['TurnEnded', 'TurnStarted', 'CardDrawn', 'CardDrawn']);
    expect(r.state.sides[1].hand).toEqual([...hand, d[0], d[1]]);
    const back = apply(r.state, { t: 'endTurn' });
    expect(names(back.events)).toEqual(['TurnEnded', 'TurnStarted', 'CardDrawn', 'CardDrawn', 'IntentSet']);
    expect(back.state.turn).toBe(2);
  });

  it("round 3 on the Collector's turn: Appraisal runs before his draw and takes the player's best monster", () => {
    const b = new StateBuilder(GC).turn(4);
    const strong = b.card('fx-umbra-beast', 0);
    const weak = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, weak, { entered: 0 }).place(0, 1, strong, { entered: 0 }).deck(1, b.card('fx-ember-whelp', 1)).build();
    const r = apply(s, { t: 'endTurn' });
    expect(names(r.events)).toEqual(['TurnEnded', 'TurnStarted', 'AppraisalAttempt', 'Appraised', 'CardDrawn', 'DrawSkipped']); // 1-card deck: DrawSkipped(deckEmpty)
    expect(r.state.sides[1].board[0]).toMatchObject({ iid: strong, appraised: true, entered: 5 });
    expect(r.state.sides[0].board[1]).toBeNull();
    expect(r.state.appraisal).toEqual({ attempts: 1, successes: 1, taken: [strong] });
  });

  it('the vault seals after the Collector turn of round 12: the player loses', () => {
    const b = new StateBuilder(GC).turn(23);
    const r = apply(b.build(), { t: 'endTurn' });
    expect(r.state.result).toEqual({ winner: 1, reason: 'vaultSealed', round: 12 });
    expect(r.state.step).toBe('over');
    expect(names(r.events)).toEqual(['TurnEnded', 'VaultSealed', 'GameOver']);
    expect(e.getLegalActions(r.state)).toEqual([]);
  });

  it('a lethal direct attack ends the game once: MoodChanged, then a single GameOver (D-151, no second win check)', () => {
    const b = new StateBuilder(GC).turn(2);
    const a = b.card('fx-umbra-beast', 0);
    const s = b.place(0, 0, a, { entered: 0 }).life(1, 5).build();
    const r = apply(s, { t: 'attack', a, target: -1 });
    expect(names(r.events)).toEqual(['AttackDeclared', 'Damage', 'MoodChanged', 'GameOver']);
    expect(r.state.result).toEqual({ winner: 0, reason: 'collectorDefeated', round: 2 });
    expect(r.state.sides[1].life).toBe(0);
  });

  it('plays and attacks move step as the rules say (D-014, D-155): summon closes Reposition, attack forfeits the play', () => {
    const b = new StateBuilder(GC).turn(2);
    const m = b.card('fx-ember-whelp', 0);
    const h = b.card('fx-tide-sprite', 0);
    const target = b.card('fx-relic-slow', 1);
    const s = b.hand(0, h).place(0, 0, m, { entered: 0 }).place(1, 0, target).build();
    const summoned = apply(s, { t: 'summon', c: h, mode: 'grd' }).state;
    expect(summoned).toMatchObject({ step: 'attack', played: true });
    expect(e.getLegalActions(summoned).some((a) => a.t === 'reposition' || a.t === 'summon')).toBe(false);
    const attacked = apply(s, { t: 'attack', a: m, target }).state;
    expect(attacked).toMatchObject({ step: 'attack', played: true });
    expect(e.getLegalActions(attacked).some((a) => a.t === 'summon')).toBe(false);
  });

  it('reposition through the engine: a face-down flip emits Revealed then Repositioned and keeps the play', () => {
    const b = new StateBuilder(GC).turn(2);
    const m = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, m, { entered: 0, faceDown: true, pos: 1 }).build();
    const r = apply(s, { t: 'reposition', m });
    expect(names(r.events)).toEqual(['Revealed', 'Repositioned']);
    expect(r.state).toMatchObject({ step: 'main', played: false });
    expect(e.getLegalActions(r.state).some((a) => a.t === 'reposition')).toBe(false);
  });

  it('a full Graft through the engine: begin, picks, position; the play is used and the Chimera can be seen on the board', () => {
    const b = new StateBuilder(GC).turn(2);
    const x = b.card('fx-ember-whelp', 0);
    const y = b.card('fx-tide-sprite', 0);
    const s = b.hand(0, x, y).build();
    const r = apply(s, { t: 'graftBegin' }, { t: 'graftPick', m: x }, { t: 'graftPick', m: y }, { t: 'graftPosition', pos: 0 });
    expect(r.state.pending).toBeNull();
    expect(r.state).toMatchObject({ step: 'attack', played: true });
    expect(r.state.sides[0].board[0]?.iid).toBe(2);
    expect(r.state.track.grafts).toBe(1);
    expect(toActions(r.state)).toHaveLength(4);
  });

  it('casting a targeted spell through the engine uses the play and resolves its effect', () => {
    const b = new StateBuilder(GC).turn(2);
    const bolt = b.card('fx-bolt', 0);
    const t = b.card('fx-relic-slow', 1);
    const r = apply(b.hand(0, bolt).place(1, 0, t).build(), { t: 'cast', c: bolt, target: t });
    expect(r.state.sides[1].board[0]).toBeNull();
    expect(r.state).toMatchObject({ step: 'attack', played: true });
    expect(() => e.applyAction(r.state, { t: 'cast', c: bolt, target: t })).toThrow(EngineError);
  });
});

describe('replay (§17 property 4, D-108)', () => {
  it('replaying the logged actions reproduces the state hash', () => {
    const e = duelEngine();
    let s = e.newGame(SEED).state;
    for (let i = 0; i < 40 && s.result === null; i++) {
      const acts = e.getLegalActions(s);
      s = e.applyAction(s, acts[(i * 7) % acts.length] as Action).state;
    }
    const replayed = e.replay(SEED, toActions(s));
    expect(hashState(replayed)).toBe(hashState(s));
    expect(replayed).toEqual(s);
  });
  it('hashState ignores the log but sees any state difference', () => {
    const e = duelEngine();
    const a = e.newGame(SEED).state;
    expect(hashState({ ...a, log: { a: { t: 'keep' }, prev: null } })).toBe(hashState(a));
    expect(hashState({ ...a, turn: 1 })).not.toBe(hashState(a));
    expect(hashState({ ...a, sides: [{ ...a.sides[0], life: 19 }, a.sides[1]] })).not.toBe(hashState(a));
    expect(hashState(e.newGame(rerollSeed(seedString(DUEL_GLOBALS, '2026-10-14'), 1)).state)).not.toBe(hashState(a));
  });
  it('replay with { cfg } checks the configuration before applying any action (D-191)', () => {
    const e = duelEngine();
    const s = e.newGame(SEED).state;
    expect(e.replay(SEED, [], { cfg: s.cfg })).toEqual(s);
    expect(() => e.replay(SEED, [], { cfg: 'other' })).toThrow(/cfg mismatch/);
    expect(() => e.replay(SEED, [{ t: 'endTurn' }], { cfg: 'other' })).toThrow(/cfg mismatch/); // not the illegal-action error
    expect(() => e.replay(SEED, [{ t: 'endTurn' }], { cfg: s.cfg })).toThrow(EngineError);
    expect(() => replay(e, SEED, [], { cfg: 'other' })).toThrow(EngineError);
  });
  it('replay throws EngineError on an illegal action in the list', () => {
    const e = duelEngine();
    expect(() => e.replay(SEED, [{ t: 'endTurn' }])).toThrow(EngineError);
  });
});
