// The turn slots (D-335, FLAGS.TURN_SLOTS): one monster summon, one spell or trap and one bond action per turn, in any
// order, and each monster attacks once. An attack closes nothing; a monster that has attacked no longer repositions or
// moves. Fixture content and TEST_GLOBALS only (D-168).
import { describe, expect, it } from 'vitest';
import { runScenarioOn } from '../test-utils/board-dsl';
import { FX_SPEC } from '../test-utils/fixture';
import { withGlobals } from '../test-utils/globals';
import type { Globals } from './types/globals';

const CARDS = `
card a P fx-ember fx-beast 3/2
card b P fx-tide fx-spirit 2/4
card c P fx-umbra fx-beast 4/3
card sn P fx-ember fx-beast 1/1 fx-sentinel
card x C fx-tide fx-beast 2/2
card y C fx-tide fx-beast 2/2
`;
const SLOTS = withGlobals({ FLAGS: { SPLIT: true, SYMBIOSIS: true, BOND_ACTION: true, TURN_SLOTS: true } });
const LANED = withGlobals({ FLAGS: { LANES: true, TURN_SLOTS: true } });
const OLD = withGlobals({ FLAGS: { SPLIT: true, SYMBIOSIS: true, BOND_ACTION: true } });
const run = (script: string, g: Globals = SLOTS) => runScenarioOn(CARDS + script, FX_SPEC, g);

describe('turn slots (D-335)', () => {
  it('a summon and a spell in the same turn, either order', () => {
    const r = run(`round 2 player\nstep main\nP hand a fx-trap-snare\nP board [-] [-] [-]\ndo summon a A\nexpect legal set fx-trap-snare\ndo set fx-trap-snare`);
    expect(r.state).toMatchObject({ played: true, spell: 1, step: 'main' });
    run(`round 2 player\nstep main\nP hand a fx-trap-snare\nP board [-] [-] [-]\ndo set fx-trap-snare\nexpect legal summon a A`);
  });

  it('one of each: a second summon or a second spell or trap is not offered', () => {
    run(`step main\nP hand a b\nP board [-] [-] [-]\ndo summon a A\nexpect illegal summon b A`);
    run(`step main\nP hand fx-trap-snare fx-trap-snare\nP board [-] [-] [-]\ndo set fx-trap-snare\nexpect illegal set fx-trap-snare`);
    run(`step main\nspell used\nP hand fx-spell-bolt\nP board [a A]\nC board [x A]\nexpect illegal cast fx-spell-bolt > C0`);
  });

  it('the bond is a third slot beside both', () => {
    run(`step main\nP hand sn b fx-trap-snare\nP board [a A] [-] [-]\ndo summon b A\ndo set fx-trap-snare\nexpect legal symbiose sn > P0\ndo symbiose sn > P0\nexpect P0 sym sn`);
  });

  it('an attack closes nothing: play, cast and bond after attacking', () => {
    const r = run(`round 2 player\nstep main\nP hand sn b fx-spell-bolt\nP board [a A] [-] [-]\nC board [x A] [y A]\ndo attack P0 > C0\nexpect legal summon b A\nexpect legal cast fx-spell-bolt > C1\nexpect legal symbiose sn > P0`);
    expect(r.state).toMatchObject({ played: false, spell: 0, bond: 0, step: 'main' });
  });

  it('each monster attacks once; one that attacked no longer switches or moves, the others still do', () => {
    run(`round 2 player\nstep main\nP board [a A] [c A] [-]\nC board [x G] [y G]\ndo attack P0 > C0\nexpect illegal attack P0 > C1\nexpect illegal reposition P0\nexpect legal reposition P1\nexpect legal attack P1 > C1`);
    run(`round 2 player\nstep main\nP board [a A] [-] [c A]\nC board [x G] [-] [y G]\ndo attack P0 > C0\nexpect illegal move P0 > 1\nexpect legal move P2 > 1`, LANED);
  });

  it('a swap needs both monsters free to move', () => {
    run(`round 2 player\nstep main\nP board [a A] [c A] [-]\nC board [x A] [y G]\ndo attack P1 > C1\nexpect illegal move P0 > 1\nexpect legal reposition P0`, LANED);
  });

  it('the spell slot reopens on the next own turn', () => {
    const r = run(`round 2 player\nstep main\nP hand fx-trap-snare\nP board [-] [-] [-]\ndo set fx-trap-snare\ndo end\ndo end`);
    expect(r.state).toMatchObject({ turn: 4, spell: 0, played: false });
  });

  it('flag off: one play, and the first attack closes the play and the bond (D-014, D-306)', () => {
    run(`step main\nP hand a fx-trap-snare\nP board [-] [-] [-]\ndo summon a A\nexpect illegal set fx-trap-snare`, OLD);
    const r = run(`round 2 player\nstep main\nP hand b\nP board [a A] [-] [-]\nC board [x A]\ndo attack P0 > C0\nexpect illegal summon b A`, OLD);
    expect(r.state).toMatchObject({ played: true, spell: 0, bond: 2, step: 'attack' });
  });
});
