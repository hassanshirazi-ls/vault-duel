// Naive bot (M-09, D-367): scripted, deterministic, legal, and it reads only the player's view.
import { describe, expect, it } from 'vitest';
import { botAction, botContext, createNaive, NAIVE_GRAFT_MIN_POWER, playerView } from '../src';
import type { Bot } from '../src';
import { CONTENT, GLOBALS as LIVE_GLOBALS, playDuel, SEED } from './helpers';
import { createWorld, mon, Scene } from './world';
import type { World } from './world';
import type { Scene as SceneT } from './world';
import { createEngine } from '@vault-duel/engine';
import type { Action } from '@vault-duel/engine';
import { createCollector } from '../src';

const world = createWorld([
  mon('p-brute', 'P', 7, 3, 'void'),
  mon('p-mid', 'P', 5, 3, 'void'),
  mon('p-small', 'P', 3, 3, 'void'),
  mon('p-weak', 'P', 2, 2, 'void'),
  mon('p-weak2', 'P', 2, 2, 'void'),
  mon('c-four', 'C', 4, 6, 'void'),
  mon('c-seven', 'C', 7, 3, 'void'),
  mon('c-three', 'C', 3, 3, 'void'),
]);
const scene = (): SceneT => new Scene(world, 4);
const act = (sc: SceneT): string => {
  const s = sc.state();
  return sc.fmt(s, botAction(createNaive(), world.collector.brain, s));
};

describe('naive (M-09)', () => {
  it('keeps its opening hand', () => {
    const bot = createNaive();
    expect(bot({ legal: [{ t: 'redraw' }, { t: 'keep' }], view: () => { throw new Error('unused'); } })).toBe(1);
  });

  it('summons its highest-Power monster face-up in attack', () => {
    expect(act(scene().hand(0, 'p-small', 'p-brute', 'p-mid'))).toMatch(/^summon p-brute atk/);
  });

  it('ends the turn with nothing to do', () => {
    expect(act(scene())).toBe('end');
  });

  describe('attack rule', () => {
    it('attacks an empty board directly', () => {
      expect(act(scene().board(0, 0, 'p-small'))).toBe('attack p-small > face');
    });
    it('attacks a monster in attack position when its Power is at least the displayed Power', () => {
      expect(act(scene().board(0, 0, 'p-mid').board(1, 0, 'c-four'))).toBe('attack p-mid > c-four');
      expect(act(scene().board(0, 0, 'p-small').board(1, 0, 'c-three'))).toBe('attack p-small > c-three'); // equal
    });
    it('does not attack a monster whose displayed Power is higher', () => {
      expect(act(scene().board(0, 0, 'p-mid').board(1, 0, 'c-seven'))).toBe('end');
    });
    it('reads the Guard of a monster in guard position', () => {
      expect(act(scene().board(0, 0, 'p-mid').board(1, 0, 'c-four', { pos: 1 }))).toBe('end'); // Guard 6 > Power 5
      expect(act(scene().board(0, 0, 'p-brute').board(1, 0, 'c-four', { pos: 1 }))).toBe('attack p-brute > c-four');
    });
    it('never attacks a face-down monster', () => {
      expect(act(scene().board(0, 0, 'p-brute').board(1, 0, 'c-three', { faceDown: true }))).toBe('end');
    });
  });

  describe('graft threshold (live content)', () => {
    const collector = createCollector({ content: CONTENT, globals: LIVE_GLOBALS });
    const live: World = { content: CONTENT, globals: LIVE_GLOBALS, collector };
    const ids = CONTENT.playerPool.monsters.map((d) => CONTENT.ids[d] as string);
    const engine = createEngine(CONTENT, LIVE_GLOBALS, { intent: collector.intentPolicy });
    const sceneOf = (a: string, b: string): SceneT => new Scene(live, 4).board(0, 0, a).board(0, 1, b);

    /** Walks the bot through a started Graft and returns the Power it would commit at, or null if it never commits. */
    const walk = (sc: SceneT): { power: number; picks: string[] } | null => {
      let s = sc.state();
      const bot = createNaive();
      const picks: string[] = [];
      for (let i = 0; i < 10; i++) {
        const ctx = botContext(collector.brain, s);
        const a = ctx.legal[bot(ctx)] as Action;
        if (a.t === 'graftPosition' || a.t === 'graftCancel') return { power: collector.brain.engine.previewGraft(s)?.power ?? -1, picks };
        if (a.t === 'graftPick') picks.push(sc.name(s, a.m));
        if (a.t === 'endTurn') return null;
        s = engine.applyAction(s, a).state;
      }
      return null;
    };

    it('begins a Graft exactly when its completion reaches the threshold, and then commits it', () => {
      let paid = 0;
      let declined = 0;
      for (const a of ids) {
        for (const b of ids) {
          if (a >= b) continue;
          const sc = sceneOf(a, b);
          const s = sc.state();
          if (!engine.getLegalActions(s).some((x) => x.t === 'graftBegin')) continue;
          const chose = sc.fmt(s, botAction(createNaive(), collector.brain, s)) === 'graftBegin';
          // Replay the bot from a begun Graft; its commit Power decides what the top-level choice should have been
          const begun = engine.applyAction(s, { t: 'graftBegin' }).state;
          const sc2 = Object.create(sc, { state: { value: () => begun } }) as SceneT;
          const done = walk(sc2);
          if (chose) {
            paid++;
            expect(done?.power ?? -1).toBeGreaterThanOrEqual(NAIVE_GRAFT_MIN_POWER);
          } else if (done !== null && done.power < NAIVE_GRAFT_MIN_POWER) {
            declined++;
          }
        }
      }
      expect(paid).toBeGreaterThan(0);
      expect(declined).toBeGreaterThan(0);
    });

    it('picks its highest-Power materials first', () => {
      const [a, b, c] = [...ids].sort((x, y) => (CONTENT.power[CONTENT.index.get(y) as number] as number) - (CONTENT.power[CONTENT.index.get(x) as number] as number)).slice(0, 3) as [string, string, string];
      const sc = new Scene(live, 4).board(0, 0, c).board(0, 1, b).board(0, 2, a);
      const s = engine.applyAction(sc.state(), { t: 'graftBegin' }).state;
      const first = botAction(createNaive(), collector.brain, s);
      expect(first.t).toBe('graftPick');
      if (first.t === 'graftPick') {
        const p = (iid: number): number => CONTENT.power[(s.inst[iid] as { def: number }).def] as number;
        const legalPicks = engine.getLegalActions(s).filter((x) => x.t === 'graftPick');
        expect(p(first.m)).toBe(Math.max(...legalPicks.map((x) => (x.t === 'graftPick' ? p(x.m) : -1))));
      }
    });
  });

  it('picks only legal actions and is deterministic, in whole duels', () => {
    const run = (i: number): string => playDuel({ seed: SEED(i), player: () => createNaive() }).hash;
    for (let i = 0; i < 40; i++) expect(run(i)).toBe(run(i));
  });

  it('works on a view alone: the same view gives the same choice', () => {
    const collector = createCollector({ content: CONTENT, globals: LIVE_GLOBALS });
    const engine = createEngine(CONTENT, LIVE_GLOBALS, { intent: collector.intentPolicy });
    const s = engine.newGame(SEED(2)).state;
    const bot: Bot = createNaive();
    expect(bot(botContext(collector.brain, s))).toBe(bot({ legal: engine.getLegalActions(s), view: () => playerView(collector.brain, s) }));
  });
});
