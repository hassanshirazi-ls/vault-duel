// Lanes (D-281..D-284): targets, lane moves, placement, the attackReach hook point. Fixture content only (D-168).
import { describe, expect, it } from 'vitest';
import { runScenarioOn, ScenarioError, scenarioEngine } from '../test-utils/board-dsl';
import { createEngineInternals } from './engine';
import { constantIntent } from '../test-utils/intent';
import { defineKeyword } from './hooks/define';
import { FX_KEYWORDS, FX_SPEC } from '../test-utils/fixture';
import { withGlobals } from '../test-utils/globals';
import type { Action } from './types/actions';
import type { Globals } from './types/globals';
import type { ContentSpec } from '../test-utils/content-builder';

const ON = withGlobals({ FLAGS: { LANES: true } });
const CARDS = `
card a P fx-ember fx-beast 3/2
card b P fx-ember fx-beast 3/2
card c P fx-ember fx-beast 3/2
card x C fx-tide fx-beast 2/2
card y C fx-tide fx-beast 2/2
card z C fx-tide fx-beast 2/2
card s C fx-tide fx-spirit 1/5 fx-sentinel
card t C fx-tide fx-spirit 1/5 fx-sentinel
`;
const run = (script: string, g: Globals = ON, spec: ContentSpec = FX_SPEC) => runScenarioOn(CARDS + script, spec, g);
const legalOf = (script: string, g: Globals = ON): Action[] => {
  const r = run(script, g);
  return scenarioEngine(r.content, g).getLegalActions(r.state);
};
const attacksOf = (script: string, g: Globals = ON) => legalOf(script, g).filter((a) => a.t === 'attack');

describe('laneTargets under FLAGS.LANES (D-281)', () => {
  const board = `step attack
P board [a A] [b A] [c A]
C board [x A] [y A] [z A]`;

  it('an attacker may target only the monster across from it', () => {
    run(`${board}
expect legal attack P0 > C0
expect illegal attack P0 > C1
expect illegal attack P0 > C2
expect legal attack P1 > C1
expect illegal attack P1 > C0
expect legal attack P2 > C2
expect illegal attack P2 > C1
expect illegal attack P0 > face`);
  });

  it('with LANES off every enemy monster is a target, as before', () => {
    run(`${board}
expect legal attack P0 > C2
expect legal attack P1 > C0`, withGlobals());
  });

  it('an empty lane across gives no target, and no direct attack while the enemy has any monster', () => {
    run(`step attack
P board [a A] [-] [-]
C board [-] [y A] [-]
expect illegal attack P0 > C1
expect illegal attack P0 > face`);
    expect(attacksOf(`step attack
P board [a A] [-] [-]
C board [-] [y A] [-]`)).toEqual([]);
  });

  it('a direct attack exists only against a wholly empty monster board', () => {
    run(`step attack
P board [a A] [-] [-]
C board [-] [-] [-]
expect legal attack P0 > face`);
  });

  it('a face-down monster is a target when it is across', () => {
    run(`step attack
P board [a A] [-] [-]
C board [x D] [-] [-]
expect legal attack P0 > C0`);
  });
});

describe('Sentinel cover (D-283)', () => {
  it('a Sentinel in the attacker lane is the only target', () => {
    run(`step attack
P board [a A] [-] [-]
C board [s G] [y A] [-]
expect legal attack P0 > C0
expect illegal attack P0 > C1`);
  });

  it('an adjacent Sentinel redirects the attack', () => {
    run(`step attack
P board [a A] [b A] [c A]
C board [s G] [y A] [z A]
expect legal attack P1 > C0
expect illegal attack P1 > C1
expect illegal attack P2 > C0
expect legal attack P2 > C2`);
  });

  it('an empty lane covered by a Sentinel gives that Sentinel as the target', () => {
    run(`step attack
P board [-] [-] [a A]
C board [-] [s G] [-]
expect legal attack P2 > C1
expect illegal attack P2 > face`);
  });

  it('two covering Sentinels: the attacker chooses', () => {
    const t = attacksOf(`step attack
P board [-] [a A] [-]
C board [s G] [-] [t G]`);
    expect(t).toHaveLength(2);
    expect(t.every((a) => a.t === 'attack' && a.target >= 0)).toBe(true);
  });

  it('a face-down Sentinel covers nothing (it is a target only when across)', () => {
    run(`step attack
P board [a A] [b A] [-]
C board [s D] [y A] [-]
expect legal attack P0 > C0
expect legal attack P1 > C1`);
  });

  it('SENTINEL_REACH = 0 guards the own lane only', () => {
    const g = withGlobals({ FLAGS: { LANES: true }, SENTINEL_REACH: 0 });
    run(`step attack
P board [a A] [b A] [-]
C board [s G] [y A] [-]
expect legal attack P0 > C0
expect legal attack P1 > C1
expect illegal attack P1 > C0`, g);
  });

  it('SENTINEL_REACH = 2 covers the far lane', () => {
    const g = withGlobals({ FLAGS: { LANES: true }, SENTINEL_REACH: 2 });
    run(`step attack
P board [-] [-] [a A]
C board [s G] [-] [z A]
expect legal attack P2 > C0
expect illegal attack P2 > C2`, g);
    run(`step attack
P board [-] [-] [a A]
C board [s G] [-] [z A]
expect illegal attack P2 > C0
expect legal attack P2 > C2`);
  });

  it('SENTINEL_REACH is not read with LANES off: classic Sentinel covers the whole board', () => {
    run(`step attack
P board [-] [-] [a A]
C board [s G] [-] [z A]
expect legal attack P2 > C0
expect illegal attack P2 > C2`, withGlobals({ SENTINEL_REACH: 0 }));
  });
});

describe('lane moves (D-282)', () => {
  it('moves into an empty lane, keeps everything else, emits LaneMoved, may still attack', () => {
    const r = run(`step main
P board [a A] [-] [-]
C board [-] [y A] [-]
expect legal move P0 > 1
expect illegal move P0 > 2
do move P0 > 1
expect P0 empty
expect event LaneMoved
expect legal attack P1 > C1
expect illegal reposition P1`);
    const ev = r.events.find((e) => e.e === 'LaneMoved');
    expect(ev).toMatchObject({ from: 0, to: 1, swapped: -1 });
    expect(r.state.sides[0].board[1]).toMatchObject({ pos: 0, faceDown: false, repositioned: 2 });
  });

  it('a face-down monster may move and stays face-down', () => {
    const r = run(`step main
P board [a D] [-] [-]
do move P0 > 1`);
    expect(r.state.sides[0].board[1]).toMatchObject({ faceDown: true, pos: 1 });
  });

  it('LANE_MOVE_RANGE bounds the step', () => {
    const script = `step main
P board [a A] [-] [-]
`;
    expect(legalOf(script).filter((a) => a.t === 'moveLane')).toHaveLength(1);
    const wide = withGlobals({ FLAGS: { LANES: true }, LANE_MOVE_RANGE: 2 });
    expect(legalOf(script, wide).filter((a) => a.t === 'moveLane')).toHaveLength(2);
    run(`${script}expect legal move P0 > 2`, wide);
  });

  it('swaps with an own monster, spending both repositions; the swap emits the partner', () => {
    const r = run(`step main
P board [a A] [b G] [-]
expect legal move P0 > 1
expect legal move P1 > 0
do move P0 > 1
expect illegal reposition P0
expect illegal reposition P1
expect illegal move P0 > 0
expect illegal move P1 > 2`);
    const [m0, m1] = r.state.sides[0].board;
    expect(m0).toMatchObject({ pos: 1, repositioned: 2 });
    expect(m1).toMatchObject({ pos: 0, repositioned: 2 });
    expect(r.events.find((e) => e.e === 'LaneMoved')).toMatchObject({ from: 0, to: 1, swapped: m0?.iid });
  });

  it('LANE_SWAP = false leaves only empty-lane moves', () => {
    const g = withGlobals({ FLAGS: { LANES: true, LANE_SWAP: false } });
    run(`step main
P board [a A] [b A] [-]
expect illegal move P0 > 1
expect legal move P1 > 2`, g);
  });

  it('a swap needs both monsters eligible', () => {
    run(`step main
P board [a A] [b A new] [-]
expect illegal move P0 > 1
expect illegal move P1 > 0
expect illegal move P1 > 2`);
    run(`step main
P board [a A] [b A moved] [-]
expect illegal move P0 > 1
expect illegal move P1 > 0
expect illegal move P1 > 2`);
  });

  it('either one lane move or one switch, never both', () => {
    run(`step main
P board [a A] [-] [-]
do reposition P0
expect illegal move P0 > 1`);
    run(`step main
P board [a A] [-] [-]
do move P0 > 1
expect illegal reposition P1
expect illegal move P1 > 0
expect illegal move P1 > 2`);
  });

  it('not on the turn the monster was summoned', () => {
    run(`step main
P board [a A new] [-] [-]
expect illegal move P0 > 1`);
  });

  it('only in the reposition step: not after the play and not after an attack', () => {
    run(`step attack
played yes
P board [a A] [-] [-]
expect illegal move P0 > 1`);
    run(`step main
P board [a A] [-] [-]
C board [x A] [-] [-]
do attack P0 > C0
expect illegal move P0 > 1`);
  });

  it('does not exist with LANES off', () => {
    run(`step main
P board [a A] [-] [-]
expect illegal move P0 > 1`, withGlobals());
  });

  it('the Collector moves too, on his turn', () => {
    run(`turn 3
step main
C board [x A] [-] [-]
expect legal move C0 > 1
do move C0 > 1`);
  });

  it('a lane move never touches `entered`, so it does not make a monster "summoned"', () => {
    const r = run(`step main
P board [a A] [-] [-]
do move P0 > 1`);
    expect(r.state.sides[0].board[1]?.entered).toBe(-1);
  });
});

describe('placement by lane (D-284)', () => {
  it('summon: one action per (card, mode, empty lane), lane ascending', () => {
    const acts = legalOf(`step main
P hand a
P board [b A] [-] [c A]`).filter((x) => x.t === 'summon');
    expect(acts.map((x) => (x.t === 'summon' ? `${x.mode}${x.lane}` : ''))).toEqual(['atk1', 'grd1', 'down1']);
    const open = legalOf(`step main
P hand a`).filter((x) => x.t === 'summon');
    expect(open).toHaveLength(9);
    expect(open.slice(0, 3).map((x) => (x.t === 'summon' ? x.lane : -1))).toEqual([0, 1, 2]);
  });

  it('summon puts the monster in the chosen lane', () => {
    const r = run(`step main
P hand a
P board [-] [-] [-]
do summon a A lane 2`);
    expect(r.state.sides[0].board[2]).not.toBeNull();
    expect(r.state.sides[0].board[0]).toBeNull();
    expect(r.events.find((e) => e.e === 'Summoned')).toMatchObject({ slot: 2 });
  });

  it('a lane is required with LANES on and rejected with LANES off', () => {
    expect(() => run(`step main
P hand a
do summon a A`)).toThrow(ScenarioError);
    expect(() => run(`step main
P hand a
P board [b A] [-] [-]
do summon a A lane 0`)).toThrow(ScenarioError);
    expect(() => run(`step main
P hand a
do summon a A lane 1`, withGlobals())).toThrow(ScenarioError);
    run(`step main
P hand a
P board [b A] [-] [-]
do summon a A`, withGlobals());
  });

  it('a trusted engine also rejects a missing or occupied lane', () => {
    const r = run(`step main
P hand a
P board [b A] [-] [-]`);
    const eng = createEngineInternals(r.content, ON, { intent: constantIntent }, { dev: true, trusted: true });
    const c = r.state.sides[0].hand[0] as number;
    expect(() => eng.applyAction(r.state, { t: 'summon', c, mode: 'atk' })).toThrow();
    expect(() => eng.applyAction(r.state, { t: 'summon', c, mode: 'atk', lane: 0 })).toThrow();
    expect(eng.applyAction(r.state, { t: 'summon', c, mode: 'atk', lane: 2 }).state.sides[0].board[2]?.iid).toBe(c);
  });

  const COV = 'card cov P fx-ember fx-spirit 6/2 fx-covetous\n';
  it('Covetous: lanes are the empty ones plus the sacrifice\'s own lane (board) or the empty ones (vault)', () => {
    const lanesOf = (script: string): number[] =>
      legalOf(COV + script).flatMap((x) => (x.t === 'summonCovetous' && x.mode === 'atk' ? [x.lane ?? -1] : []));
    expect(lanesOf(`step main
P hand cov
P board [a A] [b A appraised] [c A]`)).toEqual([1]);
    expect(lanesOf(`step main
P hand cov
P board [a A] [-] [b A appraised]`)).toEqual([1, 2]);
    expect(lanesOf(`step main
P hand cov
P board [a A] [b A] [-]
P vault [c appraised]`)).toEqual([2]);
  });

  it('Covetous enters the chosen lane', () => {
    const r = run(`${COV}step main
P hand cov
P board [a A] [b A appraised] [c A]
do covetous cov sac P1 A lane 1`);
    expect(r.state.sides[0].board[1]?.entered).toBe(2);
    expect(r.events.find((e) => e.e === 'CovetousSummoned')).toMatchObject({ slot: 1 });
  });

  it('Graft: the player picks the lane; a material\'s lane is free after the sacrifice', () => {
    const r = run(`card h P fx-ember fx-spirit 3/3
step main
P board [a A] [b A] [h A]
do graft P0 P2 | lane 2`);
    expect(r.events.find((e) => e.e === 'Grafted')).toMatchObject({ slot: 2 });
    expect(r.state.sides[0].board[0]).toBeNull();
    expect(r.state.sides[0].board[1]).not.toBeNull();
    expect(r.state.sides[0].board[2]?.entered).toBe(2);
    expect(() =>
      run(`card h P fx-ember fx-spirit 3/3
step main
P board [a A] [b A] [h A]
do graft P0 P2 | lane 1`)).toThrow(ScenarioError);
  });

  it('Graft: position stage offers (position, lane) for the free lanes only', () => {
    const r = run(`card h P fx-ember fx-spirit 3/3
step main
P board [a A] [b A] [h A]
do graftbegin`);
    const eng = scenarioEngine(r.content, ON);
    let s = r.state;
    const pick = (m: number): void => {
      s = eng.applyAction(s, { t: 'graftPick', m }).state;
    };
    pick(s.sides[0].board[0]?.iid as number);
    pick(s.sides[0].board[2]?.iid as number);
    s = eng.applyAction(s, { t: 'graftSkipAscend' }).state;
    const acts = eng.getLegalActions(s).filter((x) => x.t === 'graftPosition');
    expect(acts.map((x) => (x.t === 'graftPosition' ? `${x.pos}:${x.lane}` : ''))).toEqual(['0:0', '0:2', '1:0', '1:2']);
  });

  it('Appraisal still takes the leftmost free lane (D-284)', () => {
    const r = run(`card big P fx-ember fx-beast 7/2
turn 4
step main
P board [big A]
C board [x A] [-] [z A]
do end
expect C1 card big`);
    expect(r.state.sides[1].board[1]).not.toBeNull();
  });
});

describe('attackReach hook point (D-284)', () => {
  const reachSides = defineKeyword({
    id: 'fx-reach-sides', name: 'r', kind: 'keyword', icon: 'fx', visual: 'fx', text: 'Fixture.',
    hooks: { attackReach: () => [-1, 1] },
  });
  const reachOwn = defineKeyword({
    id: 'fx-reach-own', name: 'r', kind: 'keyword', icon: 'fx', visual: 'fx', text: 'Fixture.',
    hooks: { attackReach: () => [0] },
  });
  const spec: ContentSpec = { ...FX_SPEC, keywords: [...FX_KEYWORDS, reachSides, reachOwn] };

  it('a reaching attacker may target the offset lanes, clamped to the board, and not its own', () => {
    const script = `card r P fx-ember fx-beast 3/2 fx-reach-sides
step attack
P board [r A] [-] [-]
C board [x A] [y A] [z A]
expect legal attack P0 > C1
expect illegal attack P0 > C0
expect illegal attack P0 > C2`;
    run(script, ON, spec);
    run(`card r P fx-ember fx-beast 3/2 fx-reach-sides
step attack
P board [-] [r A] [-]
C board [x A] [y A] [z A]
expect legal attack P1 > C0
expect legal attack P1 > C2
expect illegal attack P1 > C1`, ON, spec);
  });

  it('is a union over keywords, so adding a keyword never removes a target', () => {
    run(`card r P fx-ember fx-beast 3/2 fx-reach-sides,fx-reach-own
step attack
P board [-] [r A] [-]
C board [x A] [y A] [z A]
expect legal attack P1 > C0
expect legal attack P1 > C1
expect legal attack P1 > C2`, ON, spec);
  });

  it('is not read with LANES off', () => {
    run(`card r P fx-ember fx-beast 3/2 fx-reach-sides
step attack
P board [r A] [-] [-]
C board [x A] [y A] [z A]
expect legal attack P0 > C0`, withGlobals(), spec);
  });

  it('a Sentinel still covers the reaching attacker\'s lane (cover is read from lane(A))', () => {
    run(`card r P fx-ember fx-beast 3/2 fx-reach-sides
step attack
P board [-] [r A] [-]
C board [s G] [y A] [z A]
expect legal attack P1 > C0
expect illegal attack P1 > C2`, ON, spec);
  });
});
