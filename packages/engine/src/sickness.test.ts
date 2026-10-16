// Summoning sickness modes (D-280): 'classic' vs 'monstersOnly', across every way a monster enters. Fixture content only.
import { describe, expect, it } from 'vitest';
import { runScenarioOn } from '../test-utils/board-dsl';
import { FX_SPEC } from '../test-utils/fixture';
import { withGlobals } from '../test-utils/globals';
import type { Globals } from './types/globals';

const CLASSIC = withGlobals({ SICKNESS_MODE: 'classic' });
const MONSTERS_ONLY = withGlobals({ SICKNESS_MODE: 'monstersOnly' });
const CARDS = `
card a P fx-ember fx-beast 3/2
card sw P fx-ember fx-beast 3/2 fx-swift
card sl P fx-ember fx-beast 3/2 fx-slow
card big P fx-ember fx-beast 7/2
card bigslow P fx-ember fx-beast 7/2 fx-slow
card echo P fx-tide fx-spirit 2/2 fx-echo
card m1 P fx-tide fx-spirit 2/2
card m2 P fx-umbra fx-beast 2/2
card x C fx-tide fx-beast 2/2
card strong C fx-umbra fx-beast 5/5
`;
const run = (script: string, g: Globals): void => void runScenarioOn(CARDS + script, FX_SPEC, g);

describe('a freshly summoned monster (D-280)', () => {
  const vsMonster = `step attack
P board [a A new]
C board [x G]`;
  const vsLife = `step attack
P board [a A new]
C board [-]`;

  it('classic: cannot attack at all', () => {
    run(`${vsMonster}
expect illegal attack P0 > C0`, CLASSIC);
    run(`${vsLife}
expect illegal attack P0 > face`, CLASSIC);
  });

  it('monstersOnly: may attack a monster, never life', () => {
    run(`${vsMonster}
expect legal attack P0 > C0`, MONSTERS_ONLY);
    run(`${vsLife}
expect illegal attack P0 > face`, MONSTERS_ONLY);
  });

  it('from its owner\'s next turn it attacks life in both modes', () => {
    for (const g of [CLASSIC, MONSTERS_ONLY]) {
      run(`step attack
P board [a A]
C board [-]
expect legal attack P0 > face`, g);
    }
  });

  it('round 1 still has no player attacks in either mode (D-015)', () => {
    for (const g of [CLASSIC, MONSTERS_ONLY]) {
      run(`turn 0
step attack
P board [a A] [sw A]
C board [x G]
expect illegal attack P0 > C0
expect illegal attack P1 > C0`, g);
    }
  });

  it('the Collector follows the same mode on his turn', () => {
    run(`turn 3
step attack
P board [a G]
C board [x A new]
expect illegal attack C0 > P0`, CLASSIC);
    run(`turn 3
step attack
P board [a G]
C board [x A new]
expect legal attack C0 > P0`, MONSTERS_ONLY);
  });
});

describe('Swift and Slow follow the mode (D-280)', () => {
  it('Swift classic: monsters but not life', () => {
    run(`step attack
P board [sw A new]
C board [x G]
expect legal attack P0 > C0`, CLASSIC);
    run(`step attack
P board [sw A new]
C board [-]
expect illegal attack P0 > face`, CLASSIC);
  });

  it('Swift monstersOnly: also life, on the summon turn', () => {
    run(`step attack
P board [sw A new]
C board [-]
expect legal attack P0 > face`, MONSTERS_ONLY);
  });

  it('Swift never beats the round-1 ban', () => {
    run(`turn 0
step attack
P board [sw A new]
C board [-]
expect illegal attack P0 > face`, MONSTERS_ONLY);
  });

  it('Slow classic is a no-op (sickness already bars the summon turn)', () => {
    run(`step attack
P board [sl A new]
C board [x G]
expect illegal attack P0 > C0`, CLASSIC);
  });

  it('Slow monstersOnly: cannot attack at all on the summon turn, then attacks normally', () => {
    run(`step attack
P board [sl A new]
C board [x G]
expect illegal attack P0 > C0`, MONSTERS_ONLY);
    run(`step attack
P board [sl A]
C board [x G]
expect legal attack P0 > C0`, MONSTERS_ONLY);
  });

  it('Slow beats Swift (the fold is unchanged)', () => {
    // a monster with both keywords is a declared card; the restriction wins over the grant
    run(`card both P fx-ember fx-beast 3/2 fx-swift,fx-slow
step attack
P board [both A new]
C board [-]
expect illegal attack P0 > face`, MONSTERS_ONLY);
  });
});

describe('every new Monster record counts as summoned (D-280)', () => {
  it('an Appraised monster: hits monsters but not life the turn it is taken (monstersOnly); nothing in classic', () => {
    const script = `turn 4
step main
P board [big A] [m1 A]
C board [-] [x G] [-]
do end
expect C0 card big
`;
    run(`${script}expect illegal attack C0 > P1`, CLASSIC);
    run(`${script}expect legal attack C0 > P1`, MONSTERS_ONLY);
    // alone on the board: the stolen monster finds no monster, and life is still barred
    run(`turn 4
step main
P board [big A]
C board [x G]
do end
expect illegal attack C1 > face
expect illegal attack C0 > face`, MONSTERS_ONLY);
  });

  it('an Appraised Slow monster cannot attack at all that turn, in monstersOnly', () => {
    run(`turn 4
step main
P board [bigslow A] [m1 A]
C board [-] [x G] [-]
do end
expect illegal attack C0 > P1`, MONSTERS_ONLY);
  });

  it('a Graft Chimera: monsters but not life (monstersOnly); no attack in classic', () => {
    const graft = `step main
P board [m1 A] [m2 A]
C board [x G]
do graft P0 P1
`;
    run(`${graft}expect illegal attack P0 > C0`, CLASSIC);
    run(`${graft}expect legal attack P0 > C0`, MONSTERS_ONLY);
  });

  it('an Ascended Graft Chimera too', () => {
    run(`card m3 P fx-ember fx-beast 2/2
step main
P board [m1 A] [m2 A] [m3 A]
C board [x G]
do graft P0 P1 | ascend P2
expect legal attack P0 > C0
expect illegal attack P0 > face`, MONSTERS_ONLY);
  });

  it('a Covetous summon is new too', () => {
    run(`card cov P fx-ember fx-spirit 6/2 fx-covetous
step main
P hand cov
P board [m1 A appraised]
C board [x G]
do covetous cov sac P0 A
expect legal attack P0 > C0`, MONSTERS_ONLY);
    run(`card cov P fx-ember fx-spirit 6/2 fx-covetous
step main
P hand cov
P board [m1 A appraised]
C board [x G]
do covetous cov sac P0 A
expect illegal attack P0 > C0`, CLASSIC);
  });

  it('a card Echo returned to the hand and summoned again is new', () => {
    // turn 2: echo attacks strong and dies, returning to the hand; turn 4: it is summoned again
    const script = `step attack
P board [echo A]
C board [strong A]
do attack P0 > C0
do end
do end
do summon echo A
`;
    run(`${script}expect illegal attack P0 > C0`, CLASSIC);
    run(`${script}expect legal attack P0 > C0`, MONSTERS_ONLY);
    run(`${script}expect illegal attack P0 > face`, MONSTERS_ONLY);
  });
});

describe('what is NOT a summon (D-280)', () => {
  it('a position switch, or a lane move, does not make a monster "summoned" again', () => {
    // entered earlier, so a switched monster attacks life in both modes
    for (const g of [CLASSIC, MONSTERS_ONLY]) {
      run(`step main
P board [a G]
C board [-]
do reposition P0
expect legal attack P0 > face`, g);
    }
  });

  it('Pierce spillover to life is still dealt on the summon turn (monstersOnly; 6 + 2 element - 2 guard)', () => {
    const r = runScenarioOn(`${CARDS}card pc P fx-ember fx-beast 6/2 fx-pierce
step attack
P board [pc A new]
C board [x G]
C life 20
do attack P0 > C0
expect C life 14`, FX_SPEC, MONSTERS_ONLY);
    expect(r.state.sides[1].life).toBe(14);
  });
});
