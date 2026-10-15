// Whole seeded duels: the Collector against the novice and the greedy bot finish without error, every action is legal, and
// the same seed replays to the same state hash.
import { describe, expect, it } from 'vitest';
import { createEngine, hashState, toActions } from '@vault-duel/engine';
import { botAction, createCollector, createGreedy, createNovice } from '../src';
import { CONTENT, GLOBALS, playDuel, SEED } from './helpers';

describe('Collector versus novice', () => {
  it('finishes 150 duels, always with a result', () => {
    const reasons = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const r = playDuel({ seed: SEED(i), player: () => createNovice(`duel${i}`) });
      expect(r.state.result).not.toBeNull();
      reasons.add(r.state.result?.reason ?? '');
    }
    expect(reasons.size).toBeGreaterThan(0);
  });

  it('replays deterministically: same seed, same bot seed, same state hash', () => {
    for (let i = 0; i < 10; i++) {
      const a = playDuel({ seed: SEED(i), player: () => createNovice(`rep${i}`) });
      const b = playDuel({ seed: SEED(i), player: () => createNovice(`rep${i}`) });
      expect(b.hash).toBe(a.hash);
      expect(b.actions).toBe(a.actions);
    }
  });

  it('different seeds give different duels', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 10; i++) hashes.add(playDuel({ seed: SEED(i), player: () => createNovice('x') }).hash);
    expect(hashes.size).toBeGreaterThan(5);
  });

  it('the log replays to the same hash through the engine (replay guard)', () => {
    const collector = createCollector({ content: CONTENT, globals: GLOBALS });
    const engine = createEngine(CONTENT, GLOBALS, { intent: collector.intentPolicy });
    const r = playDuel({ seed: SEED(7), player: () => createNovice('log'), collector, engine });
    const again = engine.replay(SEED(7), toActions(r.state));
    expect(hashState(again)).toBe(r.hash);
  });
});

describe('Collector versus greedy', () => {
  it('finishes 80 duels', () => {
    for (let i = 0; i < 80; i++) expect(playDuel({ seed: SEED(i), player: () => createGreedy() }).state.result).not.toBeNull();
  });

  it('replays deterministically', () => {
    for (let i = 0; i < 5; i++) {
      expect(playDuel({ seed: SEED(i), player: () => createGreedy() }).hash).toBe(playDuel({ seed: SEED(i), player: () => createGreedy() }).hash);
    }
  });
});

describe('the Collector in whole duels', () => {
  it('only ever plays a legal action, and its mood always matches his life (D-080)', () => {
    const collector = createCollector({ content: CONTENT, globals: GLOBALS });
    const engine = createEngine(CONTENT, GLOBALS, { intent: collector.intentPolicy });
    let decisions = 0;
    for (let i = 0; i < 60; i++) {
      const bot = createNovice(`legal${i}`);
      let s = engine.newGame(SEED(i)).state;
      let n = 0;
      while (s.result === null && n++ < 1000) {
        if ((s.turn & 1) === 1 && s.step !== 'mulligan') {
          const a = collector.act(s);
          expect(engine.isLegal(s, a)).toBe(true);
          const life = s.sides[1].life;
          const want = life > GLOBALS.MOOD_AGITATED_AT ? 0 : life > GLOBALS.MOOD_DESPERATE_AT ? 1 : 2;
          expect(collector.view(s).mood).toBe(want);
          decisions++;
          s = engine.applyAction(s, a).state;
        } else s = engine.applyAction(s, botAction(bot, collector.brain, s)).state;
      }
    }
    expect(decisions).toBeGreaterThan(500);
  });

  it('turns are bounded: no turn takes more than 20 actions', () => {
    const collector = createCollector({ content: CONTENT, globals: GLOBALS });
    const engine = createEngine(CONTENT, GLOBALS, { intent: collector.intentPolicy });
    let longest = 0;
    for (let i = 0; i < 40; i++) {
      const bot = createGreedy();
      let s = engine.newGame(SEED(i)).state;
      let run = 0;
      while (s.result === null) {
        const mine = (s.turn & 1) === 1 && s.step !== 'mulligan';
        const a = mine ? collector.act(s) : botAction(bot, collector.brain, s);
        run = mine ? run + 1 : 0;
        longest = Math.max(longest, run);
        s = engine.applyAction(s, a).state;
      }
    }
    expect(longest).toBeLessThanOrEqual(20);
  });
});
