// The expert bot (ARCHITECTURE.md §14): legal and deterministic through whole duels, blind to the Collector's hidden hand,
// and bounded in how many plans it enumerates. No test pins a weight or an outcome rate.
import { describe, expect, it } from 'vitest';
import { createEngine } from '@vault-duel/engine';
import type { Action, GameState } from '@vault-duel/engine';
import { botAction, botContext, createCollector, createExpert, createNoise, EXPERT_WEIGHTS } from '../src';
import { CONTENT, GLOBALS, playDuel, SEED } from './helpers';

describe('expert', () => {
  it('plays only legal actions through whole duels, Grafts included, and the same seed gives the same duel', () => {
    for (let i = 0; i < 12; i++) {
      const a = playDuel({ seed: SEED(i), player: () => createExpert() });
      expect(a.state.result).not.toBeNull();
      expect(playDuel({ seed: SEED(i), player: () => createExpert() }).hash).toBe(a.hash);
    }
  });

  it('with noise: the same noise key replays the same duel, and noise changes some duels', () => {
    const run = (i: number, key: string, eps: number): string =>
      playDuel({ seed: SEED(i), player: () => createExpert({ noise: createNoise(key, eps) }) }).hash;
    const plain: string[] = [];
    let differing = 0;
    for (let i = 0; i < 10; i++) {
      expect(run(i, `k${i}`, 0.3)).toBe(run(i, `k${i}`, 0.3));
      plain.push(run(i, 'x', 0));
      if (run(i, `k${i}`, 0.3) !== plain[i]) differing++;
    }
    expect(differing).toBeGreaterThan(0);
  });

  it('keeps its plans within its bound, and a smaller bound is honoured', () => {
    const small = 5;
    const big = createExpert();
    const tiny = createExpert({ weights: { ...EXPERT_WEIGHTS, maxPlans: small } });
    for (let i = 0; i < 15; i++) {
      playDuel({ seed: SEED(i), player: () => big });
      playDuel({ seed: SEED(i), player: () => tiny });
    }
    expect(big.stats.planned).toBeGreaterThan(0);
    expect(big.stats.maxPlans).toBeGreaterThan(1);
    expect(big.stats.maxPlans).toBeLessThanOrEqual(EXPERT_WEIGHTS.maxPlans);
    expect(tiny.stats.maxPlans).toBeLessThanOrEqual(small);
  });

  it('never reads the Collector hand: states differing only in it give the same turn', () => {
    const collector = createCollector({ content: CONTENT, globals: GLOBALS });
    const engine = createEngine(CONTENT, GLOBALS, { intent: collector.intentPolicy });
    let checked = 0;
    for (let seed = 0; seed < 6; seed++) {
      // Advance a real duel to a mid-game player turn.
      const warm = createExpert();
      let s: GameState = engine.newGame(SEED(seed)).state;
      while (s.result === null && s.turn < 6) {
        const mine = (s.turn & 1) === 0 || s.step === 'mulligan';
        s = engine.applyAction(s, mine ? botAction(warm, collector.brain, s) : collector.act(s)).state;
      }
      if (s.result !== null || (s.turn & 1) !== 0) continue;
      // The same position with his hand and the top of his deck exchanged: only hidden zones differ.
      const foe = s.sides[1];
      const take = Math.min(foe.hand.length, foe.deck.length);
      if (take === 0) continue;
      const other: GameState = {
        ...s,
        sides: [s.sides[0], { ...foe, hand: [...foe.deck.slice(0, take), ...foe.hand.slice(take)], deck: [...foe.hand.slice(0, take), ...foe.deck.slice(take)] }],
      };
      expect(other.sides[1].hand).not.toEqual(foe.hand);
      const turnOf = (start: GameState): Action[] => {
        const bot = createExpert();
        const out: Action[] = [];
        let st = start;
        while (st.result === null && (st.turn & 1) === 0) {
          const a = botAction(bot, collector.brain, st);
          out.push(a);
          st = engine.applyAction(st, a).state;
        }
        return out;
      };
      const a = turnOf(s);
      expect(a.length).toBeGreaterThan(0);
      expect(turnOf(other)).toEqual(a);
      // One decision from the first call is identical too.
      expect(createExpert()(botContext(collector.brain, s))).toBe(createExpert()(botContext(collector.brain, other)));
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps its opening hand', () => {
    const ctx = { legal: [{ t: 'keep' }, { t: 'redraw' }] as const, view: () => { throw new Error('unused'); } };
    expect(createExpert()({ legal: ctx.legal, view: ctx.view })).toBe(0);
  });
});
