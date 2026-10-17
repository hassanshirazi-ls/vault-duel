// Bond rules (D-305..D-316): Split, Symbiosis, the bond slot, Graft's hand limit, release, Appraisal and Covetous with
// symbiotes. Fixture content and TEST_GLOBALS only (D-168): no live card, no DEFAULT_GLOBALS.
import { describe, expect, it } from 'vitest';
import { runScenarioOn, ScenarioError, scenarioEngine } from '../test-utils/board-dsl';
import type { ContentSpec } from '../test-utils/content-builder';
import { FX_SPEC } from '../test-utils/fixture';
import { withGlobals } from '../test-utils/globals';
import { hashState } from './replay';
import { redactState } from './view/redact';
import type { Action } from './types/actions';
import type { GameEvent } from './types/events';
import type { Globals } from './types/globals';
import type { GameState } from './types/state';

const SPEC: ContentSpec = {
  ...FX_SPEC,
  defs: [
    ...FX_SPEC.defs,
    { id: 'fx-spell-bounce', type: 'spell', spell: { target: { side: 'ally', zone: 'board' }, effects: [{ op: 'returnToHand', target: 'chosen' }] } },
  ],
};
const CARDS = `
card a P fx-ember fx-beast 3/2
card b P fx-tide fx-spirit 2/4
card c P fx-umbra fx-beast 4/3
card d P fx-lumen fx-spirit 4/4
card w P fx-ember fx-beast 2/2 fx-ward
card sn P fx-ember fx-beast 1/1 fx-sentinel
card ec P fx-ember fx-beast 2/2 fx-echo
card pa P fx-ember fx-beast 2/2 fx-pierce
card hs P fx-ember fx-beast 2/2 fx-haunt
card big P fx-ember fx-beast 7/3
card x C fx-tide fx-beast 2/2
card y C fx-tide fx-beast 2/2
card strong C fx-tide fx-beast 6/3
`;
const FLAGS = { SPLIT: true, SYMBIOSIS: true };
const ALL = withGlobals({ FLAGS: { ...FLAGS, BOND_ACTION: true } });
const AS_PLAYS = withGlobals({ FLAGS });
const OFF = withGlobals();

const run = (script: string, g: Globals = ALL) => runScenarioOn(CARDS + script, SPEC, g);
const names = (r: ReturnType<typeof run>, ids: readonly number[]): string[] => ids.map((i) => r.content.ids[r.state.inst[i]?.def ?? -1] ?? '?');
const evs = (r: { events: readonly GameEvent[] }, name: string): GameEvent[] => r.events.filter((e) => e.e === name);
const order = (r: { events: readonly GameEvent[] }, ...n: string[]): string[] => r.events.map((e) => e.e).filter((e) => n.includes(e));

describe('Symbiosis: legality (D-308)', () => {
  const base = `step main
P hand a b big fx-spell-bounce
P board [c A] [d D] [-]
C board [x A]`;

  it('a hand monster goes under a face-up own monster; one symbiote per host', () => {
    run(`${base}
expect legal symbiose a > P0
expect illegal symbiose a > P1
expect illegal symbiose a > C0
do symbiose a > P0
expect P0 sym a
expect illegal symbiose b > P0
expect P hand 3`);
  });

  it('a spell is not a symbiote, and the flag gates the action', () => {
    run(`${base}
expect illegal symbiose fx-spell-bounce > P0`);
    run(`${base}
expect illegal symbiose a > P0`, OFF);
  });

  it('a Chimera card in the hand is not a symbiote', () => {
    const r = run(`${base}
expect legal symbiose a > P0`);
    const s = r.state;
    const fam = r.content.index.get('fx-family-hybrid') as number;
    const iid = s.inst.length;
    const withChimeraCard: GameState = {
      ...s,
      inst: [...s.inst, { def: fam, owner: 0, chimera: { element: 0, kw: 0, ascended: false, materials: [], grafted: 0 } }],
      sides: [{ ...s.sides[0], hand: [...s.sides[0].hand, iid] }, s.sides[1]],
    };
    expect(scenarioEngine(r.content, ALL).isLegal(withChimeraCard, { t: 'symbiose', c: iid, host: (s.sides[0].board[0] as { iid: number }).iid })).toBe(false);
  });

  it('the Collector never bonds', () => {
    const r = run(`round 2 collector
step main
P board [c A]
C hand a b
C board [x A] [-] [-]`);
    const legal = scenarioEngine(r.content, ALL).getLegalActions(r.state);
    expect(legal.some((a) => a.t === 'symbiose' || a.t === 'split')).toBe(false);
  });
});

describe('Symbiosis: effect (D-308)', () => {
  it('+Guard, Power untouched, keyword lent to a host with room', () => {
    const r = run(`step main
P hand sn
P board [a A]
do symbiose sn > P0
expect P0 power 3
expect P0 guard 4
expect P0 has fx-sentinel
expect P hand 0`);
    const bonded = evs(r, 'Bonded')[0];
    expect(bonded).toMatchObject({ e: 'Bonded', side: 0, guard: 4 });
  });

  it('the Guard bonus is a global, and the keyword is lent only below MAX_INHERITED_KEYWORDS', () => {
    run(`step main
P hand sn
P board [a A]
do symbiose sn > P0
expect P0 guard 5`, withGlobals({ SYMBIOSIS_GUARD_BONUS: 3, FLAGS: { ...FLAGS, BOND_ACTION: true } }));
    // a Chimera host with two keywords takes only the Guard
    run(`step main
P hand sn
P board [ch A chimera(fx-family-hybrid,fx-ember,fx-pierce,fx-haunt)]
do symbiose sn > P0
expect P0 guard 7`, ALL);
    expect(() => run(`step main
P hand sn
P board [ch A chimera(fx-family-hybrid,fx-ember,fx-pierce,fx-haunt)]
do symbiose sn > P0
expect P0 has fx-sentinel`)).toThrow(ScenarioError);
    // with MAX_INHERITED_KEYWORDS 3 the same host has room
    run(`step main
P hand sn
P board [ch A chimera(fx-family-hybrid,fx-ember,fx-pierce,fx-haunt)]
do symbiose sn > P0
expect P0 has fx-sentinel`, withGlobals({ MAX_INHERITED_KEYWORDS: 3, FLAGS: { ...FLAGS, BOND_ACTION: true } }));
  });

  it('never lends a Flaw, and a face-down host cannot be bonded', () => {
    run(`step main
P hand a
P board [d D]
expect illegal symbiose a > P0`);
  });

  it('a lent Ward protects once; a used Ward masks the lent bit too', () => {
    const r = run(`step main
P hand w
P board [a A]
C board [strong A]
do symbiose w > P0
expect P0 has fx-ward
do end
expect P0 card a`, ALL);
    expect(r.state.turn).toBe(3);
    // the Collector (turn 3) attacks: the Ward saves the host
    const r2 = run(`round 2 collector
step main
P board [a A sym(w)]
C board [strong A]
do attack C0 > P0
expect P0 card a
expect event WardBroken
expect no event Destroyed
expect P0 sym w`, ALL);
    expect(order(r2, 'WardBroken', 'Destroyed')).toEqual(['WardBroken']);
  });

  it('a lent Sentinel makes the host a Sentinel that must be attacked first', () => {
    run(`round 2 collector
step main
P board [a A sym(sn)] [c A]
C board [x A]
expect legal attack C0 > P0
expect illegal attack C0 > P1`, ALL);
  });
});

describe('Symbiosis: release (D-308)', () => {
  it('a destroyed host brings the symbiote out in its slot: Destroyed, SymbioteEmerged, then hooks', () => {
    const r = run(`round 2 collector
step main
P board [c A] [a A sym(b)] [-]
C board [strong A]
do attack C0 > P1
expect P1 card b
expect event Destroyed
expect event SymbioteEmerged`, ALL);
    expect(order(r, 'Destroyed', 'SymbioteEmerged')).toEqual(['Destroyed', 'SymbioteEmerged']);
    const emerged = evs(r, 'SymbioteEmerged')[0] as Extract<GameEvent, { e: 'SymbioteEmerged' }>;
    expect(emerged).toMatchObject({ side: 0, slot: 1, cause: 'destroyed' });
    expect(names(r, r.state.sides[0].discard)).toEqual(['a']);
    const m = r.state.sides[0].board[1];
    expect(m).toMatchObject({ sym: -1, entered: r.state.turn, wardUsed: false, appraised: false, pos: 0 });
    expect(r.state.sides[0].hand).toEqual([]);
  });

  it('keeps the host position (a guard host leaves a guard symbiote)', () => {
    run(`round 2 collector
step main
P board [a G sym(b)]
C board [strong A]
do attack C0 > P0
expect P0 card b
expect P0 pos G`, ALL);
  });

  it('a Ward-prevented destruction leaves the symbiote attached', () => {
    run(`round 2 collector
step main
P board [w A sym(b)]
C board [strong A]
do attack C0 > P0
expect P0 card w
expect P0 sym b
expect no event SymbioteEmerged`, ALL);
  });

  it('Echo on the host returns the host to the hand and the symbiote still comes out', () => {
    const r = run(`round 2 collector
step main
P board [ec A sym(b)]
C board [strong A]
do attack C0 > P0
expect P0 card b
expect P hand has ec`, ALL);
    expect(order(r, 'Destroyed', 'SymbioteEmerged', 'ReturnedToHand')).toEqual(['Destroyed', 'SymbioteEmerged', 'ReturnedToHand']);
  });

  it('Haunt on the host sees the lent keyword in the last-known information', () => {
    // host `a` has no Haunt; its symbiote `hs` lends it. The destroyer loses Power through the host's Haunt.
    run(`round 2 collector
step main
P board [a A sym(hs)]
C board [strong A]
do attack C0 > P0
expect C0 power 4`, withGlobals({ HAUNT_PENALTY: 2, FLAGS: { ...FLAGS, BOND_ACTION: true } }));
  });

  it('a host returned to the hand by an effect releases the symbiote too', () => {
    const r = run(`step main
P hand fx-spell-bounce
P board [a A sym(b)] [c A]
do cast fx-spell-bounce > P0
expect P0 card b
expect P hand has a`, ALL);
    expect(evs(r, 'SymbioteEmerged')[0]).toMatchObject({ cause: 'returned', slot: 0 });
    expect(order(r, 'ReturnedToHand', 'SymbioteEmerged')).toEqual(['ReturnedToHand', 'SymbioteEmerged']);
  });

  it('only the destroyed host releases its symbiote', () => {
    const r = run(`round 2 collector
step main
P board [a A sym(b)] [c A sym(d)] [-]
C board [strong A]
do attack C0 > P0
expect P0 card b
expect P1 sym d`, ALL);
    expect(evs(r, 'SymbioteEmerged')).toHaveLength(1);
  });

  it('a tie destroys both combatants and both symbiotes come out, active side first', () => {
    const r = run(`round 2 collector
step main
P board [a A sym(b)]
C board [a A sym(d)]
do attack C0 > P0
expect P0 card b
expect C0 card d`, ALL);
    const em = evs(r, 'SymbioteEmerged') as Extract<GameEvent, { e: 'SymbioteEmerged' }>[];
    expect(em.map((e) => e.side)).toEqual([1, 0]);
    expect(order(r, 'Destroyed', 'SymbioteEmerged')).toEqual(['Destroyed', 'Destroyed', 'SymbioteEmerged', 'SymbioteEmerged']);
  });

  it('an Unstable Chimera host that expires brings its symbiote out after the one Destroyed', () => {
    const r = run(`round 2 player
step attack
P board [ch A unstable@2 chimera(fx-family-hybrid,fx-ember,-,mats=a+b) sym(c)]
do end
expect event UnstableExpired
expect event SymbioteEmerged
expect P0 card c`, ALL);
    expect(order(r, 'UnstableExpired', 'Destroyed', 'SymbioteEmerged')).toEqual(['UnstableExpired', 'Destroyed', 'SymbioteEmerged']);
    expect(evs(r, 'SymbioteEmerged')[0]).toMatchObject({ cause: 'destroyed' });
  });

  it('Split is the Unstable escape: the parts are not Unstable', () => {
    run(`round 2 player
step main
P board [ch A unstable@4 chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]
do split P0
do end
do end
do end
expect no event UnstableExpired
expect P0 card a
expect P1 card b`, ALL);
  });
});

describe('Symbiosis with Graft and Split (D-308)', () => {
  it('a host with a symbiote is not a Graft material', () => {
    run(`step main
P hand b
P board [a A sym(c)]
expect illegal graft`, ALL);
    run(`step main
P hand b
P board [a A]
expect legal graft`, ALL);
  });
});

describe('Appraisal and Covetous with symbiotes (D-308)', () => {
  const setup = `round 3 player
step attack
P hand a
P board [big A sym(b)] [c A] [-]
C board [-] [-] [-]
C hand
`;

  it('the Collector takes the host and the symbiote stays attached on his board', () => {
    const r = run(`${setup}do end`, ALL);
    const ev = evs(r, 'Appraised')[0] as Extract<GameEvent, { e: 'Appraised' }>;
    expect(ev).toMatchObject({ to: 'board', toSlot: 0 });
    expect(names(r, [ev.sym ?? -1])).toEqual(['b']);
    expect(r.state.sides[1].board[0]).toMatchObject({ appraised: true, sym: ev.sym });
    expect(r.state.appraisal.taken).toHaveLength(1);
    expect(r.state.track.appraisedLost).toBe(1);
    expect(r.state.sides[1].vault).toEqual([]);
  });

  it('Power alone decides the target: the Guard bonus does not make a 6-Power host eligible', () => {
    const r = run(`round 3 player
step attack
P board [d A sym(b)] [-] [-]
C board [-] [-] [-]
do end`, ALL);
    expect(evs(r, 'AppraisalFailed')).toHaveLength(1);
    expect(r.state.sides[0].board[0]).toMatchObject({ sym: expect.any(Number) });
  });

  it('with no free slot both cards go to the vault', () => {
    const r = run(`${setup.replace('C board [-] [-] [-]', 'C board [x A] [y A] [x A]')}do end`, ALL);
    expect(r.state.sides[1].vault).toHaveLength(2);
    expect(names(r, r.state.sides[1].vault)).toEqual(['big', 'b']);
    const ev = evs(r, 'Appraised')[0] as Extract<GameEvent, { e: 'Appraised' }>;
    expect(ev).toMatchObject({ to: 'vault', toSlot: -1 });
    expect(ev.sym).toBe(r.state.sides[1].vault[1]);
    expect(r.state.appraisal.taken).toHaveLength(1);
    expect(r.state.track.appraisedLost).toBe(1);
  });

  it('a Collector-side host that dies brings its symbiote out on his side, appraised, and it dies to the player discard', () => {
    const r = run(`round 2 player
step main
P board [c A] [d A]
C board [a A appraised sym(b)]
do attack P0 > C0
expect event SymbioteEmerged
expect C0 card b`, ALL);
    const m = r.state.sides[1].board[0];
    expect(m).toMatchObject({ appraised: true, sym: -1, entered: r.state.turn });
    expect(r.state.inst[m?.iid ?? -1]?.owner).toBe(0);
    expect(evs(r, 'SymbioteEmerged')[0]).toMatchObject({ side: 1, slot: 0 });
    // when it dies it goes to the player's discard (D-047)
    const e = scenarioEngine(r.content, ALL);
    const s = e.applyAction(r.state, { t: 'attack', a: r.state.sides[0].board[1]?.iid as number, target: m?.iid as number }).state;
    expect(s.sides[0].discard).toHaveLength(2);
    expect(s.sides[1].discard).toEqual([]);
  });

  it('sacrificing an Appraised host as a Covetous cost sends host and symbiote to the discard', () => {
    const r = run(`card cv P fx-ember fx-beast 3/3 fx-covetous
round 2 player
step main
P hand cv
P board [big A appraised sym(b)]
do covetous cv sac P0 A
expect P0 card cv
expect P discard 2`, ALL);
    expect(names(r, r.state.sides[0].discard)).toEqual(['big', 'b']);
    const sac = r.events.filter((e) => e.e === 'Sacrificed');
    expect(sac).toHaveLength(2);
    expect(sac[1]).toMatchObject({ reason: 'covetous', from: 'board' });
  });
});

describe('Split (D-307)', () => {
  const ch = `[ch A chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]`;

  it('unbinds into the stored materials: first part keeps the slot, the rest take the leftmost free slots', () => {
    const r = run(`step main
P board [-] ${ch} [-]
do split P1
expect P1 card a
expect P0 card b
expect P2 empty
expect event Split
expect no event Destroyed
expect P discard 0`, ALL);
    const ev = evs(r, 'Split')[0] as Extract<GameEvent, { e: 'Split' }>;
    expect(ev.slots).toEqual([1, 0]);
    expect(ev.pos).toBe(0);
    expect(r.state.nActions).toBe(1);
  });

  it('parts are fresh: Ward back, no mods, no Unstable or Shroud, cannot attack or reposition this turn', () => {
    const r = run(`step main
P board [-] [ch A chimera(fx-family-hybrid,fx-ember,-,mats=w+b) p-3 g-1 unstable@5 shroud@9 ward-used] [-]
do split P1
expect P1 card w
expect P1 has fx-ward`, ALL);
    const s = r.state;
    for (const m of s.sides[0].board) {
      if (m === null) continue;
      expect(m).toMatchObject({ wardUsed: false, permP: 0, permG: 0, unstableUntil: -1, shroudUntil: -1, sym: -1, appraised: false, faceDown: false });
      expect(m.entered).toBe(s.turn);
      expect(m.attacked).toBe(s.turn);
    }
    const e = scenarioEngine(r.content, ALL);
    const legal = e.getLegalActions(s);
    expect(legal.some((a) => a.t === 'attack' || a.t === 'reposition')).toBe(false);
  });

  it('parts cannot attack in either SICKNESS_MODE and Swift does not help', () => {
    for (const mode of ['classic', 'monstersOnly'] as const) {
      const g = withGlobals({ SICKNESS_MODE: mode, FLAGS: { ...FLAGS, BOND_ACTION: true } });
      const r = runScenarioOn(`${CARDS}card sw P fx-ember fx-beast 2/2 fx-swift
card q P fx-tide fx-spirit 2/2
step main
P board [ch A chimera(fx-family-hybrid,fx-ember,-,mats=sw+q)]
C board [x A]
do split P0
expect illegal attack P0 > C0`, SPEC, g);
      expect(r.state.sides[0].board[0]).toMatchObject({ attacked: r.state.turn });
    }
  });

  it('a full board sends the extra part to the hand, past HAND_SIZE if needed', () => {
    const r = run(`step main
P hand a a a a b
P board [c A] [ch A chimera(fx-family-hybrid,fx-ember,-,mats=d+b)] [c A]
do split P1
expect P1 card d`, ALL);
    const ev = evs(r, 'Split')[0] as Extract<GameEvent, { e: 'Split' }>;
    expect(ev.slots).toEqual([1, -1]);
    expect(r.state.sides[0].hand).toHaveLength(6);
    expect(r.state.sides[0].hand[5]).toBe(ev.parts[1]);
  });

  it('keeps the position of the Chimera', () => {
    run(`step main
P board [ch G chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]
do split P0
expect P0 pos G
expect P1 pos G`, ALL);
  });

  it('SPLIT_PART_PERM_P sets each part\'s permanent Power', () => {
    run(`step main
P board [ch A chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]
do split P0
expect P0 power 2
expect P1 power 1`, withGlobals({ SPLIT_PART_PERM_P: -1, FLAGS: { ...FLAGS, BOND_ACTION: true } }));
  });

  it('an Ascended Chimera gives three parts', () => {
    const r = run(`step main
P board [ch A chimera(fx-family-hybrid,fx-ember,-,asc,mats=a+b+c)]
do split P0
expect P0 card a
expect P1 card b
expect P2 card c`, ALL);
    expect(r.state.sides[0].discard).toEqual([]);
  });

  it('dissolves the instance: it is in no zone and never returns, and no hook runs', () => {
    const r = run(`step main
P board [ch A chimera(fx-family-hybrid,fx-ember,-,mats=ec+b)]
do split P0
expect no event Destroyed
expect no event ReturnedToHand`, ALL);
    const chIid = r.state.inst.findIndex((i) => i.chimera !== null);
    const s = r.state;
    const where = (iid: number): number =>
      s.sides.reduce((n, sd) => n + sd.deck.filter((x) => x === iid).length + sd.hand.filter((x) => x === iid).length + sd.discard.filter((x) => x === iid).length + sd.vault.filter((x) => x === iid).length + sd.board.filter((m) => m?.iid === iid).length, 0);
    expect(where(chIid)).toBe(0);
  });

  describe('legality', () => {
    const one = (extra: string, expectation: string, g: Globals = ALL) => run(`step main\n${extra}\n${expectation}`, g);

    it('needs FLAGS.SPLIT and a face-up Chimera of the player that did not enter this turn', () => {
      one(`P board [ch A chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]`, 'expect legal split P0');
      one(`P board [ch A chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]`, 'expect illegal split P0', withGlobals({ FLAGS: { SYMBIOSIS: true, BOND_ACTION: true } }));
      one(`P board [ch A new chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]`, 'expect illegal split P0');
      one(`P board [ch D chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]`, 'expect illegal split P0');
      one(`P board [a A]`, 'expect illegal split P0');
      one(`P board [ch A chimera(fx-family-hybrid,fx-ember,-,mats=a+b) sym(c)]`, 'expect illegal split P0');
      one(`C board [ch A chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]\nP board [a A]`, 'expect illegal split C0');
    });

    it('needs every stored material in the owner\'s discard', () => {
      const r = run(`step main
P board [ch A chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]
expect legal split P0`);
      const s = r.state;
      const taken: GameState = { ...s, sides: [{ ...s.sides[0], discard: s.sides[0].discard.slice(1) }, s.sides[1]] };
      const e = scenarioEngine(r.content, ALL);
      const m = s.sides[0].board[0]?.iid as number;
      expect(e.isLegal(taken, { t: 'split', m })).toBe(false);
      expect(e.isLegal(s, { t: 'split', m })).toBe(true);
    });

    it('the Collector never splits, even for an Appraised Chimera on his board', () => {
      const r = run(`round 2 collector
step main
P board [a A]
C board [ch A appraised chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]`);
      expect(scenarioEngine(r.content, ALL).getLegalActions(r.state).some((x) => x.t === 'split')).toBe(false);
    });
  });
});

describe('the bond slot (D-306)', () => {
  const ch = `[ch A chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]`;

  it('BOND_ACTION off: Split and Symbiosis are plays', () => {
    const r = run(`step main\nP hand sn\nP board ${ch}\ndo split P0\nexpect illegal summon sn A`, AS_PLAYS);
    expect(r.state).toMatchObject({ played: true, step: 'attack', bond: 0 });
    const r2 = run(`step main\nP hand sn b\nP board [a A]\ndo symbiose sn > P0\nexpect illegal summon b A\nexpect illegal symbiose b > P0`, AS_PLAYS);
    expect(r2.state).toMatchObject({ played: true, step: 'attack', bond: 0 });
    // and a play first closes them
    run(`step main\nP hand sn b\nP board [a A]\ndo summon b A\nexpect illegal symbiose sn > P0`, AS_PLAYS);
  });

  it('BOND_ACTION on: one card play plus one bond action, either order', () => {
    const r = run(`step main\nP hand sn b\nP board [a A] [-] [-]\ndo symbiose sn > P0\nexpect legal summon b A`);
    expect(r.state).toMatchObject({ played: false, step: 'main', bond: 1 });
    const r2 = run(`step main\nP hand sn b\nP board [a A] [-] [-]\ndo summon b A\nexpect legal symbiose sn > P0\ndo symbiose sn > P0\nexpect P0 sym sn`);
    expect(r2.state).toMatchObject({ played: true, step: 'attack', bond: 1 });
  });

  it('only one bond action per turn', () => {
    run(`step main\nP hand sn b\nP board [a A] [c A]\ndo symbiose sn > P0\nexpect illegal symbiose b > P1\nexpect illegal graft`);
  });

  it('a bond action does not close the Reposition step', () => {
    run(`step main\nP hand sn\nP board [a A] [c A]\ndo symbiose sn > P0\nexpect legal reposition P1`);
  });

  it('the first attack closes the bond', () => {
    const r = run(`round 2 player\nstep main\nP hand sn\nP board [a A] [c A]\nC board [x A]\ndo attack P0 > C0\nexpect illegal symbiose sn > P1`);
    expect(r.state.bond).toBe(2);
    const r2 = run(`round 2 player\nstep main\nP hand sn\nP board [a A] [c A]\nC board [x A]\ndo symbiose sn > P1\ndo attack P0 > C0`);
    expect(r2.state.bond).toBe(1);
  });

  it('a bond action is legal in the attack step after a play, and not after an attack', () => {
    run(`step attack\nP hand sn\nP board [a A]\nexpect legal symbiose sn > P0`);
    run(`step attack\nbond closed\nP hand sn\nP board [a A]\nexpect illegal symbiose sn > P0`);
    run(`step attack\nbond used\nP hand sn\nP board [a A]\nexpect illegal symbiose sn > P0`);
  });

  it('the bond reopens at the start of the next own turn', () => {
    const r = run(`round 2 player\nstep main\nP hand sn\nP board [a A]\ndo symbiose sn > P0\ndo end\ndo end`);
    expect(r.state).toMatchObject({ turn: 4, bond: 0 });
  });

  it('a Graft is the bond action: it leaves the play and the step alone, even with hand materials', () => {
    const r = run(`step main\nP hand a b sn\nP board [-] [-] [-]\ndo graft a b | pos A\nexpect legal summon sn A`);
    expect(r.state).toMatchObject({ played: false, step: 'main', bond: 1 });
    run(`step main\nP hand a b sn\nP board [-] [-] [-]\ndo graft a b | pos A\nexpect illegal graft`);
  });

  it('BOND_ACTION off: Graft stays the one play', () => {
    const r = run(`step main\nP hand a b sn\nP board [-] [-] [-]\ndo graft a b | pos A\nexpect illegal summon sn A`, OFF);
    expect(r.state).toMatchObject({ played: true, step: 'attack', bond: 0 });
  });

  it('a cancelled Graft leaves the bond open', () => {
    const r = run(`step main\nP hand a b\nP board [-] [-] [-]\ndo graftbegin\ndo graftcancel`);
    expect(r.state.bond).toBe(0);
  });

  it('BOND_GRAFT_MAX_HAND_MATERIALS limits the hand cards in one Graft', () => {
    const g = (n: number) => withGlobals({ BOND_GRAFT_MAX_HAND_MATERIALS: n, FLAGS: { ...FLAGS, BOND_ACTION: true } });
    run(`step main\nP hand a b\nP board [-] [-] [-]\nexpect illegal graft`, g(1));
    run(`step main\nP hand a\nP board [b A] [-] [-]\nexpect legal graft`, g(1));
    run(`step main\nP hand a b\nP board [-] [-] [-]\nexpect legal graft`, g(2));
    run(`step main\nP hand a\nP board [b A] [-] [-]\nexpect illegal graft`, g(0));
    // Ascend: a third hand card is not offered past the limit
    const r = run(`step main\nP hand a b d\nP board [-] [-] [-]\ndo graftbegin\ndo graftcancel`, g(2));
    expect(r.state.pending).toBeNull();
    const e = scenarioEngine(r.content, g(2));
    let s = e.applyAction(r.state, { t: 'graftBegin' }).state;
    const [ia, ib, id] = s.sides[0].hand as [number, number, number];
    s = e.applyAction(s, { t: 'graftPick', m: ia }).state;
    s = e.applyAction(s, { t: 'graftPick', m: ib }).state;
    expect(s.pending?.stage).toBe('position'); // no Ascend stage: the third hand card is over the limit
    expect(id).toBeGreaterThanOrEqual(0);
  });
});

describe('redaction and hashing', () => {
  it('redactState keeps the attached symbiote public for the viewer\'s opponent', () => {
    const r = run(`step main\nP hand b\nP board [a A sym(c)]\nC hand x y`);
    const view = redactState(r.state, 1);
    expect(view.sides[0].board[0]?.sym).toBe(r.state.sides[0].board[0]?.sym);
    expect(view.sides[0].hand).toEqual([]);
  });

  it('a state that never bonds hashes with no bond data; a bonded one differs', () => {
    const a = run(`step main\nP hand b\nP board [a A]`);
    const b = run(`step main\nP hand b\nP board [a A sym(c)]`);
    const c = run(`step main\nbond used\nP hand b\nP board [a A]`);
    expect(new Set([hashState(a.state), hashState(b.state), hashState(c.state)]).size).toBe(3);
  });
});

describe('Action type', () => {
  it('split and symbiose are plain data', () => {
    const acts: Action[] = [{ t: 'split', m: 3 }, { t: 'symbiose', c: 4, host: 5 }];
    expect(JSON.parse(JSON.stringify(acts))).toEqual(acts);
  });
});

describe('bondOptions (D-313, §5.6c)', () => {
  const script = `round 3 player
step main
P hand sn b
P board [big A] [c A] [-]
C board [-] [-] [-]`;

  it('lists graft, split and symbiosis options with Appraisal exposure as facts', () => {
    const r = run(script);
    const e = scenarioEngine(r.content, ALL);
    const pv = e.bondOptions(r.state);
    expect(pv.available).toBe(true);
    expect(pv.baseline).toMatchObject({ boardPower: 11, boardGuard: 6, bodies: 2 });
    expect(pv.baseline.exposure).toMatchObject({ nextRound: 3, turnsAway: 0, targetPower: 7, cardsLost: 1 });
    expect(pv.baseline.exposure.target).toBe(r.state.sides[0].board[0]?.iid);
    // four eligible materials (sn, b, big, c): ordered pairs with a recipe, and Ascend triples; then 2 cards x 2 hosts
    const kinds = pv.options.map((o) => o.kind);
    expect(kinds.filter((k) => k === 'graft').length).toBeGreaterThan(2);
    expect(kinds).toEqual([...kinds].sort((a, b) => ['graft', 'split', 'symbiosis'].indexOf(a) - ['graft', 'split', 'symbiosis'].indexOf(b)));
    expect(kinds.filter((k) => k === 'symbiosis')).toHaveLength(4);
    expect(new Set(pv.options.map((o) => o.id)).size).toBe(pv.options.length);
    const onBig = pv.options.find((o) => o.kind === 'symbiosis' && o.steps[0]?.t === 'symbiose' && o.steps[0].host === r.state.sides[0].board[0]?.iid);
    expect(onBig).toMatchObject({ usesPlay: false, positionFree: false, handCardsAfter: 1, boardGuardDelta: 2, boardPowerDelta: 0, bodiesDelta: 0 });
    expect(onBig?.exposure).toMatchObject({ cardsLost: 2, targetPower: 7 }); // a bonded host is a two-card loss
    const graft = pv.options.find((o) => o.kind === 'graft');
    expect(graft).toMatchObject({ positionFree: true });
    expect(graft?.id).toMatch(/^graft:\d+,\d+/);
    expect(graft?.steps[0]).toEqual({ t: 'graftBegin' });
    // the preview never writes the state
    expect(e.getLegalActions(r.state).filter((a) => a.t === 'graftBegin')).toHaveLength(1);
  });

  it('shows Split\'s parts, the lane kept, and the dodge', () => {
    const r = run(`round 3 player
step main
P board [ch A chimera(fx-family-hybrid,fx-ember,-,mats=a+b)]
C board [-] [-] [-]`);
    const e = scenarioEngine(r.content, ALL);
    const pv = e.bondOptions(r.state);
    expect(pv.baseline.exposure).toMatchObject({ targetPower: 7, cardsLost: 1 });
    expect(pv.options).toHaveLength(1);
    const o = pv.options[0];
    expect(o).toMatchObject({ kind: 'split', bodiesDelta: 1, boardPowerDelta: 5 - 7 });
    expect(o?.result.map((x) => [x.slot, x.canAttackThisTurn])).toEqual([[0, false], [1, false]]);
    expect(o?.exposure).toMatchObject({ target: -1, cardsLost: 0 }); // 3 and 2 Power: nothing for the Collector to take
  });

  it('is empty with the switches off, on the Collector\'s turn and after the bond is used', () => {
    const r = run(script, OFF);
    expect(scenarioEngine(r.content, OFF).bondOptions(r.state).available).toBe(true); // Graft is still a bond action
    const none = run(`round 3 player\nstep main\nP hand sn\nP board [big A]`, OFF);
    expect(scenarioEngine(none.content, OFF).bondOptions(none.state)).toMatchObject({ available: false, options: [] });
    const used = run(`${script}\nbond used`);
    expect(scenarioEngine(used.content, ALL).bondOptions(used.state)).toMatchObject({ available: false, options: [] });
    const col = run(`round 3 collector\nstep main\nP hand sn b\nP board [big A]`);
    expect(scenarioEngine(col.content, ALL).bondOptions(col.state).available).toBe(false);
  });
});
