// No hidden information (ARCHITECTURE.md §13.1, D-082, D-086, D-150). Two layers:
//   1. the view type has exactly the fields the design lists and no field for hidden values (compile-time, via tsc -b);
//   2. two states that differ only in hidden information produce identical views, decisions and intents, over many
//      states of real duels. "Hidden" for the Collector: the player's hand, deck order, face-down identities and set-trap
//      identities, and his own deck order (unknown even to him). For the player's bot: the Collector's hand, deck order and
//      set-trap identities.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createEngine, Sfc32 } from '@vault-duel/engine';
import type { GameState, Iid } from '@vault-duel/engine';
import { botAction, createGreedy, createNovice, playerView } from '../src';
import type { CollectorView, FoeMonster, PlayerView } from '../src';
import { createCollector } from '../src';
import { CONTENT, GLOBALS, SEED } from './helpers';
import type { Globals } from '@vault-duel/engine';
import type { GameContent } from '@vault-duel/content';

// The same checks run under the classic rules and under lanes + monsters-only sickness with the lane-aware reposition (D-286).
const LANE_GLOBALS: Globals = { ...GLOBALS, FLAGS: { ...GLOBALS.FLAGS, LANES: true }, SICKNESS_MODE: 'monstersOnly' };
const LANE_CONTENT: GameContent = { ...CONTENT, collector: { ...CONTENT.collector, ai: { ...CONTENT.collector.ai, reposition: 'laneAware' } } };
const CONFIGS: readonly (readonly [string, Globals, GameContent])[] = [
  ['classic rules', GLOBALS, CONTENT],
  ['lanes and monsters-only sickness', LANE_GLOBALS, LANE_CONTENT],
];

// ---- layer 1: the types -----------------------------------------------------------------------------------------

/** Every field of the view, listed once. Adding a field fails this file's compile until it is reviewed here. */
const COLLECTOR_VIEW_FIELDS: Record<keyof CollectorView, true> = {
  turn: true, round: true, mood: true, myLife: true, foeLife: true, appraisalRoundsLeft: true,
  hand: true, board: true, traps: true, vault: true, discard: true, deckCount: true,
  foeHandCount: true, foeDeckCount: true, foeDiscard: true, foeBoard: true, foeTrapSlots: true,
  choices: true, previewAttack: true, previewSummon: true, after: true, winningAttacks: true, winsAfter: true,
};

const PLAYER_VIEW_FIELDS: Record<keyof PlayerView, true> = {
  turn: true, round: true, mood: true, intent: true, myLife: true, foeLife: true,
  hand: true, board: true, traps: true, discard: true, deckCount: true,
  foeHandCount: true, foeDeckCount: true, foeBoard: true, foeTrapCount: true, foeDiscard: true, foeVault: true,
  pendingGraft: true, winner: true, appraisalTarget: true, legal: true, after: true, previewCombat: true, previewGraft: true, beats: true,
  lanes: true, sentinelReach: true, elementBonus: true,
};

describe('the view types', () => {
  it('list their fields explicitly', () => {
    expect(Object.keys(COLLECTOR_VIEW_FIELDS).length).toBe(23);
    expect(Object.keys(PLAYER_VIEW_FIELDS).length).toBe(28);
  });

  it('have no field for hidden information', () => {
    expectTypeOf<CollectorView>().not.toHaveProperty('foeHand');
    expectTypeOf<CollectorView>().not.toHaveProperty('foeDeck');
    expectTypeOf<CollectorView>().not.toHaveProperty('foeTraps');
    expectTypeOf<CollectorView>().not.toHaveProperty('deck');
    expectTypeOf<CollectorView>().not.toHaveProperty('state');
    expectTypeOf<PlayerView>().not.toHaveProperty('foeHand');
    expectTypeOf<PlayerView>().not.toHaveProperty('foeDeck');
    expectTypeOf<PlayerView>().not.toHaveProperty('foeTraps');
  });

  it('give hidden collections only as counts or occupancy', () => {
    expectTypeOf<CollectorView['foeHandCount']>().toEqualTypeOf<number>();
    expectTypeOf<CollectorView['foeDeckCount']>().toEqualTypeOf<number>();
    expectTypeOf<CollectorView['deckCount']>().toEqualTypeOf<number>();
    expectTypeOf<CollectorView['foeTrapSlots']>().toEqualTypeOf<readonly boolean[]>();
    expectTypeOf<PlayerView['foeTrapCount']>().toEqualTypeOf<number>();
  });

  it('describe a face-down monster by slot alone', () => {
    expectTypeOf<Extract<FoeMonster, { faceDown: true }>>().toEqualTypeOf<{ readonly faceDown: true; readonly slot: number }>();
  });
});

// ---- layer 2: equal views from states that differ only in hidden information -----------------------------------

const defsOf = (pred: (def: number) => boolean): number[] => CONTENT.ids.map((_, d) => d).filter(pred);
const PLAYER_MONSTERS = CONTENT.playerPool.monsters;
const PLAYER_TRAPS = defsOf((d) => CONTENT.playerPool.traps.includes(d));
const COLLECTOR_TRAPS = defsOf((d) => CONTENT.trap[d] !== null && CONTENT.pool[d] === 1);

interface Counts {
  faceDown: number;
  playerTraps: number;
  collectorTraps: number;
  states: number;
}

/**
 * Changes what `viewer` may not know. Collector: the player's hand, deck order, face-down and set-trap identities, and his
 * own deck order. Player: the Collector's hand, deck order and set-trap identities, and the player's own deck order.
 */
function perturb(s: GameState, rng: Sfc32, counts: Counts, viewer: 'collector' | 'player'): GameState {
  const spellsAndMonsters = [...CONTENT.playerPool.monsters, ...CONTENT.playerPool.spells, ...PLAYER_TRAPS];
  const swapSome = (a: readonly Iid[], b: readonly Iid[]): [Iid[], Iid[]] => {
    const x = [...a];
    const y = [...b];
    const k = Math.min(x.length, y.length, 2);
    for (let i = 0; i < k; i++) {
      const t = x[i] as Iid;
      x[i] = y[i] as Iid;
      y[i] = t;
    }
    return [x, y];
  };
  const [player, collector] = s.sides;
  const shuffled = (a: readonly Iid[]): Iid[] => {
    const c = [...a];
    rng.shuffle(c);
    return c;
  };
  const inst = [...s.inst];
  const other = (list: readonly number[], cur: number, span: number): number =>
    list[(list.indexOf(cur) + 1 + rng.int(span)) % list.length] as number;

  let p = { ...player, deck: shuffled(player.deck) };
  let c = { ...collector, deck: shuffled(collector.deck) };
  if (viewer === 'collector') {
    const [hand, deck] = swapSome(player.hand, p.deck);
    p = { ...p, hand, deck };
    // Different identities for hidden hand and deck cards, not only a different order.
    for (const iid of [...hand.slice(0, 2), ...deck.slice(0, 2)]) {
      const cur = inst[iid] as GameState['inst'][number];
      inst[iid] = { ...cur, def: other(spellsAndMonsters, cur.def, 7) };
    }
    for (const m of player.board) {
      if (m !== null && m.faceDown) {
        const cur = inst[m.iid] as GameState['inst'][number];
        inst[m.iid] = { ...cur, def: other(PLAYER_MONSTERS, cur.def, 5) };
        counts.faceDown++;
      }
    }
    for (const t of player.traps) {
      if (t !== null) {
        const cur = inst[t.iid] as GameState['inst'][number];
        inst[t.iid] = { ...cur, def: other(PLAYER_TRAPS, cur.def, 2) };
        counts.playerTraps++;
      }
    }
  } else {
    const [hand, deck] = swapSome(collector.hand, c.deck);
    c = { ...c, hand, deck };
    for (const t of collector.traps) {
      if (t !== null) {
        const cur = inst[t.iid] as GameState['inst'][number];
        inst[t.iid] = { ...cur, def: other(COLLECTOR_TRAPS, cur.def, 2) };
        counts.collectorTraps++;
      }
    }
  }
  return { ...s, sides: [p, c], inst };
}

/** Everything a view can say, as one string: its fields and the answers of every method for every argument. */
function snapshot(v: CollectorView): string {
  const out: unknown[] = [JSON.stringify(v)];
  for (let slot = 0; slot < v.board.length; slot++) {
    if (v.board[slot] === null) continue;
    out.push(v.previewAttack(slot, 'direct'));
    for (let f = 0; f < v.foeBoard.length; f++) out.push(v.previewAttack(slot, f));
  }
  for (const c of v.hand) {
    for (const lane of [undefined, ...v.foeBoard.keys()]) {
      const pv = v.previewSummon(c, lane);
      if (pv === null) continue;
      out.push(pv.power, pv.guard, pv.slow, pv.targets);
      for (let f = 0; f < v.foeBoard.length; f++) out.push(pv.asAttacker(f), pv.asDefender(f));
    }
  }
  out.push(v.winningAttacks().map((c) => c.index));
  // Look-ahead (D-209): every play's winsAfter, and the view after every choice (null when refused).
  for (const c of v.choices) {
    if (c.t === 'cast' || c.t === 'summon' || c.t === 'summonCovetous' || c.t === 'setTrap') out.push(v.winsAfter(c));
    const next = v.after(c);
    out.push(next === null ? null : JSON.stringify(next), next === null ? null : next.winningAttacks().map((w) => w.index));
  }
  return JSON.stringify(out);
}

describe('equal views from states that differ only in hidden information', () => {
  for (const [label, globals, content] of CONFIGS) {
    it(`Collector: views, decisions and intents agree over many duel states (${label})`, () => {
      const collector = createCollector({ content, globals });
      const engine = createEngine(content, globals, { intent: collector.intentPolicy });
      const counts: Counts = { faceDown: 0, playerTraps: 0, collectorTraps: 0, states: 0 };
      for (let i = 0; i < 40; i++) {
        const bot = i % 2 === 0 ? createNovice(`r${i}`) : createGreedy();
        const rng = Sfc32.from(`perturb/${i}`);
        let s = engine.newGame(SEED(i)).state;
        let n = 0;
        while (s.result === null && n++ < 400) {
          if ((s.turn & 1) === 1 && s.step !== 'mulligan') {
            const t = perturb(s, rng, counts, 'collector');
            expect(snapshot(collector.view(t))).toBe(snapshot(collector.view(s)));
            expect(collector.act(t)).toEqual(collector.act(s));
            counts.states++;
          }
          if (s.step !== 'mulligan') expect(collector.intentPolicy(perturb(s, rng, counts, 'collector'))).toBe(collector.intentPolicy(s));
          const a = (s.turn & 1) === 0 || s.step === 'mulligan' ? botAction(bot, collector.brain, s) : collector.act(s);
          s = engine.applyAction(s, a).state;
        }
      }
      // The perturbations really exercised hidden information.
      expect(counts.states).toBeGreaterThan(100);
      expect(counts.faceDown).toBeGreaterThan(0);
      expect(counts.playerTraps).toBeGreaterThan(0);
    });

    it(`Collector: look-aheads (previewSummon, winningAttacks, winsAfter, after, intent) agree under the perturbation (${label})`, () => {
      // Same walk as above, restricted to the look-ahead answers, with the perturbation applied to every Collector turn state
      // twice (two independent perturbations), so a leak through any hidden zone would show.
      const collector = createCollector({ content, globals });
      const engine = createEngine(content, globals, { intent: collector.intentPolicy });
      const counts: Counts = { faceDown: 0, playerTraps: 0, collectorTraps: 0, states: 0 };
      let summons = 0;
      for (let i = 0; i < 24; i++) {
        const bot = createGreedy();
        const rng = Sfc32.from(`perturb-la/${i}`);
        let s = engine.newGame(SEED(i + 100)).state;
        let n = 0;
        while (s.result === null && n++ < 400) {
          if ((s.turn & 1) === 1 && s.step !== 'mulligan') {
            const base = collector.view(s);
            for (let k = 0; k < 2; k++) {
              const v = collector.view(perturb(s, rng, counts, 'collector'));
              for (const c of base.hand) {
                for (const lane of [undefined, 0, 1, 2]) {
                  const a = base.previewSummon(c, lane);
                  const b = v.previewSummon(c, lane);
                  expect(b === null ? null : [b.power, b.guard, b.slow, b.targets]).toEqual(a === null ? null : [a.power, a.guard, a.slow, a.targets]);
                  if (a !== null) summons++;
                }
              }
              expect(v.winningAttacks().map((c) => c.index)).toEqual(base.winningAttacks().map((c) => c.index));
              expect(v.choices.map((c) => v.winsAfter(c))).toEqual(base.choices.map((c) => base.winsAfter(c)));
            }
            counts.states++;
          }
          if (s.step !== 'mulligan') {
            const intent = collector.intentPolicy(s);
            expect(collector.intentPolicy(perturb(s, rng, counts, 'collector'))).toBe(intent);
          }
          const a = (s.turn & 1) === 0 || s.step === 'mulligan' ? botAction(bot, collector.brain, s) : collector.act(s);
          s = engine.applyAction(s, a).state;
        }
      }
      expect(counts.states).toBeGreaterThan(50);
      expect(summons).toBeGreaterThan(20);
    });
  }

  it('player bots: the view and every look-ahead agree when only the Collector hidden information changes', () => {
    const collector = createCollector({ content: CONTENT, globals: GLOBALS });
    const engine = createEngine(CONTENT, GLOBALS, { intent: collector.intentPolicy });
    const counts: Counts = { faceDown: 0, playerTraps: 0, collectorTraps: 0, states: 0 };
    const view = (s: GameState): string => {
      const v = playerView(collector.brain, s);
      const ahead = v.legal.map((_, i) => {
        const w = v.after(i);
        return w === null ? null : JSON.stringify({ ...w, after: undefined });
      });
      return JSON.stringify([{ ...v, after: undefined }, ahead]);
    };
    for (let i = 0; i < 12; i++) {
      const bot = createNovice(`p${i}`);
      const rng = Sfc32.from(`perturb-p/${i}`);
      let s = engine.newGame(SEED(i)).state;
      let n = 0;
      while (s.result === null && n++ < 400) {
        if ((s.turn & 1) === 0 && s.step !== 'mulligan') {
          expect(view(perturb(s, rng, counts, 'player'))).toBe(view(s));
          counts.states++;
        }
        const a = (s.turn & 1) === 0 || s.step === 'mulligan' ? botAction(bot, collector.brain, s) : collector.act(s);
        s = engine.applyAction(s, a).state;
      }
    }
    expect(counts.states).toBeGreaterThan(20);
    expect(counts.collectorTraps).toBeGreaterThan(0);
  });
});
