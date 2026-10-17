// The AI under the bond rules (D-305 to D-320): the redacted views carry the attached symbiote, the Collector reads the host's
// Guard through the engine and never bonds, the bots are legal and deterministic with the bond switches on, and
// `rankBondOptions` turns an engine preview into a best-option hint. Synthetic cards for the rules, the live content for the
// duels; no test pins a weight.
import { describe, expect, it } from 'vitest';
import { createEngine } from '@vault-duel/engine';
import type { Action, BondPreview, GameState, Globals, Iid } from '@vault-duel/engine';
import { withGlobals } from '@vault-duel/engine/test-utils/globals';
import {
  botAction,
  bondRankContext,
  createCollector,
  createExpert,
  createGreedy,
  createNoise,
  createNovice,
  EXPERT_BOND_WEIGHTS,
  EXPERT_WEIGHTS,
  expertHash,
  playerView,
  rankBondOptions,
} from '../src';
import type { Bot, BondRankContext } from '../src';
import { CONTENT, GLOBALS, SEED } from './helpers';
import { attackRule, createWorld, mon, Scene } from './world';

const NUMBERS = { T_GILT_POWER: 2, T_FORFEIT_MAX: 4, AI_FACEDOWN_ATTACK_MIN_POWER: 7 };
const ON = { SPLIT: true, SYMBIOSIS: true, BOND_ACTION: true } as const;
const BOND = withGlobals({ FLAGS: ON, CONTENT_NUMBERS: NUMBERS });
const LIVE: Globals = { ...GLOBALS, FLAGS: { ...GLOBALS.FLAGS, ...ON } };
/** Every 2026-10-16 switch off explicitly (the live defaults flipped on): Graft only, free targeting, classic sickness. */
const OFF: Globals = { ...GLOBALS, SICKNESS_MODE: 'classic', FLAGS: { ...GLOBALS.FLAGS, LANES: false, SPLIT: false, SYMBIOSIS: false, BOND_ACTION: false } };
const LIVE_LANES: Globals = { ...LIVE, FLAGS: { ...LIVE.FLAGS, LANES: true }, SICKNESS_MODE: 'monstersOnly' };

const world = createWorld(
  [
    mon('c-mid', 'C', 5, 2, 'void'),
    mon('c-ace2', 'C', 9, 5, 'void'),
    mon('p-host', 'P', 3, 4, 'void'),
    mon('p-ward', 'P', 1, 1, 'void', ['ward']),
    mon('p-plain', 'P', 2, 2, 'void'),
    { id: 'p-family', type: 'family', power: 7, guard: 5 },
  ],
  undefined,
  BOND,
);
const bondEngine = createEngine(world.content, BOND, { intent: () => 'guard' });

/** A copy of `s` with the monster at (side, slot) carrying symbiote `sym`. */
function withSym(s: GameState, side: 0 | 1, slot: number, sym: Iid): GameState {
  const sd = s.sides[side];
  const board = sd.board.map((m, i) => (i === slot && m !== null ? { ...m, sym } : m));
  const sides = [s.sides[0], s.sides[1]] as [GameState['sides'][0], GameState['sides'][1]];
  sides[side] = { ...sd, board };
  return { ...s, sides };
}

describe('the views carry the attached symbiote (D-311)', () => {
  it('the Collector sees the symbiote on a player host, and the host Guard includes the bonus', () => {
    const sc = new Scene(world).board(1, 0, 'c-mid').board(0, 0, 'p-host', { pos: 1 });
    const sym = sc.b.card('p-ward', 0);
    const plain = sc.state();
    const bonded = withSym(plain, 0, 0, sym);
    const view = world.collector.view(bonded);
    const host = view.foeBoard[0];
    expect(host).not.toBeNull();
    if (host === null || host === undefined || host.faceDown) throw new Error('host should be face-up');
    expect(host.sym).toEqual({ id: 'p-ward', type: 'monster' });
    expect(host.guard).toBe(4 + BOND.SYMBIOSIS_GUARD_BONUS);
    expect(host.keywords).toContain('ward'); // the borrowed keyword is read through the engine's active keywords
    const before = world.collector.view(plain).foeBoard[0];
    expect(before !== null && before !== undefined && !before.faceDown && before.sym).toBeNull();
  });

  it('his own Appraised host shows its symbiote on OwnMonster', () => {
    const sc = new Scene(world).board(1, 0, 'c-mid', { appraised: true });
    const sym = sc.b.card('p-ward', 0);
    const view = world.collector.view(withSym(sc.state(), 1, 0, sym));
    expect(view.board[0]?.sym?.id).toBe('p-ward');
    expect(view.board[0]?.bondedKeywords).toContain('ward');
  });

  it('a face-down monster is described by slot alone, bonds or not', () => {
    const sc = new Scene(world).board(0, 0, 'p-host', { faceDown: true }).board(1, 0, 'c-mid');
    expect(world.collector.view(sc.state()).foeBoard[0]).toEqual({ faceDown: true, slot: 0 });
  });

  it('the player view shows his own symbiote and the Collector host symbiote', () => {
    const sc = new Scene(world, 6).board(0, 0, 'p-host').board(1, 0, 'c-mid', { appraised: true });
    const mine = sc.b.card('p-plain', 0);
    const his = sc.b.card('p-ward', 1);
    const s = withSym(withSym(sc.state(), 0, 0, mine), 1, 0, his);
    const v = playerView(world.collector.brain, s);
    expect(v.board[0]?.sym?.id).toBe('p-plain');
    const foe = v.foeBoard[0];
    expect(foe !== null && foe !== undefined && !foe.faceDown && foe.sym).toEqual({ id: 'p-ward', type: 'monster' });
    expect(v.bonds).toBe(true);
    expect(v.bondAction).toBe(true);
  });
});

describe('the Collector under bonds (D-311)', () => {
  it('reads the symbiote Guard when he picks a kill: a guard-position host that was killable is left alone', () => {
    const sc = new Scene(world).board(1, 0, 'c-mid').board(0, 0, 'p-host', { pos: 1 }).life(0, 20);
    // c-mid (5) against Guard 4 kills; against 4 + 2 it bounces
    expect(attackRule(sc, 'killWithoutLoss')).toEqual(['attack c-mid > p-host']);
    const sym = sc.b.card('p-plain', 0);
    const bonded = withSym(sc.state(), 0, 0, sym);
    // the rule reads the host's Guard through the engine: 4 + 2 beats his 5 Power
    expect(attackRule(Object.assign(sc, { state: () => bonded }), 'killWithoutLoss')).toEqual([]);
    // and the engine agrees: the same attack leaves the host standing
    const attack = world.collector.brain.engine.getLegalActions(bonded).find((a): a is Extract<Action, { t: 'attack' }> => a.t === 'attack' && a.target >= 0);
    expect(attack).toBeDefined();
    const after = bondEngine.applyAction(bonded, attack as Action).state;
    expect(after.sides[0].board[0]).not.toBeNull();
  });

  it('never has a bond action in his legal list, and never picks one, over whole duels with every switch on', () => {
    const collector = createCollector({ content: CONTENT, globals: LIVE });
    const engine = createEngine(CONTENT, LIVE, { intent: collector.intentPolicy }, { events: false, log: false, trusted: true });
    let collectorTurns = 0;
    for (let i = 0; i < 12; i++) {
      const bot = createNovice(`bonds${i}`);
      let s = engine.newGame(SEED(i)).state;
      while (s.result === null) {
        if ((s.turn & 1) === 1 && s.step !== 'mulligan') {
          const legal = engine.getLegalActions(s);
          for (const a of legal) expect(['split', 'symbiose']).not.toContain(a.t);
          const a = collector.act(s);
          expect(['split', 'symbiose']).not.toContain(a.t);
          collectorTurns++;
          s = engine.applyAction(s, a).state;
        } else {
          s = engine.applyAction(s, botAction(bot, collector.brain, s)).state;
        }
      }
    }
    expect(collectorTurns).toBeGreaterThan(20);
  });
});

/** Plays duels with the player bot under `globals`; returns the actions taken by the bot and a digest of all of them. */
function play(globals: Globals, make: (i: number) => Bot, games: number): { actions: Action[]; digest: string } {
  const collector = createCollector({ content: CONTENT, globals });
  const engine = createEngine(CONTENT, globals, { intent: collector.intentPolicy }, { events: false, log: false, trusted: true });
  const actions: Action[] = [];
  let digest = '';
  for (let i = 0; i < games; i++) {
    const bot = make(i);
    let s = engine.newGame(SEED(i)).state;
    while (s.result === null) {
      const mine = (s.turn & 1) === 0 || s.step === 'mulligan';
      const a = mine ? botAction(bot, collector.brain, s) : collector.act(s);
      if (mine) actions.push(a);
      digest += `${JSON.stringify(a)};`;
      s = engine.applyAction(s, a).state; // throws on an illegal action
    }
    digest += `|${s.result.winner}:${s.result.round}\n`;
  }
  return { actions, digest };
}

const BOTS: readonly (readonly [string, (i: number) => Bot])[] = [
  ['novice', (i) => createNovice(`n${i}`)],
  ['greedy', () => createGreedy()],
  ['expert', () => createExpert()],
  ['expert with noise', (i) => createExpert({ noise: createNoise(`k${i}`, 0.2) })],
];

describe.each([
  ['bond rules', LIVE],
  ['bond rules with lanes', LIVE_LANES],
] as const)('the bots under %s', (_name, globals) => {
  for (const [name, make] of BOTS) {
    it(`${name}: legal through whole duels, and the same seed gives the same choices`, () => {
      const games = name === 'expert' || name === 'expert with noise' ? 6 : 15;
      const a = play(globals, make, games);
      const b = play(globals, make, games);
      expect(a.digest).toBe(b.digest);
      expect(a.actions.length).toBeGreaterThan(0);
    });
  }

  it('the greedy and the expert use Split or Symbiosis, and the novice reaches them too', () => {
    const used = (make: (i: number) => Bot, games: number): Set<string> => new Set(play(globals, make, games).actions.map((a) => a.t));
    expect(used(() => createGreedy(), 15).has('symbiose')).toBe(true);
    expect(used(() => createExpert(), 12).has('symbiose')).toBe(true);
    const novice = used((i) => createNovice(`n${i}`), 40);
    expect(novice.has('symbiose')).toBe(true);
  });
});

describe('with every switch off the bond code is inert', () => {
  it('no bot ever takes a bond action', () => {
    for (const [, make] of BOTS) {
      const { actions } = play(OFF, make, 4);
      for (const a of actions) expect(['split', 'symbiose']).not.toContain(a.t);
    }
  });

  it('the expert hash is the old one while no switch is on, and covers the bond settings when one is', () => {
    expect(expertHash()).toBe(expertHash(false));
    expect(expertHash(true)).not.toBe(expertHash(false));
    expect(Object.keys(EXPERT_WEIGHTS)).not.toContain('maxBondOptions');
    expect(EXPERT_BOND_WEIGHTS.maxBondOptions).toBeGreaterThan(0);
  });

  it('the bond views report the switches', () => {
    const collector = createCollector({ content: CONTENT, globals: OFF });
    const s = createEngine(CONTENT, OFF, { intent: collector.intentPolicy }).newGame(SEED(1)).state;
    expect(playerView(collector.brain, s).bonds).toBe(false);
    expect(playerView(collector.brain, s).bondAction).toBe(false);
    const on = createCollector({ content: CONTENT, globals: GLOBALS });
    const s2 = createEngine(CONTENT, GLOBALS, { intent: on.intentPolicy }).newGame(SEED(1)).state;
    expect(playerView(on.brain, s2).bonds).toBe(true); // the live defaults since the 2026-10-16 flip
    expect(playerView(on.brain, s2).bondAction).toBe(true);
  });
});

describe('the expert keeps its plan bound with the bond switches on', () => {
  it('stays within maxPlans, and a smaller bound is honoured', () => {
    const small = 6;
    const big = createExpert();
    const tiny = createExpert({ weights: { ...EXPERT_BOND_WEIGHTS, maxPlans: small } });
    play(LIVE, () => big, 8);
    play(LIVE, () => tiny, 8);
    expect(big.stats.planned).toBeGreaterThan(0);
    expect(big.stats.maxPlans).toBeLessThanOrEqual(EXPERT_BOND_WEIGHTS.maxPlans);
    expect(tiny.stats.maxPlans).toBeLessThanOrEqual(small);
  });

  it('maxBondOptions caps the bond lines of a turn', () => {
    const none = createExpert({ weights: { ...EXPERT_BOND_WEIGHTS, maxBondOptions: 0, bondCombos: 0 } });
    const used = play(LIVE, () => none, 8).actions.map((a) => a.t);
    expect(used).not.toContain('split');
    expect(used).not.toContain('symbiose');
  });
});

// ---- rankBondOptions -----------------------------------------------------------------------------------------------

const EXPOSED = { nextRound: 3, turnsAway: 0, target: 5, targetPower: 8, cardsLost: 1 } as const;
const SAFE = { nextRound: 3, turnsAway: 0, target: -1, targetPower: 0, cardsLost: 0 } as const;
const mr = (iid: number, power: number, guard: number, kw = 0, symbiote = -1): BondPreview['options'][number]['result'][number] => ({
  iid, def: 0, element: 0, power, guard, kw, slot: 0, pos: 0, canAttackThisTurn: true, unstableUntil: -1, symbiote,
});
const option = (over: Partial<BondPreview['options'][number]>): BondPreview['options'][number] => ({
  kind: 'split', id: 'x', steps: [], positionFree: false, usesPlay: false, handCardsAfter: 4, result: [], boardAfter: [],
  boardPowerDelta: 0, boardGuardDelta: 0, bodiesDelta: 0, exposure: EXPOSED, ...over,
});
const preview = (options: BondPreview['options'], exposure: BondPreview['baseline']['exposure'] = EXPOSED): BondPreview => ({
  available: options.length > 0,
  baseline: { exposure, boardPower: 10, boardGuard: 6, bodies: 2 },
  options,
});

describe('rankBondOptions: the hint', () => {
  it('prefers the Split that dodges an Appraisal and says so', () => {
    const p = preview([
      option({ kind: 'symbiosis', id: 'symb:c1>h5', boardGuardDelta: 2, result: [mr(5, 8, 5)], handCardsAfter: 3 }),
      option({ kind: 'split', id: 'split:5', bodiesDelta: 1, boardPowerDelta: -1, exposure: SAFE }),
    ]);
    const r = rankBondOptions(p, { handCards: 4 });
    expect(r.best).toBe(1);
    expect(r.scores[1]?.reason).toBe('dodges Appraisal');
    expect(r.order).toEqual([1, 0]);
  });

  it('names a Guard and keyword gain for a Symbiosis, and a lane for a Split', () => {
    const ctx: BondRankContext = {
      handCards: 4,
      board: new Map([[7, { kw: 0, unstableUntil: -1 }]]),
      keywordIds: ['ward'],
    };
    const p = preview(
      [
        option({ kind: 'symbiosis', id: 'symb:c1>h7', boardGuardDelta: 2, result: [mr(7, 4, 6, 1, 1)], handCardsAfter: 3, exposure: SAFE }),
        option({ kind: 'split', id: 'split:9', bodiesDelta: 1, boardPowerDelta: 2, exposure: SAFE, handCardsAfter: 4 }),
      ],
      SAFE,
    );
    const r = rankBondOptions(p, ctx);
    expect(r.scores[0]?.reason).toBe('+2 Guard and Ward');
    expect(r.scores[1]?.reason).toBe('fills a lane');
  });

  it('warns about walking into an Appraisal, and suggests nothing when nothing beats waiting', () => {
    const p = preview(
      [option({ kind: 'symbiosis', id: 'symb:c1>h5', boardGuardDelta: 0, result: [mr(5, 8, 5, 0, 1)], handCardsAfter: 3, exposure: { ...EXPOSED, cardsLost: 2 } })],
      EXPOSED,
    );
    const r = rankBondOptions(p, { handCards: 4 });
    expect(r.best).toBe(-1);
    expect(r.scores[0]?.reason).toBe('puts 2 cards under Appraisal');
    expect(r.scores[0]?.score).toBeLessThan(0);
  });

  it('an Unstable Split is worth more on its last turn', () => {
    const board = (until: number) => new Map([[9, { kw: 0, unstableUntil: until }]]);
    const p = preview([option({ kind: 'split', id: 'split:9', bodiesDelta: 1, exposure: SAFE })], SAFE);
    const last = rankBondOptions(p, { board: board(6), turn: 6 }).scores[0] as { score: number; reason: string };
    const early = rankBondOptions(p, { board: board(8), turn: 6 }).scores[0] as { score: number; reason: string };
    expect(last.score).toBeGreaterThan(early.score);
    expect(last.reason).toBe('escapes Unstable expiry');
    expect(early.reason).toBe('escapes Unstable timer');
  });

  it('no options: best is -1 and the lists are empty', () => {
    expect(rankBondOptions(preview([]))).toEqual({ best: -1, scores: [], order: [] });
  });

  it('is deterministic and breaks ties on the lower index', () => {
    const same = option({ kind: 'split', id: 'a', bodiesDelta: 1, exposure: SAFE });
    const p = preview([same, { ...same, id: 'b' }], SAFE);
    const a = rankBondOptions(p);
    expect(rankBondOptions(p)).toEqual(a);
    expect(a.order).toEqual([0, 1]);
    expect(a.best).toBe(0);
  });
});

describe('rankBondOptions on a real engine preview', () => {
  it('scores every option of the live content, once per option, deterministically', () => {
    const collector = createCollector({ content: CONTENT, globals: LIVE });
    const engine = createEngine(CONTENT, LIVE, { intent: collector.intentPolicy }, { events: false, log: false, trusted: true });
    let seen = 0;
    let withBest = 0;
    for (let i = 0; i < 10; i++) {
      const bot = createGreedy();
      let s = engine.newGame(SEED(i)).state;
      while (s.result === null) {
        if ((s.turn & 1) === 0 && s.step === 'main') {
          const pv = engine.bondOptions(s);
          if (pv.available) {
            const ctx = bondRankContext(engine, CONTENT, s);
            const r = rankBondOptions(pv, ctx);
            expect(r.scores.length).toBe(pv.options.length);
            expect([...r.order].sort((x, y) => x - y)).toEqual(pv.options.map((_, k) => k));
            expect(r.best === -1 || (r.best >= 0 && r.best < pv.options.length)).toBe(true);
            for (const sc of r.scores) {
              expect(sc.reason.length).toBeGreaterThan(0);
              expect(sc.reason.length).toBeLessThan(40);
              expect(Number.isFinite(sc.score)).toBe(true);
            }
            expect(rankBondOptions(pv, ctx)).toEqual(r);
            seen++;
            if (r.best >= 0) withBest++;
          }
        }
        const mine = (s.turn & 1) === 0 || s.step === 'mulligan';
        s = engine.applyAction(s, mine ? botAction(bot, collector.brain, s) : collector.act(s)).state;
      }
    }
    expect(seen).toBeGreaterThan(10);
    expect(withBest).toBeGreaterThan(0);
  });
});
