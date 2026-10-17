// The Collector and the bots under lanes (D-286). Each rule of D-286 is checked with FLAGS.LANES on, and the shared
// behavior with it off. Synthetic cards, so tuning the live cards cannot break a rule test.
import { describe, expect, it } from 'vitest';
import { createEngine } from '@vault-duel/engine';
import type { Action } from '@vault-duel/engine';
import { withGlobals } from '@vault-duel/engine/test-utils/globals';
import type { GameContent } from '@vault-duel/content';
import type { Globals } from '@vault-duel/engine';
import { botAction, createCollector, createExpert, createGreedy, createNovice } from '../src';
import type { Bot, Collector } from '../src';
import { CONTENT, GLOBALS, SEED } from './helpers';
import { attackRule, collectorWith, createWorld, mon, playRule, Scene, withAi } from './world';

const CARDS = [
  mon('c-brute', 'C', 7, 3, 'void'),
  mon('c-mid', 'C', 5, 4, 'void'),
  mon('c-weak', 'C', 2, 2, 'void'),
  mon('c-sentinel', 'C', 6, 3, 'void', ['sentinel']),
  mon('c-brittle', 'C', 9, 4, 'fire', ['brittle']),
  mon('c-vain', 'C', 4, 3, 'void', ['vain']),
  mon('p-seven', 'P', 7, 3, 'void'),
  mon('p-six', 'P', 6, 3, 'void'),
  mon('p-four', 'P', 4, 3, 'void'),
  mon('p-small', 'P', 3, 3, 'void'),
  mon('p-sentinel', 'P', 2, 6, 'void', ['sentinel']),
  mon('p-water', 'P', 6, 3, 'water'),
  mon('p-stolen', 'P', 3, 3, 'void'),
];

const LANES = withGlobals({
  FLAGS: { LANES: true },
  CONTENT_NUMBERS: { T_GILT_POWER: 2, T_FORFEIT_MAX: 4, AI_FACEDOWN_ATTACK_MIN_POWER: 7 },
});
const lanes = createWorld(CARDS, undefined, LANES);
const classic = createWorld(CARDS);
const sc = (turn = 7): Scene => new Scene(lanes, turn);
const classicSc = (): Scene => new Scene(classic);

describe('summonLane (D-286), via summonFallback', () => {
  it('sentinelCenter: a Sentinel takes the middle lane when it is free', () => {
    expect(playRule(sc().hand(1, 'c-sentinel'), 'summonFallback')).toMatch(/^summon c-sentinel \w+ @1$/);
    // even with a beatable monster across from lane 0
    expect(playRule(sc().hand(1, 'c-sentinel').board(0, 0, 'p-small'), 'summonFallback')).toMatch(/@1$/);
  });

  it('sentinelCenter: with the middle taken it takes the free lane covering the most of his occupied lanes', () => {
    // lanes 1 and 2 are his; the only free lane is 0
    expect(playRule(sc().hand(1, 'c-sentinel').board(1, 1, 'c-weak').board(1, 2, 'c-weak'), 'summonFallback')).toMatch(/@0$/);
    // lane 1 taken: lanes 0 and 2 each cover it once, leftmost wins
    expect(playRule(sc().hand(1, 'c-sentinel').board(1, 1, 'c-weak'), 'summonFallback')).toMatch(/@0$/);
    // lanes 0 and 1 taken, middle taken: lane 2 is the only one, and with lane 0 and 2 taken the middle is free
    expect(playRule(sc().hand(1, 'c-sentinel').board(1, 0, 'c-weak').board(1, 2, 'c-weak'), 'summonFallback')).toMatch(/@1$/);
  });

  it('facingBeatable: the lane across from the highest-Power monster the card beats', () => {
    const s = sc().hand(1, 'c-brute').board(0, 0, 'p-seven').board(0, 1, 'p-small').board(0, 2, 'p-four');
    expect(playRule(s, 'summonFallback')).toMatch(/^summon c-brute \w+ @2$/);
  });

  it('facingEmpty: a lane across from an empty lane when it beats nothing', () => {
    const s = sc().hand(1, 'c-weak').board(0, 0, 'p-seven').board(0, 1, 'p-seven');
    expect(playRule(s, 'summonFallback')).toMatch(/@2$/);
  });

  it('leftmostFree: the final tie-break', () => {
    expect(playRule(sc().hand(1, 'c-brute'), 'summonFallback')).toMatch(/@0$/);
    expect(playRule(sc().hand(1, 'c-weak').board(0, 0, 'p-seven').board(0, 1, 'p-seven').board(0, 2, 'p-seven'), 'summonFallback')).toMatch(/@0$/);
  });

  it('is data: the list order decides', () => {
    const s = (): Scene => sc().hand(1, 'c-brute').board(0, 0, 'p-small').board(0, 1, 'p-seven');
    expect(playRule(s(), 'summonFallback')).toMatch(/@0$/); // facingBeatable first
    const flipped = withAi((ai) => {
      (ai.params as { summonLane: string[] }).summonLane = ['facingEmpty', 'facingBeatable', 'leftmostFree'];
    });
    expect(playRule(s(), 'summonFallback', flipped)).toMatch(/@2$/);
    const leftmost = withAi((ai) => {
      (ai.params as { summonLane: string[] }).summonLane = ['leftmostFree'];
    });
    expect(playRule(s(), 'summonFallback', leftmost)).toMatch(/@0$/);
  });

  it('a mood can replace the list', () => {
    const ai = withAi((a) => {
      (a.moods as { composed: { params: Record<string, unknown> } }).composed.params.summonLane = ['facingEmpty', 'leftmostFree'];
    });
    const s = sc().hand(1, 'c-brute').board(0, 0, 'p-small').board(0, 1, 'p-seven');
    expect(playRule(s, 'summonFallback', ai)).toMatch(/@2$/);
  });

  it('LANES off: no lane, leftmost free slot, summonLane unread', () => {
    const s = classicSc().hand(1, 'c-sentinel').board(0, 0, 'p-small');
    expect(playRule(s, 'summonFallback')).toMatch(/^summon c-sentinel \w+$/);
    const none = withAi((ai) => {
      delete (ai.params as { summonLane?: unknown }).summonLane;
    });
    expect(playRule(classicSc().hand(1, 'c-sentinel'), 'summonFallback', none)).toMatch(/^summon c-sentinel \w+$/);
  });
});

describe('summonAce (D-286)', () => {
  it('takes its lane from summonLane after the sacrifice is settled', () => {
    // the Unpriced (9/5) beats p-small across lane 1; the face-down monster in lane 0 is no known target
    const s = sc().hand(1, 'c-ace').vault(1, 'p-small').board(0, 0, 'p-seven', { faceDown: true }).board(0, 1, 'p-small');
    expect(playRule(s, 'summonAce')).toBe('covetous c-ace sac p-small atk @1');
  });

  it('a board sacrifice frees its own lane, which can then be chosen', () => {
    const s = sc().hand(1, 'c-ace').board(1, 1, 'p-stolen', { appraised: true }).board(0, 1, 'p-small');
    // lane 1 (across p-small, beatable) is occupied by the sacrifice; the engine lists it as free after the sacrifice
    expect(playRule(s, 'summonAce')).toMatch(/^covetous c-ace sac p-stolen atk @1$/);
  });
});

describe('summonBeater (D-286)', () => {
  it('plays the card and lane whose target has the highest Power', () => {
    const s = sc().hand(1, 'c-brute').hand(1, 'c-mid').board(0, 0, 'p-six').board(0, 1, 'p-small');
    expect(playRule(s, 'summonBeater')).toBe('summon c-brute atk @0');
  });

  it('ties go to the leftmost lane, then the card id', () => {
    const s = sc().hand(1, 'c-brute').hand(1, 'c-mid').board(0, 1, 'p-four').board(0, 2, 'p-four');
    expect(playRule(s, 'summonBeater')).toBe('summon c-brute atk @1');
  });

  it('is reachable from a lane, unlike "beats your strongest monster"', () => {
    // nothing beats the 7-Power monster, but the card beats p-four from lane 2; classic would play nothing
    const s = (w: Scene): Scene => w.hand(1, 'c-brute').board(0, 0, 'p-seven').board(0, 2, 'p-four');
    expect(playRule(s(sc()), 'summonBeater')).toBe('summon c-brute atk @2');
    expect(playRule(s(classicSc()), 'summonBeater')).toBeNull();
  });

  it('a covering Sentinel is the target, so a card that cannot beat it plays nothing', () => {
    // p-sentinel in guard (Guard 6) at lane 1 covers every lane; c-mid (5) cannot beat it
    const s = sc().hand(1, 'c-mid').board(0, 0, 'p-small').board(0, 1, 'p-sentinel', { pos: 1 });
    expect(playRule(s, 'summonBeater')).toBeNull();
    // c-brute (7) beats the Sentinel from any lane: leftmost
    expect(playRule(sc().hand(1, 'c-brute').board(0, 0, 'p-small').board(0, 1, 'p-sentinel', { pos: 1 }), 'summonBeater')).toBe(
      'summon c-brute atk @0',
    );
  });

  it('does nothing against an empty board', () => {
    expect(playRule(sc().hand(1, 'c-brute'), 'summonBeater')).toBeNull();
  });

  it('M-10: only the monster it would face counts for Brittle', () => {
    // water beats fire: the p-water across lane 0 would break the Brittle card, the void p-small across lane 1 would not
    const s = (): Scene => sc().hand(1, 'c-brittle').board(0, 0, 'p-water').board(0, 1, 'p-small');
    expect(playRule(s(), 'summonBeater')).toBe('summon c-brittle atk @0'); // highest target Power
    const skip = withAi((ai) => {
      (ai.params as { summonBeater: { skipBrittleCountered: boolean } }).summonBeater.skipBrittleCountered = true;
    });
    expect(playRule(s(), 'summonBeater', skip)).toBe('summon c-brittle atk @1');
  });
});

describe('attack rules only use legal lane pairs (D-286)', () => {
  it('killWithoutLoss: the monster across, not the strongest one it could beat', () => {
    const s = (w: Scene): Scene => w.board(1, 0, 'c-brute').board(0, 0, 'p-small').board(0, 1, 'p-six');
    expect(attackRule(s(sc()), 'killWithoutLoss')).toEqual(['attack c-brute > p-small']);
    expect(attackRule(s(classicSc()), 'killWithoutLoss')[0]).toBe('attack c-brute > p-six');
  });

  it('a monster across from an empty lane has no attack, and no direct attack while the foe has a monster', () => {
    const s = sc().board(1, 0, 'c-brute').board(0, 1, 'p-small');
    expect(attackRule(s, 'killWithoutLoss')).toEqual([]);
    expect(attackRule(s, 'directIfEmpty')).toEqual([]);
    expect(attackRule(s, 'lethal')).toEqual([]);
    expect(s.decide()).toBe('end');
  });

  it('directIfEmpty: direct only when the whole foe board is empty', () => {
    expect(attackRule(sc().board(1, 0, 'c-brute'), 'directIfEmpty')).toEqual(['attack c-brute > face']);
  });

  it('faceDownIfStrong: a face-down monster across, and only that one', () => {
    const across = sc().board(1, 0, 'c-brute').board(0, 0, 'p-small', { faceDown: true });
    expect(attackRule(across, 'faceDownIfStrong')).toEqual(['attack c-brute > p-small']);
    const beside = sc().board(1, 0, 'c-brute').board(0, 1, 'p-small', { faceDown: true });
    expect(attackRule(beside, 'faceDownIfStrong')).toEqual([]);
  });

  it('Vain: the best legal target is the one across', () => {
    const s = sc().board(1, 0, 'c-vain').board(0, 0, 'p-seven').board(0, 1, 'p-small');
    expect(attackRule(s, 'holdExceptVain')).toEqual(['attack c-vain > p-seven']);
  });

  it('Vain with no legal target has no obligation: the turn can end', () => {
    expect(sc().board(1, 0, 'c-vain').board(0, 2, 'p-small').decide()).toBe('end');
  });

  it('a Sentinel redirects the attack, and the best of several is chosen', () => {
    // p-sentinel at lane 2 covers lanes 1 and 2: the attacker in lane 1 may only hit it
    const s = sc().board(1, 1, 'c-brute').board(0, 1, 'p-small').board(0, 2, 'p-sentinel');
    expect(attackRule(s, 'killWithoutLoss')).toEqual(['attack c-brute > p-sentinel']);
  });

  it('killing a Sentinel opens the lanes it covered within the same turn', () => {
    const s = sc().board(1, 1, 'c-mid').board(1, 2, 'c-brute').board(0, 1, 'p-small').board(0, 2, 'p-sentinel');
    expect(s.turn()).toEqual(['attack c-brute > p-sentinel', 'attack c-mid > p-small', 'end']);
  });
});

describe('laneAware reposition (D-286)', () => {
  const aware = withAi((ai) => {
    ai.reposition = 'laneAware';
  });
  const withMoves = (scene: Scene) => collectorWith(scene.world, aware);
  const decide = (scene: Scene): string => scene.decide(withMoves(scene));

  it('moves a monster into the lane where a kill opens', () => {
    expect(decide(sc().board(1, 0, 'c-brute').board(0, 1, 'p-small'))).toBe('move c-brute > 1');
  });

  it('swaps with an own monster when that gives a kill', () => {
    // brute in lane 1 faces nothing; weak in lane 0 faces p-small. Slot order: weak proposes the swap first.
    expect(decide(sc().board(1, 0, 'c-weak').board(1, 1, 'c-brute').board(0, 0, 'p-small'))).toBe('move c-weak > 1');
  });

  it('prefers an empty lane to a swap', () => {
    const s = sc().board(1, 0, 'c-brute').board(1, 1, 'c-weak').board(0, 1, 'p-small');
    // brute (lane 0) can only step to lane 1 (a swap); weak (lane 1) cannot kill p-small. Brute's swap wins.
    expect(decide(s)).toBe('move c-brute > 1');
  });

  it('makes no move that gains nothing', () => {
    const s = sc().board(1, 0, 'c-brute').board(0, 0, 'p-small');
    expect(decide(s)).toBe('attack c-brute > p-small');
  });

  it('moves a Sentinel to the middle lane when that loses no attack', () => {
    // 7-Power foe across: the Sentinel (6) kills nothing from lane 0 or lane 1
    expect(decide(sc().board(1, 0, 'c-sentinel').board(0, 0, 'p-seven'))).toBe('move c-sentinel > 1');
  });

  it('keeps a Sentinel where it has a kill the move would lose', () => {
    expect(decide(sc().board(1, 0, 'c-sentinel').board(0, 0, 'p-small'))).toBe('attack c-sentinel > p-small');
  });

  it('a played turn ends: one move per monster', () => {
    const turn = sc().board(1, 0, 'c-brute').board(1, 1, 'c-weak').board(0, 1, 'p-small').turn(withMoves(sc()));
    expect(turn.filter((a) => a.startsWith('move')).length).toBeLessThanOrEqual(2);
    expect(turn.at(-1)).toBe('end');
  });

  it('toAttackIfUsable (the default) never moves', () => {
    expect(sc().board(1, 0, 'c-brute').board(0, 1, 'p-small').decide()).toBe('end');
  });

  it('with LANES off, laneAware is toAttackIfUsable', () => {
    const off = classicSc().board(1, 0, 'c-brute').board(0, 1, 'p-small');
    expect(off.decide(collectorWith(classic, aware))).toBe(off.decide());
  });
});

describe('engine facade lane queries', () => {
  it('laneTargets, targetsFromLane and attackReach agree with the legal attacks', () => {
    const scene = sc().board(1, 1, 'c-brute').board(0, 1, 'p-small').board(0, 2, 'p-sentinel');
    const state = scene.state();
    const e = lanes.collector.brain.engine;
    const iid = state.sides[1].board[1]?.iid as number;
    const legal = e.getLegalActions(state).filter((a) => a.t === 'attack').map((a) => (a.t === 'attack' ? a.target : -2));
    expect(e.laneTargets(state, iid)).toEqual(legal);
    expect(e.laneTargets(state, iid)).toEqual([state.sides[0].board[2]?.iid]); // the Sentinel in lane 2 covers lane 1
    expect(e.targetsFromLane(state, iid, 0)).toEqual([]); // the Sentinel does not reach lane 0, and nothing stands across
    expect(e.targetsFromLane(state, iid, 2)).toEqual([state.sides[0].board[2]?.iid]);
    expect(e.attackReach(state, iid)).toEqual([0]);
    expect(e.laneTargets(state, 999)).toEqual([]);
  });
});

describe('LANES off ignores every lane datum', () => {
  it('plays the same duels with summonLane changed and laneAware on', () => {
    // The live defaults flipped LANES on (2026-10-16), so the off path is set explicitly.
    const OFF: Globals = { ...GLOBALS, SICKNESS_MODE: 'classic', FLAGS: { ...GLOBALS.FLAGS, LANES: false, SPLIT: false, SYMBIOSIS: false, BOND_ACTION: false } };
    const ai = CONTENT.collector.ai;
    const odd = createCollector({
      content: { ...CONTENT, collector: { ...CONTENT.collector, ai: { ...ai, reposition: 'laneAware', params: { ...ai.params, summonLane: ['facingEmpty', 'leftmostFree'] } } } },
      globals: OFF,
    });
    const oldAi: GameContent = { ...CONTENT, collector: { ...CONTENT.collector, ai: { ...ai, reposition: 'toAttackIfUsable' } } }; // the pre-flip reposition
    const base = createCollector({ content: oldAi, globals: OFF });
    const trace = (collector: Collector, n: number): string => {
      const engine = createEngine(CONTENT, OFF, { intent: collector.intentPolicy });
      const bot = createGreedy();
      let s = engine.newGame(SEED(n)).state;
      const out: string[] = [];
      for (let i = 0; i < 400 && s.result === null; i++) {
        const a: Action = (s.turn & 1) === 0 || s.step === 'mulligan' ? botAction(bot, collector.brain, s) : collector.act(s);
        out.push(JSON.stringify(a));
        s = engine.applyAction(s, a).state;
      }
      return out.join('|');
    };
    for (let n = 1; n <= 6; n++) expect(trace(odd, n)).toBe(trace(base, n));
  });
});

describe('bots under lanes', () => {
  const duel = (bot: Bot, seed: string, globals: Globals, content: GameContent): boolean => {
    const collector = createCollector({ content, globals });
    const engine = createEngine(content, globals, { intent: collector.intentPolicy }, { events: false, log: false, trusted: true });
    let s = engine.newGame(seed).state;
    for (let n = 0; s.result === null && n < 5000; n++) {
      const a: Action = (s.turn & 1) === 0 || s.step === 'mulligan' ? botAction(bot, collector.brain, s) : collector.act(s);
      s = engine.applyAction(s, a).state;
    }
    return s.result !== null;
  };

  it('novice chooses uniformly among the legal actions, lane variants included', () => {
    const s = sc(6).hand(0, 'p-small').board(1, 0, 'c-weak');
    const state = s.state();
    const engine = lanes.collector.brain.engine;
    const legal = engine.getLegalActions(state);
    const summons = legal.filter((a) => a.t === 'summon');
    expect(summons.length).toBe(3 * 3); // modes x lanes
    const bot = createNovice('lanes-novice');
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const a = botAction(bot, lanes.collector.brain, state);
      expect(legal.some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(true);
      if (a.t === 'summon' && a.lane !== undefined) seen.add(a.lane);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('greedy summons across from the monster it beats', () => {
    const s = sc(6).hand(0, 'p-seven').board(1, 0, 'c-brute').board(1, 2, 'c-weak');
    const a = botAction(createGreedy(), lanes.collector.brain, s.state());
    expect(a.t === 'summon' ? a.lane : null).toBe(2);
  });

  it('expert summons across from the monster it beats', () => {
    const s = sc(6).hand(0, 'p-seven').board(1, 0, 'c-brute').board(1, 2, 'c-weak');
    const a = botAction(createExpert(), lanes.collector.brain, s.state());
    expect(a.t).toBe('summon');
    expect(a.t === 'summon' ? a.lane : null).toBe(2);
  });

  it('all three bots finish duels under lanes and monsters-only sickness, with and without laneAware', () => {
    const globals: Globals = { ...GLOBALS, FLAGS: { ...GLOBALS.FLAGS, LANES: true }, SICKNESS_MODE: 'monstersOnly' };
    const aware: GameContent = { ...CONTENT, collector: { ...CONTENT.collector, ai: { ...CONTENT.collector.ai, reposition: 'laneAware' } } };
    for (let i = 0; i < 6; i++) {
      for (const content of [CONTENT, aware]) {
        expect(duel(createNovice(`n${i}`), SEED(i), globals, content)).toBe(true);
        expect(duel(createGreedy(), SEED(i), globals, content)).toBe(true);
        expect(duel(createExpert(), SEED(i), globals, content)).toBe(true);
      }
    }
  });
});
