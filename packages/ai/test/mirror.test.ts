// The mirror (src/shared/mirror.ts) must agree with the engine's own combat pipeline. For every legal attack at every state
// of many seeded duels, the preview is compared with what the engine does when it applies the attack: the same Power and
// compared stat, element advantage, Pierce and Brittle flags, destroyed set, and damage.
import { describe, expect, it } from 'vitest';
import { createEngine } from '@vault-duel/engine';
import type { CompiledContent, GameEvent, GameState, Globals } from '@vault-duel/engine';
import { createCollector, createGreedy, createNovice, botAction } from '../src';
import { scrub } from '../src/shared/brain';
import { Mirror } from '../src/shared/mirror';
import { CONTENT, GLOBALS, SEED } from './helpers';

function checkState(content: CompiledContent, globals: Globals, mirror: Mirror, probe: ReturnType<typeof createEngine>, s: GameState): number {
  if (s.result !== null || s.step === 'mulligan' || s.pending !== null) return 0;
  const side = (s.turn & 1) as 0 | 1;
  const scrubbed = scrub(s, side);
  // His own traps would heal or draw and blur the life comparison, so the probe has none.
  const mine = scrubbed.sides[side];
  const own = { ...mine, traps: mine.traps.map(() => null) };
  const safe: GameState = { ...scrubbed, sides: side === 0 ? [own, scrubbed.sides[1]] : [scrubbed.sides[0], own] };
  let checked = 0;
  for (const a of probe.getLegalActions(safe)) {
    if (a.t !== 'attack') continue;
    const target = a.target >= 0 ? mirror.monster(safe, a.target) : null;
    if (a.target >= 0 && (target === null || target.faceDown)) continue; // unknown outcome: no preview
    const pre = mirror.preview(safe, a.a, a.target);
    const { state, events } = probe.applyAction(safe, a);
    if (a.target < 0) {
      const dmg = events.find((e): e is Extract<GameEvent, { e: 'Damage' }> => e.e === 'Damage');
      expect(dmg?.amount ?? 0, `direct power of ${a.a}`).toBe(pre.dmgToDefender);
    } else {
      const res = events.find((e): e is Extract<GameEvent, { e: 'CombatResolved' }> => e.e === 'CombatResolved');
      expect(res, 'combat resolved').toBeDefined();
      if (res === undefined) continue;
      expect(res.aP).toBe(pre.aP);
      expect(res.dStat).toBe(pre.dStat);
      expect(res.advantage).toBe(pre.advantage);
      expect(res.pierce).toBe(pre.pierce);
      expect(res.brittle).toBe(pre.brittle);
      // Destruction before Ward: the engine's list is what the table says; Ward removes entries at destroyBatch time.
      const wantDestroyed = [pre.destroyAttacker ? a.a : -1, pre.destroyDefender ? a.target : -1].filter((x) => x >= 0).sort();
      expect([...res.destroyed].sort()).toEqual(wantDestroyed);
      // Damage to each controller.
      const lost = (who: 0 | 1): number => safe.sides[who].life - state.sides[who].life;
      const defSide = (1 - side) as 0 | 1;
      if (state.result === null) {
        expect(lost(side)).toBe(pre.dmgToAttacker);
        expect(lost(defSide)).toBe(pre.dmgToDefender);
      }
    }
    checked++;
  }
  void content;
  void globals;
  return checked;
}

function sweep(content: CompiledContent, globals: Globals, twist: number, seeds: number): number {
  const collector = createCollector({ content, globals });
  const real = createEngine(content, globals, { intent: collector.intentPolicy });
  const probe = createEngine(content, globals, { intent: () => 'guard' }, { events: true, log: false, trusted: true });
  const mirror = new Mirror(content, globals);
  let checked = 0;
  for (let i = 0; i < seeds; i++) {
    const bot = i % 2 === 0 ? createNovice(`m${i}`) : createGreedy();
    let s = real.newGame(SEED(i), twist >= 0 ? { twist } : {}).state;
    let n = 0;
    while (s.result === null && n++ < 400) {
      checked += checkState(content, globals, mirror, probe, s);
      const a = (s.turn & 1) === 0 || s.step === 'mulligan' ? botAction(bot, collector.brain, s) : collector.act(s);
      s = real.applyAction(s, a).state;
    }
  }
  return checked;
}

describe('mirror versus the engine', () => {
  it('agrees on every attack of 60 duels', () => {
    expect(sweep(CONTENT, GLOBALS, -1, 60)).toBeGreaterThan(100);
  });

  it('agrees under a weekly twist that changes Power by element and by Power', () => {
    const content: CompiledContent = {
      ...CONTENT,
      twists: [
        {
          id: 'test-twist',
          text: 'test',
          modifiers: [
            { where: { element: 'umbra' }, power: 1 },
            { where: { all: [{ faceUp: true }, { powerLte: 4 }] }, guard: 2 },
            { where: { keyword: 'ward' }, power: -1 },
          ],
        },
      ],
    };
    const globals: Globals = { ...GLOBALS, FLAGS: { ...GLOBALS.FLAGS, WEEKLY_TWIST: true } };
    expect(sweep(content, globals, 0, 40)).toBeGreaterThan(50);
  });
});
