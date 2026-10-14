import { describe, expect, it } from 'vitest';
import { GC } from './graft-fixture';
import { TEST_GLOBALS, withGlobals } from './globals';
import { buildScenario, parseScenario, runScenario, ScenarioError, scenarioEngine } from './board-dsl';
import { moodOf } from '../src/mood';

const engine = scenarioEngine(GC, TEST_GLOBALS);
const build = (text: string, g = TEST_GLOBALS) => buildScenario(parseScenario(text), GC, g);

describe('parseScenario / buildScenario (§17)', () => {
  it('builds turn, step, played, life, hand, board, traps and vault', () => {
    const { state: s } = build(`
      round 4 collector        # turn 7
      step attack
      played yes
      P life 14
      P hand fx-ember-whelp fx-bolt
      P board [fx-ember-whelp A] [fx-tide-sprite G new] [-]
      P traps [fx-snare] [-]
      C life 7
      C board [fx-relic-slow G ward-used p-2] [fx-umbra-beast D] [-]
      C vault [fx-lumen-seer appraised]
    `);
    expect(s).toMatchObject({ turn: 7, step: 'attack', played: true, v: 1, pending: null, result: null, twist: -1 });
    expect(s.sides[0].life).toBe(14);
    expect(s.sides[0].hand.map((i) => GC.ids[s.inst[i]?.def ?? 0])).toEqual(['fx-ember-whelp', 'fx-bolt']);
    expect(s.sides[0].board[0]).toMatchObject({ pos: 0, faceDown: false, entered: -1, attacked: -1 });
    expect(s.sides[0].board[1]).toMatchObject({ pos: 1, faceDown: false, entered: 7 });
    expect(s.sides[0].board[2]).toBeNull();
    expect(s.sides[0].traps.map((t) => (t === null ? null : GC.ids[s.inst[t.iid]?.def ?? 0]))).toEqual(['fx-snare', null]);
    expect(s.sides[1].board[0]).toMatchObject({ pos: 1, wardUsed: true, permP: -2 });
    expect(s.sides[1].board[1]).toMatchObject({ pos: 1, faceDown: true });
    expect(s.sides[1].vault).toHaveLength(1);
    expect(s.inst[s.sides[1].vault[0] as number]?.owner).toBe(0); // an appraised monster is the player's card
    expect(s.sides[1].life).toBe(7);
  });

  it('derives the Collector mood from his life and leaves the intent empty (D-161)', () => {
    for (const [life, mood] of [[25, 0], [15, 1], [8, 1], [7, 2]] as const) {
      const { state } = build(`C life ${life}`);
      expect(state.collector).toEqual({ mood, intent: null });
      expect(mood).toBe(moodOf(life, TEST_GLOBALS));
    }
    expect(build('C life 3', withGlobals({ FLAGS: { MOODS: false } })).state.collector.mood).toBe(0);
  });

  it('unspecified decks are filler so draws work; hands default to empty; `*` fills the hand', () => {
    const { state } = build('P hand *');
    expect(state.sides[0].hand).toHaveLength(TEST_GLOBALS.HAND_SIZE);
    expect(state.sides[0].deck).toHaveLength(2 * TEST_GLOBALS.OPENING_HAND);
    expect(state.sides[1].hand).toEqual([]);
    const all = [...state.sides[0].deck, ...state.sides[0].hand, ...state.sides[1].deck].sort((a, b) => a - b);
    expect(all).toEqual(state.inst.map((_, i) => i));
    expect(build('P deck fx-bolt fx-scry').state.sides[0].deck).toHaveLength(2);
  });

  it('flags: moved done p+N g-N p+N@T unstable@T shroud@T and chimera(...)', () => {
    const { state } = build(`
      turn 6
      P board [fx-ember-whelp A moved done p+2 g-1 p+3@7 unstable@8 shroud@9] [fx-family-hybrid G chimera(fx-family-hybrid,fx-tide,fx-pierce,fx-haunt,asc,grafted@4)] [fx-family-ss A chimera(fx-family-ss,fx-ember,-) new]
    `);
    const [a, b, c] = state.sides[0].board;
    expect(a).toMatchObject({ repositioned: 6, attacked: 6, permP: 2, permG: -1, unstableUntil: 8, shroudUntil: 9, timed: [{ p: 3, g: 0, until: 7 }] });
    const ch = state.inst[b?.iid ?? 0]?.chimera;
    expect(ch).toMatchObject({ element: GC.elementIds.indexOf('fx-tide'), ascended: true, grafted: 4 });
    expect(ch?.kw).toBe((1 << (GC.kwBit['fx-pierce'] as number)) | (1 << (GC.kwBit['fx-haunt'] as number)));
    expect(state.inst[c?.iid ?? 0]?.chimera).toMatchObject({ kw: 0, ascended: false, grafted: 6 }); // defaults to entered (D-139)
    expect(state.inst[a?.iid ?? 0]?.chimera).toBeNull();
  });

  it('is deep-frozen and has the right track and card counts', () => {
    const { state } = build('P board [fx-ember-whelp A]');
    expect(Object.isFrozen(state.sides[0].board)).toBe(true);
    expect(state.track.round).toHaveLength(TEST_GLOBALS.MAX_ROUNDS);
  });

  it('reports syntax errors with the line number', () => {
    expect(() => parseScenario('turn 2\nbogus line')).toThrow(/line 2: unknown line/);
    expect(() => parseScenario('P board [fx-ember-whelp Q]')).toThrow(ScenarioError);
    expect(() => parseScenario('P board [fx-ember-whelp A wat]')).toThrow(/unknown monster flag 'wat'/);
    expect(() => parseScenario('step sideways')).toThrow(/step/);
    expect(() => build('P hand not-a-card')).toThrow(/unknown card 'not-a-card'/);
    expect(() => build('P board [fx-ember-whelp A] [fx-ember-whelp A] [fx-ember-whelp A] [fx-ember-whelp A]')).toThrow(/BOARD_SLOTS/);
  });
});

describe('runScenario', () => {
  it('the Sentinel example of §8.4: legality expectations', () => {
    runScenario(
      `
      turn 4
      P board [fx-ember-whelp A] [-] [-]
      C board [fx-relic-slow A] [fx-sentinel-wall A] [-]
      expect illegal attack P0 > C0
      expect legal attack P0 > C1
      expect illegal attack P0 > face
      `,
      engine,
    );
  });

  it('attack, cast, summon, set and end through the engine, with expectations on state and events', () => {
    const r = runScenario(
      `
      turn 4
      P hand fx-bolt fx-snare fx-tide-sprite
      P board [fx-umbra-beast A] [-] [-]
      C board [fx-relic-slow A] [fx-lumen-seer A] [-]
      C life 25
      do cast fx-bolt > C0        # relic-slow has 5 power: legal target
      expect C0 empty
      expect event Destroyed C0
      expect P0 power 5
      do attack P0 > C1
      expect C1 empty
      expect C life 22            # umbra beats lumen: 5 + 2 against 4
      expect P hand 2
      expect P discard has fx-bolt
      expect no event WardBroken
      `,
      engine,
    );
    expect(r.events.some((e) => e.e === 'CombatResolved')).toBe(true);
  });

  it('summon, set, reposition and end in order; the turn passes to the other side', () => {
    const r = runScenario(
      `
      turn 2
      P hand fx-tide-sprite fx-snare
      P board [fx-ember-whelp A] [-] [-]
      C deck fx-ember-whelp fx-ember-whelp fx-ember-whelp
      do reposition P0
      expect P0 pos G
      do summon fx-tide-sprite D
      expect P1 pos D
      do end
      expect event TurnStarted
      expect C hand 2
      `,
      engine,
    );
    expect(r.state.turn).toBe(3);
    const s2 = runScenario('turn 2\nP hand fx-snare\ndo set fx-snare\nexpect P hand 0', engine);
    expect(s2.state.sides[0].traps[0]).not.toBeNull();
  });

  it('graft with Ascend, keyword choice and position', () => {
    const r = runScenario(
      `
      turn 2
      P hand fx-multi-kw fx-warded-ox fx-swift-scout
      do graft hand:fx-multi-kw hand:fx-warded-ox | ascend hand:fx-swift-scout | kw fx-haunt,fx-ward | pos G
      expect event Grafted
      expect P0 pos G
      expect P0 has fx-haunt
      expect P0 has fx-ward
      expect P hand 0
      expect P discard 3
      `,
      engine,
    );
    expect(r.state.track.grafts).toBe(1);
  });

  it('winner and life expectations; a direct lethal attack', () => {
    runScenario(
      `
      turn 2
      P board [fx-umbra-beast A]
      C life 5
      do attack P0 > face
      expect C life 0
      expect winner P
      expect event GameOver
      `,
      engine,
    );
  });

  it('failures name the line: illegal action, failed expectation, missing card, unknown ref', () => {
    expect(() => runScenario('turn 0\nP board [fx-ember-whelp A]\ndo attack P0 > face', engine)).toThrow(/line 3: .*failed/);
    expect(() => runScenario('turn 4\nP board [fx-ember-whelp A]\nexpect P0 power 99', engine)).toThrow(/line 3: expectation failed: P0 power is 3/);
    expect(() => runScenario('turn 4\nexpect C life 1', engine)).toThrow(/expectation failed/);
    expect(() => runScenario('turn 4\ndo summon fx-bolt A', engine)).toThrow(/no fx-bolt in P hand/);
    expect(() => runScenario('turn 4\ndo attack P2 > face', engine)).toThrow(/P2 is empty/);
    expect(() => runScenario('turn 4\nexpect event Destroyed', engine)).toThrow(/missing event/);
    expect(() => runScenario('turn 4\ndo frobnicate', engine)).toThrow(/unknown action/);
  });
});
