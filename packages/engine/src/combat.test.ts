import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { withGlobals } from '../test-utils/globals';
import { PC, pipeEnv, PENV, SPY } from '../test-utils/pipeline-fixture';
import { allCards, harness } from '../test-utils/run';
import { StateBuilder } from '../test-utils/state';
import { attackOptions, declareAttack, previewCombat, resolveCombat } from './combat';
import type { GameEvent } from './types/events';
import type { CombatSnapshot } from './types/hooks';
import type { GameState, Iid, Monster, Side } from './types/state';
import { RoundFlag } from './types/state';

beforeEach(() => {
  SPY.length = 0;
});

type Over = Partial<Omit<Monster, 'iid'>>;
const ev = <K extends GameEvent['e']>(events: readonly GameEvent[], k: K): Extract<GameEvent, { e: K }>[] =>
  events.filter((e): e is Extract<GameEvent, { e: K }> => e.e === k);
const lifeOf = (s: GameState, side: Side): number => s.sides[side].life;

interface Fight {
  s: GameState;
  A: Iid;
  T: Iid;
}
/** Player (turn 2) attacks the Collector's slot-0 monster with the player's slot-0 monster. */
function fight(a: string, t: string, tOver: Over = {}, aOver: Over = {}, turn = 2): Fight {
  const b = new StateBuilder(PC).turn(turn);
  const attSide: Side = (turn & 1) as Side;
  const A = b.card(a, attSide);
  const T = b.card(t, (1 - attSide) as Side);
  b.place(attSide, 0, A, aOver).place((1 - attSide) as Side, 0, T, tOver);
  return { s: b.build(), A, T };
}
function attack(f: Fight, target: Iid | -1 = f.T) {
  const h = harness(f.s, PENV);
  declareAttack(h.run, f.A, target);
  return { h, n: h.done() };
}

describe('resolveCombat table (§5.4, pure)', () => {
  const snap = (aP: number, dP: number, dG: number, defPos: 0 | 1): CombatSnapshot => ({ aP, dP, dG, defPos, advantage: false });
  it('attack position: higher Power wins, loser\'s owner takes the difference, tie destroys both', () => {
    expect(resolveCombat(snap(5, 3, 9, 0), false, false)).toEqual({ destroyAttacker: false, destroyDefender: true, dmgToAttacker: 0, dmgToDefender: 2 });
    expect(resolveCombat(snap(3, 5, 0, 0), false, false)).toEqual({ destroyAttacker: true, destroyDefender: false, dmgToAttacker: 2, dmgToDefender: 0 });
    expect(resolveCombat(snap(4, 4, 0, 0), false, false)).toEqual({ destroyAttacker: true, destroyDefender: true, dmgToAttacker: 0, dmgToDefender: 0 });
  });
  it('guard position: Power > Guard destroys with no damage; Power < Guard hurts the attacker; tie does nothing', () => {
    expect(resolveCombat(snap(5, 9, 3, 1), false, false)).toEqual({ destroyAttacker: false, destroyDefender: true, dmgToAttacker: 0, dmgToDefender: 0 });
    expect(resolveCombat(snap(2, 9, 3, 1), false, false)).toEqual({ destroyAttacker: false, destroyDefender: false, dmgToAttacker: 1, dmgToDefender: 0 });
    expect(resolveCombat(snap(3, 9, 3, 1), false, false)).toEqual({ destroyAttacker: false, destroyDefender: false, dmgToAttacker: 0, dmgToDefender: 0 });
  });
  it('Pierce changes only the guard-position win; it is ignored against attack position (D-039)', () => {
    expect(resolveCombat(snap(5, 9, 3, 1), true, false).dmgToDefender).toBe(2);
    expect(resolveCombat(snap(5, 3, 1, 0), true, false).dmgToDefender).toBe(2); // Power - Power, not Power - Guard
    expect(resolveCombat(snap(2, 9, 3, 1), true, false).dmgToAttacker).toBe(1); // Pierce does not save a failed attack
  });
  it('Brittle: the defender is destroyed, the attacker never is, damage is the normal positive amount (D-049)', () => {
    expect(resolveCombat(snap(3, 7, 1, 0), false, true)).toEqual({ destroyAttacker: false, destroyDefender: true, dmgToAttacker: 0, dmgToDefender: 0 });
    expect(resolveCombat(snap(9, 7, 1, 0), false, true).dmgToDefender).toBe(2);
    expect(resolveCombat(snap(3, 9, 6, 1), false, true)).toEqual({ destroyAttacker: false, destroyDefender: true, dmgToAttacker: 0, dmgToDefender: 0 });
    expect(resolveCombat(snap(8, 9, 6, 1), true, true).dmgToDefender).toBe(2); // Pierce excess still counts (D-040)
  });
});

describe('attack vs attack position (§5.4)', () => {
  it('attacker wins: defender destroyed, its controller takes the difference', () => {
    const f = fight('fx-pierce-fang', 'fx-ember-whelp'); // ember vs ember, 4 vs 3
    const { h, n } = attack(f);
    expect(n.sides[1].board[0]).toBeNull();
    expect(n.sides[1].discard).toEqual([f.T]);
    expect(n.sides[0].board[0]?.iid).toBe(f.A);
    expect(lifeOf(n, 1)).toBe(24);
    expect(lifeOf(n, 0)).toBe(20);
    expect(ev(h.events, 'CombatResolved')[0]).toMatchObject({ aP: 4, dStat: 3, advantage: false, pierce: false, brittle: false, destroyed: [f.T] });
    expect(ev(h.events, 'Damage')).toEqual([{ e: 'Damage', side: 1, amount: 1, source: f.A, lifeAfter: 24 }]);
  });
  it('attacker loses: attacker destroyed, its controller takes the difference', () => {
    const f = fight('fx-ember-whelp', 'fx-pierce-fang'); // 3 vs 4
    const { n } = attack(f);
    expect(n.sides[0].board[0]).toBeNull();
    expect(n.sides[0].discard).toEqual([f.A]);
    expect(n.sides[1].board[0]?.iid).toBe(f.T);
    expect(lifeOf(n, 0)).toBe(19);
    expect(lifeOf(n, 1)).toBe(25);
  });
  it('tie: both destroyed, no damage', () => {
    const f = fight('fx-ember-whelp', 'fx-ember-twin');
    const { n } = attack(f);
    expect(n.sides[0].board[0]).toBeNull();
    expect(n.sides[1].board[0]).toBeNull();
    expect([lifeOf(n, 0), lifeOf(n, 1)]).toEqual([20, 25]);
  });
  it('element advantage adds ELEMENT_BONUS to the attacker only (D-029)', () => {
    const f = fight('fx-ember-whelp', 'fx-echo-moth'); // ember beats tide: 3 + 2 vs 2
    const { h } = attack(f);
    expect(ev(h.events, 'CombatResolved')[0]).toMatchObject({ aP: 5, dStat: 2, advantage: true });
    // the defender does not get it when it is the one with advantage: tide beats umbra, attacker umbra
    const g = fight('fx-umbra-beast', 'fx-echo-moth'); // umbra attacks tide (tide beats umbra): no bonus for tide
    expect(ev(attack(g).h.events, 'CombatResolved')[0]).toMatchObject({ aP: 5, dStat: 2, advantage: false });
  });
  it('Lumen and Umbra beat each other both ways (the attacker gets +2)', () => {
    expect(ev(attack(fight('fx-lumen-seer', 'fx-umbra-beast')).h.events, 'CombatResolved')[0]?.advantage).toBe(true);
    expect(ev(attack(fight('fx-umbra-beast', 'fx-lumen-seer')).h.events, 'CombatResolved')[0]?.advantage).toBe(true);
  });
  it('a Collector attacker damages the player when it loses (sides are not hard-wired)', () => {
    const f = fight('fx-ember-whelp', 'fx-pierce-fang', {}, {}, 3); // Collector attacks 3 vs 4
    const { n } = attack(f);
    expect(lifeOf(n, 1)).toBe(24);
    expect(lifeOf(n, 0)).toBe(20);
    expect(n.sides[1].board[0]).toBeNull();
  });
});

describe('attack vs guard position and face-down (§5.4)', () => {
  it('Power > Guard: destroyed, no damage', () => {
    const f = fight('fx-umbra-beast', 'fx-ember-whelp', { pos: 1 }); // 5 vs guard 2
    const { n } = attack(f);
    expect(n.sides[1].board[0]).toBeNull();
    expect([lifeOf(n, 0), lifeOf(n, 1)]).toEqual([20, 25]);
  });
  it('Power > Guard with Pierce: the excess is dealt to the defender\'s controller', () => {
    const f = fight('fx-pierce-fang', 'fx-ember-whelp', { pos: 1 }); // 4 vs guard 2
    const { h, n } = attack(f);
    expect(n.sides[1].board[0]).toBeNull();
    expect(lifeOf(n, 1)).toBe(23);
    expect(ev(h.events, 'CombatResolved')[0]).toMatchObject({ pierce: true, dStat: 2 });
  });
  it('Pierce does nothing against an attack-position defender', () => {
    const f = fight('fx-pierce-fang', 'fx-ember-whelp'); // pos attack: 4 vs 3, damage 1, not 4-2
    const { h, n } = attack(f);
    expect(lifeOf(n, 1)).toBe(24);
    expect(ev(h.events, 'CombatResolved')[0]?.pierce).toBe(false);
  });
  it('Power < Guard: nothing destroyed, the attacker\'s controller takes the difference', () => {
    const f = fight('fx-ember-whelp', 'fx-sentinel-wall', { pos: 1 }); // 3 + 2 (ember beats tide) vs guard 6
    const { n } = attack(f);
    expect(n.sides[0].board[0]?.iid).toBe(f.A);
    expect(n.sides[1].board[0]?.iid).toBe(f.T);
    expect(lifeOf(n, 0)).toBe(19);
  });
  it('Power = Guard: nothing happens', () => {
    const f = fight('fx-lumen-seer', 'fx-tide-sprite', { pos: 1 }); // 4 vs guard 4, no advantage
    const { n } = attack(f);
    expect([lifeOf(n, 0), lifeOf(n, 1)]).toEqual([20, 25]);
    expect(n.sides[0].board[0]).not.toBeNull();
    expect(n.sides[1].board[0]).not.toBeNull();
  });
  it('a face-down target is revealed as face-up guard first, then resolved as guard', () => {
    const f = fight('fx-lumen-seer', 'fx-tide-sprite', { pos: 1, faceDown: true }); // tie: nothing destroyed
    const { h, n } = attack(f);
    expect(ev(h.events, 'Revealed')).toEqual([{ e: 'Revealed', iid: f.T, side: 1 }]);
    const t = n.sides[1].board[0];
    expect(t).toMatchObject({ iid: f.T, faceDown: false, pos: 1 });
    expect(h.events.map((e) => e.e)).toEqual(['AttackDeclared', 'Revealed', 'CombatResolved']);
  });
  it('advantage is computed after the reveal, and the revealed keywords are active (D-029, D-037)', () => {
    const f = fight('fx-ember-whelp', 'fx-warded-ox', { pos: 1, faceDown: true }); // 3 vs guard 4: attacker hurt
    const { n } = attack(f);
    expect(lifeOf(n, 0)).toBe(19);
    const g = fight('fx-umbra-beast', 'fx-warded-ox', { pos: 1, faceDown: true }); // 5 > guard 4: Ward (now active) saves it
    const r = attack(g);
    expect(ev(r.h.events, 'WardBroken')).toHaveLength(1);
    expect(r.n.sides[1].board[0]).toMatchObject({ wardUsed: true, faceDown: false });
  });
  it('a face-down Sentinel does not constrain targeting but is revealed when attacked (D-037)', () => {
    const b = new StateBuilder(PC);
    const A = b.card('fx-umbra-beast', 0);
    const wall = b.card('fx-sentinel-wall', 1);
    const other = b.card('fx-ember-whelp', 1);
    const s = b.place(0, 0, A).place(1, 0, wall, { pos: 1, faceDown: true }).place(1, 1, other).build();
    expect(attackOptions(s, PENV, A)).toEqual([wall, other]);
  });
});

describe('direct attacks', () => {
  it('deal full Power to the defending side and win the game at 0 life', () => {
    const b = new StateBuilder(PC);
    const A = b.card('fx-umbra-beast', 0);
    const s = b.place(0, 0, A).build();
    const h = harness(s, PENV);
    declareAttack(h.run, A, -1);
    const n = h.done();
    expect(lifeOf(n, 1)).toBe(20);
    expect(h.events.map((e) => e.e)).toEqual(['AttackDeclared', 'Damage']);
    const b2 = new StateBuilder(PC).life(1, 5);
    const A2 = b2.card('fx-umbra-beast', 0);
    const lethal = harness(b2.place(0, 0, A2).build(), PENV);
    declareAttack(lethal.run, A2, -1);
    const e = lethal.done();
    expect(e.result).toEqual({ winner: 0, reason: 'collectorDefeated', round: 2 });
    expect(e.step).toBe('over');
    expect(ev(lethal.events, 'GameOver')).toHaveLength(1);
  });
  it('the Collector attacking the player directly can defeat the player', () => {
    const b = new StateBuilder(PC).turn(3).life(0, 4);
    const A = b.card('fx-relic-tether', 1);
    const s = b.place(1, 0, A, { entered: 1 }).place(1, 1, b.card('fx-ember-whelp', 1)).build();
    const h = harness(s, PENV);
    declareAttack(h.run, A, -1); // 6 Power (not alone)
    const n = h.done();
    expect(n.result).toEqual({ winner: 1, reason: 'playerDefeated', round: 2 });
  });
  it('Collector mood follows direct damage (D-080)', () => {
    const b = new StateBuilder(PC).life(1, 17);
    const A = b.card('fx-umbra-beast', 0);
    const h = harness(b.place(0, 0, A).build(), PENV);
    declareAttack(h.run, A, -1); // 17 - 5 = 12: agitated
    const n = h.done();
    expect(n.collector.mood).toBe(1);
    expect(ev(h.events, 'MoodChanged')).toEqual([{ e: 'MoodChanged', from: 0, to: 1 }]);
  });
});

describe('declaration bookkeeping (D-014, D-033, D-127)', () => {
  it('marks attacked = turn, closes the Reposition step, forfeits an unused play, flags the round for the player', () => {
    const f = fight('fx-umbra-beast', 'fx-ember-whelp', { pos: 1 });
    expect(f.s.step).toBe('main');
    expect(f.s.played).toBe(false);
    const { n } = attack(f);
    expect(n.step).toBe('attack');
    expect(n.played).toBe(true);
    expect(n.sides[0].board[0]?.attacked).toBe(2);
    expect(n.track.round[1]).toBe(RoundFlag.Attacked);
  });
  it('the Collector\'s attacks do not touch Track.round (player-side events only)', () => {
    const f = fight('fx-ember-whelp', 'fx-pierce-fang', {}, {}, 3);
    expect(attack(f).n.track.round).toEqual(f.s.track.round);
  });
  it('rejects attacks the board contradicts', () => {
    const f = fight('fx-ember-whelp', 'fx-pierce-fang');
    const h = harness(f.s, PENV);
    expect(() => declareAttack(h.run, 99, -1)).toThrow(/not on a board/);
    expect(() => declareAttack(h.run, f.A, f.A)).toThrow(/defending board/);
  });
  it('is atomic: a failed attack leaves the input state untouched', () => {
    const f = fight('fx-tamper', 'fx-ember-whelp');
    const before = f.s;
    expect(() => attack(f)).toThrow(TypeError);
    expect(f.s).toBe(before);
    expect(f.s.sides[0].board[0]?.attacked).toBe(-1);
  });
});

describe('traps: cancelAttack is immediate (D-122, D-071, §8.3.4)', () => {
  function trapped(...traps: string[]): { f: Fight; trapIids: Iid[] } {
    const b = new StateBuilder(PC);
    const A = b.card('fx-umbra-beast', 0);
    const T = b.card('fx-ember-whelp', 1);
    b.place(0, 0, A).place(1, 0, T);
    const trapIids = traps.map((id, i) => {
      const c = b.card(id, 1);
      b.setTrap(1, i, c);
      return c;
    });
    return { f: { s: b.build(), A, T }, trapIids };
  }
  it('Snare-like trap: AttackCancelled, no combat, the attack is used up, nobody hurt', () => {
    const { f, trapIids } = trapped('fx-trap-snare');
    const { h, n } = attack(f);
    expect(h.events).toEqual([
      { e: 'AttackDeclared', attacker: f.A, target: f.T },
      { e: 'AttackCancelled', attacker: f.A, by: trapIids[0] },
    ]);
    expect(n.sides[0].board[0]?.attacked).toBe(2); // D-033
    expect([lifeOf(n, 0), lifeOf(n, 1)]).toEqual([20, 25]);
    expect(n.sides[1].board[0]?.iid).toBe(f.T);
  });
  it('later subscribers see ctx.cancelled === true immediately', () => {
    const { f } = trapped('fx-trap-snare', 'fx-trap-spy');
    attack(f);
    expect(SPY.filter((x) => x.startsWith('trapSaw'))).toEqual([expect.stringMatching(/cancelled=true/)]);
  });
  it('an earlier trap that does not cancel leaves the later one a live attack', () => {
    const { f } = trapped('fx-trap-spy', 'fx-trap-snare');
    attack(f);
    expect(SPY.filter((x) => x.startsWith('trapSaw'))).toEqual([expect.stringMatching(/cancelled=false/)]);
  });
  it('a cancelling trap\'s other queued effects still resolve (Thornwall: cancel + switch to guard)', () => {
    const b = new StateBuilder(PC);
    const A = b.card('fx-umbra-beast', 0);
    const thorn = b.card('fx-trap-thorn', 1);
    const s = b.place(0, 0, A).setTrap(1, 0, thorn).build();
    const h = harness(s, PENV);
    declareAttack(h.run, A, -1);
    const n = h.done();
    expect(lifeOf(n, 1)).toBe(25); // no damage
    expect(n.sides[0].board[0]?.pos).toBe(1);
    expect(n.sides[0].board[0]?.repositioned).toBe(-1); // not a reposition (D-024)
    expect(h.events.map((e) => e.e)).toEqual(['AttackDeclared', 'AttackCancelled', 'PositionChanged']);
  });
  it('Mirror-Sigil-like trap: the attack continues with the reduced Power (D-036), also when direct', () => {
    const b = new StateBuilder(PC);
    const A = b.card('fx-umbra-beast', 0);
    const mirror = b.card('fx-trap-mirror', 1);
    const h = harness(b.place(0, 0, A).setTrap(1, 0, mirror).build(), PENV);
    declareAttack(h.run, A, -1);
    const n = h.done();
    expect(lifeOf(n, 1)).toBe(23); // 5 - 3
    expect(n.sides[0].board[0]?.permP).toBe(-3);
    // and against a monster: snapshot taken after the trap's effect
    const g = trapped('fx-trap-mirror');
    const r = attack(g.f);
    expect(ev(r.h.events, 'CombatResolved')[0]).toMatchObject({ aP: 2 });
  });
});

describe('beforeCombat (D-124, D-135, D-141)', () => {
  it('bystander monsters\' beforeCombat hooks run too, attacker side first (§8.3.1)', () => {
    const b = new StateBuilder(PC);
    const A = b.card('fx-ember-whelp', 0);
    const spyA = b.card('fx-spy-card', 0);
    const T = b.card('fx-ember-whelp', 1);
    const spyT = b.card('fx-spy-card', 1);
    const s = b.place(0, 0, A).place(0, 1, spyA).place(1, 0, T, { pos: 1 }).place(1, 1, spyT).build();
    attack({ s, A, T });
    expect(SPY.filter((x) => x.startsWith('beforeCombat'))).toEqual([`beforeCombat@${spyA}`, `beforeCombat@${spyT}`]);
  });
  it('the snapshot is frozen in dev mode: a hook that writes it throws; production mode does not freeze', () => {
    const f = fight('fx-tamper', 'fx-ember-whelp');
    expect(() => attack(f)).toThrow(TypeError);
    const prod = harness(f.s, pipeEnv(undefined, false));
    expect(() => declareAttack(prod.run, f.A, f.T)).not.toThrow();
  });
  it('a hook-queued effect runs before resolve but cannot change the snapshot (D-032)', () => {
    const f = fight('fx-pump', 'fx-ember-twin', { pos: 1 }); // pump 3 vs guard 2: wins; the +3 does not alter the numbers
    const { h, n } = attack(f);
    const names = h.events.map((e) => e.e);
    expect(names.indexOf('StatsModified')).toBeLessThan(names.indexOf('CombatResolved'));
    expect(ev(h.events, 'CombatResolved')[0]).toMatchObject({ aP: 3, dStat: 2 });
    expect(n.sides[0].board[0]?.permP).toBe(3);
    expect(lifeOf(n, 1)).toBe(25); // guard-position win: no damage, even though Power is now 6
  });
  it('pump vs attack-position: damage uses the snapshot Power, not the pumped one', () => {
    const f = fight('fx-pump', 'fx-ember-twin'); // 3 vs 3 tie in attack position, despite the +3 queued
    const { n } = attack(f);
    expect(n.sides[0].board[0]).toBeNull();
    expect(n.sides[1].board[0]).toBeNull();
    expect([lifeOf(n, 0), lifeOf(n, 1)]).toEqual([20, 25]);
  });
  it('if a queued effect removes a combatant the attack fizzles: no CombatResolved, no damage (D-124)', () => {
    const f = fight('fx-reaper', 'fx-ember-whelp');
    const { h, n } = attack(f);
    expect(ev(h.events, 'CombatResolved')).toEqual([]);
    expect(n.sides[1].board[0]).toBeNull(); // the reaper's effect destroyed it
    expect(n.sides[0].board[0]?.iid).toBe(f.A);
    expect([lifeOf(n, 0), lifeOf(n, 1)]).toEqual([20, 25]);
    expect(ev(h.events, 'Damage')).toEqual([]);
  });
  it('flags set by different subscribers are OR-folded (Pierce from the attacker, Brittle from the defender)', () => {
    const b = new StateBuilder(PC);
    const A = b.card('fx-flags', 0); // sets Pierce when attacking
    const T = b.card('fx-flags-brittle', 1); // sets BrittleWin when defending (no element condition: fixture)
    const s = b.place(0, 0, A).place(1, 0, T, { pos: 1 }).build();
    const { h, n } = attack({ s, A, T });
    expect(ev(h.events, 'CombatResolved')[0]).toMatchObject({ pierce: true, brittle: true, destroyed: [T] });
    expect(lifeOf(n, 1)).toBe(25 - 0); // aP 3 vs guard 5: brittle destroys, pierce excess is max(0, 3 - 5) = 0
  });
});

describe('Brittle (D-049, D-050)', () => {
  it('destroys a Brittle defender attacked with advantage regardless of Power; the attacker survives', () => {
    const f = fight('fx-ember-whelp', 'fx-relic-brittle'); // ember beats tide: 5 vs 7 in attack position
    const { h, n } = attack(f);
    expect(n.sides[1].board[0]).toBeNull();
    expect(n.sides[0].board[0]?.iid).toBe(f.A);
    expect([lifeOf(n, 0), lifeOf(n, 1)]).toEqual([20, 25]); // 5 < 7: no damage either way
    expect(ev(h.events, 'CombatResolved')[0]).toMatchObject({ brittle: true, advantage: true });
  });
  it('deals the normal positive damage when the attacker\'s Power is higher', () => {
    const f = fight('fx-pierce-fang', 'fx-relic-brittle', {}, { permP: 4 }); // (4+4)+2 = 10 vs 7
    const { n } = attack(f);
    expect(lifeOf(n, 1)).toBe(22);
  });
  it('in guard position, Pierce excess still counts (D-040)', () => {
    const f = fight('fx-pierce-fang', 'fx-relic-brittle', { pos: 1 }); // 4+2 = 6 vs guard 1
    const { n } = attack(f);
    expect(lifeOf(n, 1)).toBe(20);
  });
  it('does nothing without advantage: the normal fight is lost', () => {
    const f = fight('fx-umbra-beast', 'fx-relic-brittle'); // tide beats umbra, not the reverse: 5 vs 7
    const { n } = attack(f);
    expect(n.sides[0].board[0]).toBeNull();
    expect(lifeOf(n, 0)).toBe(18);
    expect(n.sides[1].board[0]?.iid).toBe(f.T);
  });
  it('does not trigger when the Brittle monster is the attacker', () => {
    const f = fight('fx-relic-brittle', 'fx-umbra-beast', {}, {}, 3); // tide attacks umbra with advantage: 9 vs 5
    const { n } = attack(f);
    expect(n.sides[0].board[0]).toBeNull();
    expect(n.sides[1].board[0]?.iid).toBe(f.A);
  });
  it('Ward prevents the Brittle destruction (D-050), damage still follows the snapshot (D-035)', () => {
    const f = fight('fx-pierce-fang', 'fx-relic-brittle-ward', {}, { permP: 4 });
    const { h, n } = attack(f);
    expect(ev(h.events, 'WardBroken')).toHaveLength(1);
    expect(n.sides[1].board[0]).toMatchObject({ iid: f.T, wardUsed: true });
    expect(lifeOf(n, 1)).toBe(22);
  });
});

describe('Ward in combat (D-034, D-035, D-044)', () => {
  it('a Ward defender that loses an attack-position fight keeps its slot but its controller still takes the damage', () => {
    const f = fight('fx-umbra-beast', 'fx-warded-ox'); // 5 vs 4
    const { h, n } = attack(f);
    expect(n.sides[1].board[0]).toMatchObject({ iid: f.T, wardUsed: true });
    expect(lifeOf(n, 1)).toBe(24);
    expect(h.events.map((e) => e.e)).toEqual(['AttackDeclared', 'CombatResolved', 'WardBroken', 'Damage']);
  });
  it('consumed Ward: the next identical fight destroys it', () => {
    const f = fight('fx-umbra-beast', 'fx-warded-ox', { wardUsed: true });
    const { n } = attack(f);
    expect(n.sides[1].board[0]).toBeNull();
  });
  it('tie with Ward on one side: Ward holder saved and keeps the board; the other is destroyed; no damage (D-034)', () => {
    const f = fight('fx-warded-ox', 'fx-haunt-four'); // 4 vs 4 (umbra vs ember)
    const { n } = attack(f);
    expect(n.sides[0].board[0]).toMatchObject({ iid: f.A, wardUsed: true });
    expect(n.sides[1].board[0]).toBeNull();
    expect([lifeOf(n, 0), lifeOf(n, 1)]).toEqual([20, 25]);
    // Haunt: the destroyer is still on the board (saved by Ward), so it loses Power (D-045)
    expect(n.sides[0].board[0]?.permP).toBe(-2);
  });
  it('mutual destruction without Ward: Haunt fizzles', () => {
    const f = fight('fx-ember-whelp', 'fx-haunt-four', {}, { permP: 1 }); // 4 vs 4
    const { h, n } = attack(f);
    expect(n.sides[0].board[0]).toBeNull();
    expect(ev(h.events, 'StatsModified')).toEqual([]);
    expect(n.sides[0].discard).toEqual([f.A]);
  });
});

describe('order: destruction before damage (D-032)', () => {
  it('Insurance-Claim-like heal from onDestroyed lands before the damage, lifting him out of lethal', () => {
    const b = new StateBuilder(PC).life(1, 4);
    const A = b.card('fx-pierce-fang', 0);
    const T = b.card('fx-echo-moth', 1); // ember vs tide: 4 + 2 vs 2 -> 4 damage
    const ins = b.card('fx-trap-insurance', 1);
    const s = b.place(0, 0, A).place(1, 0, T).setTrap(1, 0, ins).build();
    const h = harness(s, PENV);
    declareAttack(h.run, A, T);
    const n = h.done();
    expect(n.result).toBeNull();
    expect(lifeOf(n, 1)).toBe(3); // 4 + 3 - 4
    const names = h.events.map((e) => e.e);
    expect(names.indexOf('LifeGained')).toBeLessThan(names.indexOf('Damage'));
  });
  it('without the heal the same attack is lethal', () => {
    const b = new StateBuilder(PC).life(1, 4);
    const A = b.card('fx-pierce-fang', 0);
    const T = b.card('fx-echo-moth', 1);
    const h = harness(b.place(0, 0, A).place(1, 0, T).build(), PENV);
    declareAttack(h.run, A, T);
    expect(h.done().result?.reason).toBe('collectorDefeated');
  });
  it('a game ended by an onDestroyed effect skips the pending combat damage (§8.3.5)', () => {
    const b = new StateBuilder(PC);
    const A = b.card('fx-umbra-beast', 0);
    const T = b.card('fx-bomb', 1); // dies, deals 99 to the player
    const s = b.place(0, 0, A).place(1, 0, T).build();
    const h = harness(s, PENV);
    declareAttack(h.run, A, T);
    const n = h.done();
    expect(n.result).toMatchObject({ winner: 1, reason: 'playerDefeated' });
    expect(lifeOf(n, 1)).toBe(25); // the 4 combat damage never landed
  });
  it('Avenger-style effect chain: queued destruction of the destroyer is FIFO and its own batch', () => {
    const b = new StateBuilder(PC);
    const A = b.card('fx-umbra-beast', 0);
    const T = b.card('fx-avenger', 1);
    const h = harness(b.place(0, 0, A).place(1, 0, T).build(), PENV);
    declareAttack(h.run, A, T);
    const n = h.done();
    expect(n.sides[0].board[0]).toBeNull();
    expect(n.sides[1].board[0]).toBeNull();
    expect((n.track.round[1] ?? 0) & RoundFlag.LostMonster).toBe(RoundFlag.LostMonster);
    expect(lifeOf(n, 1)).toBe(25 - 3);
  });
});

describe('attackOptions (targeting rules of §6.2, D-027, D-037, D-038, D-041, D-042)', () => {
  it('lists enemy monsters in slot order; direct only against an empty board', () => {
    const b = new StateBuilder(PC);
    const A = b.card('fx-umbra-beast', 0);
    const t1 = b.card('fx-ember-whelp', 1);
    const t2 = b.card('fx-ember-whelp', 1);
    expect(attackOptions(b.place(0, 0, A).place(1, 0, t1).place(1, 2, t2).build(), PENV, A)).toEqual([t1, t2]);
    const b2 = new StateBuilder(PC);
    const A2 = b2.card('fx-umbra-beast', 0);
    expect(attackOptions(b2.place(0, 0, A2).build(), PENV, A2)).toEqual([-1]);
  });
  it('face-up Sentinels are the only targets (any of them); face-down monsters count as non-Sentinels', () => {
    const b = new StateBuilder(PC);
    const A = b.card('fx-umbra-beast', 0);
    const plain = b.card('fx-ember-whelp', 1);
    const wall = b.card('fx-sentinel-wall', 1);
    const wall2 = b.card('fx-sentinel-wall', 1);
    const s = b.place(0, 0, A).place(1, 0, plain).place(1, 1, wall).place(1, 2, wall2).build();
    expect(attackOptions(s, PENV, A)).toEqual([wall, wall2]);
  });
  it('only attack-position, face-up monsters that have not attacked and are not summoning sick', () => {
    const mk = (over: Over) => {
      const b = new StateBuilder(PC);
      const A = b.card('fx-umbra-beast', 0);
      const T = b.card('fx-ember-whelp', 1);
      return { s: b.place(0, 0, A, over).place(1, 0, T).build(), A, T };
    };
    for (const over of [{ pos: 1 }, { faceDown: true, pos: 1 }, { attacked: 2 }, { entered: 2 }] as Over[]) {
      const { s, A } = mk(over);
      expect(attackOptions(s, PENV, A)).toEqual([]);
    }
    const ok = mk({});
    expect(attackOptions(ok.s, PENV, ok.A)).toEqual([ok.T]);
  });
  it('Swift on its entry turn: monsters only, never direct (D-041); a normal sick monster has no attack', () => {
    const b = new StateBuilder(PC);
    const sw = b.card('fx-swift-scout', 0);
    const sick = b.card('fx-ember-whelp', 0);
    const T = b.card('fx-ember-whelp', 1);
    const s = b.place(0, 0, sw, { entered: 2 }).place(0, 1, sick, { entered: 2 }).place(1, 0, T).build();
    expect(attackOptions(s, PENV, sw)).toEqual([T]);
    expect(attackOptions(s, PENV, sick)).toEqual([]);
    const empty = new StateBuilder(PC);
    const sw2 = empty.card('fx-swift-scout', 0);
    expect(attackOptions(empty.place(0, 0, sw2, { entered: 2 }).build(), PENV, sw2)).toEqual([]);
    const later = new StateBuilder(PC);
    const sw3 = later.card('fx-swift-scout', 0);
    expect(attackOptions(later.place(0, 0, sw3, { entered: 0 }).build(), PENV, sw3)).toEqual([-1]);
  });
  it('the player cannot attack in round 1 even with Swift (D-015, D-042), the Collector can', () => {
    const b = new StateBuilder(PC).turn(0);
    const sw = b.card('fx-swift-scout', 0);
    const T = b.card('fx-ember-whelp', 1);
    const s = b.place(0, 0, sw, { entered: 0 }).place(1, 0, T).build();
    expect(attackOptions(s, PENV, sw)).toEqual([]);
    const c = new StateBuilder(PC).turn(1);
    const sw2 = c.card('fx-swift-scout', 1);
    const P = c.card('fx-ember-whelp', 0);
    expect(attackOptions(c.place(1, 0, sw2, { entered: 1 }).place(0, 0, P).build(), PENV, sw2)).toEqual([P]);
  });
  it('FIRST_ATTACK_ROUND_PLAYER is a global (D-142)', () => {
    const env = pipeEnv(withGlobals({ FIRST_ATTACK_ROUND_PLAYER: 3 }));
    const b = new StateBuilder(PC); // round 2
    const A = b.card('fx-umbra-beast', 0);
    expect(attackOptions(b.place(0, 0, A).build(), env, A)).toEqual([]);
  });
  it('Slow restricts the entry turn even with a grant', () => {
    const b = new StateBuilder(PC).turn(3);
    const sl = b.card('fx-relic-slow', 1);
    const P = b.card('fx-ember-whelp', 0);
    expect(attackOptions(b.place(1, 0, sl, { entered: 3 }).place(0, 0, P).build(), PENV, sl)).toEqual([]);
  });
});

describe('previewCombat (§5.4)', () => {
  it('matches what the pipeline then does, without side effects', () => {
    const f = fight('fx-pierce-fang', 'fx-ember-whelp', { pos: 1 });
    const p = previewCombat(f.s, PENV, f.A, f.T);
    expect(p).toMatchObject({
      known: true,
      direct: false,
      aP: 4,
      dStat: 2,
      pierce: true,
      brittle: false,
      outcome: { destroyAttacker: false, destroyDefender: true, dmgToAttacker: 0, dmgToDefender: 2 },
    });
    const { n } = attack(f);
    expect(lifeOf(n, 1)).toBe(25 - 2);
    expect(SPY).toEqual([]);
  });
  it('is unknown for a face-down target and for nothing else', () => {
    const f = fight('fx-pierce-fang', 'fx-ember-whelp', { pos: 1, faceDown: true });
    expect(previewCombat(f.s, PENV, f.A, f.T)).toEqual({ known: false });
  });
  it('reports Brittle and Ward, and a direct attack', () => {
    const f = fight('fx-ember-whelp', 'fx-relic-brittle-ward');
    const p = previewCombat(f.s, PENV, f.A, f.T);
    expect(p).toMatchObject({ known: true, brittle: true, advantage: true, defenderWarded: true, attackerWarded: false });
    const b = new StateBuilder(PC);
    const A = b.card('fx-umbra-beast', 0);
    expect(previewCombat(b.place(0, 0, A).build(), PENV, A, -1)).toMatchObject({
      known: true,
      direct: true,
      aP: 5,
      outcome: { dmgToDefender: 5, destroyDefender: false },
    });
  });
  it('does not touch the state (the input is returned untouched and nothing is queued)', () => {
    const f = fight('fx-pump', 'fx-ember-twin');
    const before = JSON.stringify(f.s);
    previewCombat(f.s, PENV, f.A, f.T);
    expect(JSON.stringify(f.s)).toBe(before);
  });
});

describe('properties', () => {
  const NAMES = ['fx-ember-whelp', 'fx-umbra-beast', 'fx-warded-ox', 'fx-pierce-fang', 'fx-haunt-shade', 'fx-echo-moth', 'fx-relic-brittle', 'fx-sentinel-wall', 'fx-tide-sprite', 'fx-lumen-seer'];
  const monster = fc.record({
    id: fc.constantFrom(...NAMES),
    pos: fc.constantFrom<0 | 1>(0, 1),
    faceDown: fc.boolean(),
  });
  it('any attack conserves cards, never leaves a destroyed monster on a board, and preview agrees with the pipeline', () => {
    fc.assert(
      fc.property(monster, monster, (a, t) => {
        const b = new StateBuilder(PC).life(0, 100).life(1, 100);
        const A = b.card(a.id, 0);
        const T = b.card(t.id, 1);
        b.place(0, 0, A, { pos: 0 }).place(1, 0, T, { pos: t.faceDown ? 1 : t.pos, faceDown: t.faceDown });
        const s = b.build();
        const before = allCards(s);
        const h = harness(s, PENV);
        const pre = previewCombat(s, PENV, A, T);
        declareAttack(h.run, A, T);
        const n = h.done();
        expect(allCards(n)).toEqual(before);
        if (pre.known) {
          const ev1 = ev(h.events, 'CombatResolved')[0];
          expect(ev1?.aP).toBe(pre.aP);
          expect(ev1?.destroyed.includes(A)).toBe(pre.outcome.destroyAttacker);
          expect(ev1?.destroyed.includes(T)).toBe(pre.outcome.destroyDefender);
          expect(100 - lifeOf(n, 0)).toBe(pre.outcome.dmgToAttacker);
          expect(100 - lifeOf(n, 1)).toBe(pre.outcome.dmgToDefender);
        }
      }),
      { numRuns: 300 },
    );
  });
});
