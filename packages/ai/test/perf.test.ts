// Performance smoke (ARCHITECTURE.md §18): novice versus the Collector, trusted engine without events or log, as the
// simulator will run it. The hard gate is the sim's (>= 1,000 duels/sec/core on an idle machine); this only fails on a
// large regression, and prints the measured rate.
/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { createEngine } from '@vault-duel/engine';
import { botAction, createCollector, createNovice } from '../src';
import { CONTENT, GLOBALS, SEED } from './helpers';

describe('duel throughput', () => {
  it('novice versus Collector runs at a useful rate', () => {
    const collector = createCollector({ content: CONTENT, globals: GLOBALS });
    const engine = createEngine(CONTENT, GLOBALS, { intent: collector.intentPolicy }, { events: false, log: false, trusted: true });
    const run = (i: number): void => {
      const bot = createNovice(`perf${i}`);
      let s = engine.newGame(SEED(i)).state;
      while (s.result === null) {
        const mine = (s.turn & 1) === 1 && s.step !== 'mulligan';
        s = engine.applyAction(s, mine ? collector.act(s) : botAction(bot, collector.brain, s)).state;
      }
    };
    for (let i = 0; i < 50; i++) run(i); // warm up
    const N = 600;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) run(i);
    const rate = (N / (performance.now() - t0)) * 1000;
    console.info(`novice vs Collector: ${rate.toFixed(0)} duels/sec/core`);
    expect(rate).toBeGreaterThan(300);
  });
});
