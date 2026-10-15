// Intent (D-095, D-096, D-150): appraise > attack > scheme > guard, a forecast from the Collector's own view, injected
// into the engine, computed once at the start of each player turn.
import { describe, expect, it } from 'vitest';
import { createEngine } from '@vault-duel/engine';
import type { Intent } from '@vault-duel/engine';
import { createNovice } from '../src';
import { CONTENT, playDuel, SEED } from './helpers';
import { createWorld, mon, Scene } from './world';
import type { Scene as SceneT } from './world';

const world = createWorld([
  mon('c-brute', 'C', 7, 3, 'fire'),
  mon('c-weak', 'C', 2, 2, 'void'),
  mon('c-vain', 'C', 6, 3, 'void', ['vain']),
  mon('p-small', 'P', 3, 3, 'void'),
  mon('p-six', 'P', 6, 3, 'void'),
  mon('p-seven', 'P', 7, 3, 'void'),
  mon('p-hidden', 'P', 3, 3, 'void'),
]);

/** A player-turn scene: turn 4 is round 3 (an Appraisal round), turn 2 is round 2. */
const scene = (turn = 4): SceneT => new Scene(world, turn);
const intent = (sc: SceneT): Intent => world.collector.intentPolicy(sc.state());

describe('categories and priority (D-095)', () => {
  it('appraise: his next turn is an Appraisal round and the opponent has a target', () => {
    expect(intent(scene().board(0, 0, 'p-seven'))).toBe('appraise');
  });

  it('appraise outranks attack', () => {
    expect(intent(scene().board(0, 0, 'p-seven').board(1, 0, 'c-brute'))).toBe('appraise');
  });

  it('no appraise outside an Appraisal round', () => {
    expect(intent(scene(2).board(0, 0, 'p-seven'))).not.toBe('appraise');
  });

  it('no appraise when nothing is eligible: too weak, face-down, or Shrouded', () => {
    expect(intent(scene().board(0, 0, 'p-six'))).not.toBe('appraise');
    expect(intent(scene().board(0, 0, 'p-seven', { faceDown: true }))).not.toBe('appraise');
    // Shroud until turn 6 still covers his turn 5 ...
    expect(intent(scene().board(0, 0, 'p-seven', { shroudUntil: 6 }))).not.toBe('appraise');
    // ... but not one that has ended.
    expect(intent(scene().board(0, 0, 'p-seven', { shroudUntil: 5 }))).toBe('appraise');
  });

  it('attack: his attack rules would make an attack on the board as it is', () => {
    expect(intent(scene(2).board(1, 0, 'c-brute').board(0, 0, 'p-small'))).toBe('attack');
  });

  it('attack counts the reposition he would make first', () => {
    expect(intent(scene(2).board(1, 0, 'c-brute', { pos: 1 }).board(0, 0, 'p-small'))).toBe('attack');
  });

  it('attack counts a forced Vain attack', () => {
    expect(intent(scene(2).board(1, 0, 'c-vain').board(0, 0, 'p-six'))).toBe('attack');
  });

  it('scheme: his play rules would set a trap', () => {
    expect(intent(scene(2).hand(1, 'c-case').board(0, 0, 'p-small'))).toBe('scheme');
  });

  it('scheme: his play rules would cast a spell', () => {
    expect(intent(scene(2).hand(1, 'c-forfeit').board(0, 0, 'p-small'))).toBe('scheme');
  });

  it('guard: the plan is only to summon or hold', () => {
    expect(intent(scene(2).hand(1, 'c-weak').board(0, 0, 'p-six'))).toBe('guard');
    expect(intent(scene(2))).toBe('guard');
  });

  it('attack outranks scheme', () => {
    expect(intent(scene(2).board(1, 0, 'c-brute').hand(1, 'c-case').board(0, 0, 'p-small'))).toBe('attack');
  });

  it('follows the mood: a face-down attack is a Desperate/Agitated plan, not a Composed one', () => {
    const mk = (m: 0 | 1): SceneT => scene(2).board(1, 0, 'c-brute').board(0, 0, 'p-hidden', { faceDown: true }).mood(m);
    expect(intent(mk(0))).toBe('guard');
    expect(intent(mk(1))).toBe('attack');
  });
});

describe('the policy is pure and builds its own view (D-150)', () => {
  it('does not change the state it is given, and answers the same twice', () => {
    const s = scene().board(0, 0, 'p-seven').board(1, 0, 'c-brute').state();
    const before = JSON.stringify(s);
    const a = world.collector.intentPolicy(s);
    const b = world.collector.intentPolicy(s);
    expect(a).toBe(b);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('is not changed by what the Collector cannot know: the opponent hand and deck order', () => {
    const base = scene(2).hand(1, 'c-case').board(0, 0, 'p-small');
    const a = base.state();
    const b = { ...a, sides: [{ ...a.sides[0], hand: [...a.sides[0].hand].reverse(), deck: [...a.sides[0].deck].reverse() }, a.sides[1]] as typeof a.sides };
    expect(world.collector.intentPolicy(b)).toBe(world.collector.intentPolicy(a));
  });
});

describe('inside the engine (D-096)', () => {
  it('createEngine refuses to run with intents on and no policy', () => {
    expect(() => createEngine(CONTENT, world.globals)).toThrow();
  });

  it('is stored at the start of each player turn, frozen through the turn, and replays', () => {
    const run = (): { hash: string; stored: Intent[] } => {
      const stored: Intent[] = [];
      let current: Intent | null = null;
      const r = playDuel({
        seed: SEED(5),
        player: () => createNovice('intent-test'),
        onEvents: (events, _before, after) => {
          for (const ev of events) {
            if (ev.e === 'IntentSet') {
              stored.push(ev.intent);
              current = ev.intent;
            }
          }
          // the stored intent is the last one set, through the player's turn and the Collector's
          if (after.result === null && after.step !== 'mulligan') expect(after.collector.intent).toBe(current);
        },
      });
      return { hash: r.hash, stored };
    };
    const a = run();
    const b = run();
    expect(a.stored.length).toBeGreaterThan(2);
    expect(a).toEqual(b);
  });
});
