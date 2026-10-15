// Player bots (D-116, D-117): novice and greedy.
import { describe, expect, it } from 'vitest';
import { botAction, botContext, createGreedy, createNovice, evaluate, playerView } from '../src';
import type { Bot, BotContext } from '../src';
import { createEngine } from '@vault-duel/engine';
import { createCollector } from '../src';
import { CONTENT, GLOBALS as LIVE_GLOBALS, playDuel, SEED } from './helpers';
import { createWorld, mon, Scene } from './world';
import type { Scene as SceneT } from './world';

const fakeCtx = (n: number): BotContext => ({
  legal: Array.from({ length: n }, () => ({ t: 'endTurn' as const })),
  view: () => {
    throw new Error('the novice must not need a view');
  },
});

describe('novice (D-117)', () => {
  it('chooses uniformly among the legal actions', () => {
    const bot = createNovice('uniform-test');
    const hits = [0, 0, 0, 0, 0];
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const k = bot(fakeCtx(5));
      hits[k] = (hits[k] ?? 0) + 1;
    }
    for (const h of hits) expect(Math.abs(h / N - 0.2)).toBeLessThan(0.02);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const draw = (seed: string): number[] => {
      const bot = createNovice(seed);
      return Array.from({ length: 40 }, () => bot(fakeCtx(1000)));
    };
    expect(draw('a')).toEqual(draw('a'));
    expect(draw('a')).not.toEqual(draw('b'));
  });

  it('always returns an index of the legal list, including a list of one', () => {
    const bot = createNovice('range');
    for (let n = 1; n < 30; n++) for (let i = 0; i < 20; i++) expect(bot(fakeCtx(n))).toBeLessThan(n);
  });

  it('plays only legal actions through whole duels, Graft steps included', () => {
    const grafting = { begin: 0, pick: 0, position: 0 };
    for (let i = 0; i < 60; i++) {
      playDuel({
        seed: SEED(i),
        player: () => {
          const bot = createNovice(`legal${i}`);
          return (ctx) => {
            const k = bot(ctx);
            const a = ctx.legal[k];
            if (a?.t === 'graftBegin') grafting.begin++;
            if (a?.t === 'graftPick') grafting.pick++;
            if (a?.t === 'graftPosition') grafting.position++;
            return k;
          };
        },
      }); // playDuel applies every action through the engine, which rejects an illegal one
    }
    expect(grafting.begin).toBeGreaterThan(0);
    expect(grafting.pick).toBeGreaterThan(0);
  });
});

const world = createWorld([
  mon('p-brute', 'P', 7, 3, 'fire'),
  mon('p-small', 'P', 3, 3, 'void'),
  mon('p-weak', 'P', 2, 2, 'void'),
  mon('c-mid', 'C', 5, 4, 'void'),
  mon('c-seven', 'C', 7, 3, 'void'),
  mon('c-three', 'C', 3, 3, 'void'),
]);
/** A player-turn scene (turn 4 = round 3, attacks allowed). */
const scene = (): SceneT => new Scene(world, 4);
const greedyAction = (sc: SceneT): string => {
  const s = sc.state();
  return sc.fmt(s, botAction(createGreedy(), world.collector.brain, s));
};

describe('greedy (D-116)', () => {
  it('deals damage: a direct attack on an empty board', () => {
    expect(greedyAction(scene().board(0, 0, 'p-brute'))).toBe('attack p-brute > face');
  });

  it('prefers destroying a monster to ending the turn', () => {
    expect(greedyAction(scene().board(0, 0, 'p-brute').board(1, 0, 'c-mid'))).toBe('attack p-brute > c-mid');
  });

  it('declines an attack that loses its monster for nothing', () => {
    expect(greedyAction(scene().board(0, 0, 'p-weak').board(1, 0, 'c-seven'))).toBe('end');
  });

  it('adds to the board rather than ending the turn', () => {
    expect(greedyAction(scene().hand(0, 'p-small'))).toMatch(/^summon p-small (atk|grd)$/);
  });

  it('chooses the more valuable of two kills when no damage separates them', () => {
    // Both targets are in guard position, so a kill deals no damage to life; the 5/4 monster is worth more than the 3/3.
    const sc = scene().board(0, 0, 'p-brute').board(1, 0, 'c-three', { pos: 1 }).board(1, 1, 'c-mid', { pos: 1 });
    expect(greedyAction(sc)).toBe('attack p-brute > c-mid');
  });

  it('keeps its opening hand', () => {
    const ctx: BotContext = { legal: [{ t: 'keep' }, { t: 'redraw' }], view: () => { throw new Error('unused'); } };
    expect(createGreedy()(ctx)).toBe(0);
  });

  it('is deterministic', () => {
    const run = (): string => playDuel({ seed: SEED(3), player: () => createGreedy() }).hash;
    expect(run()).toBe(run());
  });

  it('plays only legal actions through whole duels, Grafts included', () => {
    for (let i = 0; i < 30; i++) playDuel({ seed: SEED(i), player: () => createGreedy() });
  });

  it('works on a view alone: the same view gives the same choice', () => {
    const collector = createCollector({ content: CONTENT, globals: LIVE_GLOBALS });
    const engine = createEngine(CONTENT, LIVE_GLOBALS, { intent: collector.intentPolicy });
    const s = engine.newGame(SEED(2)).state;
    const bot: Bot = createGreedy();
    const a = bot(botContext(collector.brain, s));
    const b = bot({ legal: engine.getLegalActions(s), view: () => playerView(collector.brain, s) });
    expect(a).toBe(b);
  });
});

describe('evaluate', () => {
  const view = (sc: SceneT) => playerView(world.collector.brain, sc.state());

  it('rewards life, damage dealt, and board; penalises the opponent board', () => {
    const base = evaluate(view(scene()));
    expect(evaluate(view(scene().life(0, 25)))).toBeGreaterThan(base);
    expect(evaluate(view(scene().life(1, 10)))).toBeGreaterThan(base);
    expect(evaluate(view(scene().board(0, 0, 'p-small')))).toBeGreaterThan(base);
    expect(evaluate(view(scene().board(1, 0, 'c-mid')))).toBeLessThan(base);
  });

  it('a stronger monster is worth more than a weaker one', () => {
    expect(evaluate(view(scene().board(0, 0, 'p-brute')))).toBeGreaterThan(evaluate(view(scene().board(0, 0, 'p-weak'))));
  });

  it('a finished duel is worth more than any position', () => {
    const win = { ...view(scene()), winner: 0 as const };
    const loss = { ...view(scene()), winner: 1 as const };
    expect(evaluate(win)).toBeGreaterThan(evaluate(view(scene().board(0, 0, 'p-brute').life(1, 1))));
    expect(evaluate(loss)).toBeLessThan(evaluate(view(scene().life(0, 1))));
  });
});
