// Riposte (D-337) and Ambush (D-338) in the AI: the Collector, greedy and the expert count a Riposte loss, never peek at a
// face-down Guard, and use the Ambush flip when it wins a fight.
import { describe, expect, it } from 'vitest';
import { botAction, createExpert, createGreedy } from '../src';
import { withGlobals } from '@vault-duel/engine/test-utils/globals';
import { attackRule, createWorld, mon, Scene, withAi } from './world';
import type { Scene as SceneT } from './world';
import { CONTENT } from './helpers';

const GLOBALS = withGlobals({
  CONTENT_NUMBERS: { T_GILT_POWER: 2, T_FORFEIT_MAX: 4, AI_FACEDOWN_ATTACK_MIN_POWER: 7 },
  FLAGS: { RIPOSTE: true, AMBUSH: true },
});
const FACE_DOWN_AI = withAi((a) => {
  a['allowFaceDown'] = true;
  a['moods'] = { ...(a['moods'] as object), composed: { ...((a['moods'] as Record<string, object>)['composed'] as object), params: { setTrapWhenBehind: { compare: 'fewerOrEqual' }, summonFallback: { position: 'guardUnlessBeater' } } } };
});
const world = createWorld([
  mon('c-five', 'C', 5, 3, 'void'),
  mon('c-six', 'C', 6, 3, 'void'),
  mon('c-seven', 'C', 7, 3, 'void'),
  mon('c-vain', 'C', 4, 3, 'void', ['vain']),
  mon('p-six', 'P', 6, 3, 'void'),
  mon('p-wall', 'P', 1, 7, 'void'),
  mon('p-wall5', 'P', 1, 5, 'void'),
  mon('p-hidden', 'P', 3, 3, 'void'),
  mon('p-five', 'P', 5, 3, 'void'),
  mon('p-two', 'P', 2, 2, 'void'),
  mon('p-brute', 'P', 7, 3, 'void'),
], FACE_DOWN_AI, GLOBALS);
const colScene = (): SceneT => new Scene(world); // Collector to move
const playerScene = (): SceneT => new Scene(world, 4); // player to move (round 3)

describe('the Collector and Riposte', () => {
  it('does not attack into a guard it cannot beat, and never counts it as a clean kill', () => {
    const sc = colScene().board(1, 0, 'c-six').board(0, 0, 'p-wall', { pos: 1 });
    expect(attackRule(sc, 'killWithoutLoss')).toEqual([]);
    expect(sc.decide()).toBe('end');
  });

  it('a forced Vain attack into a guard prefers the target that does not Riposte it', () => {
    const sc = colScene().board(1, 0, 'c-vain').board(0, 0, 'p-wall', { pos: 1 }).board(0, 1, 'p-wall5', { pos: 1 });
    // 4 Power loses to Guard 7 and to Guard 5 alike; the cheaper life cost (5 - 4) comes first
    expect(attackRule(sc, 'holdExceptVain')).toEqual(['attack c-vain > p-wall5']);
  });

  it('attacks a face-down monster only with 7 Power: the one Power no base card Ripostes', () => {
    expect(attackRule(colScene().board(1, 0, 'c-six').board(0, 0, 'p-hidden', { faceDown: true }), 'faceDownIfStrong')).toEqual([]);
    expect(attackRule(colScene().board(1, 0, 'c-seven').board(0, 0, 'p-hidden', { faceDown: true }), 'faceDownIfStrong')).toEqual([
      'attack c-seven > p-hidden',
    ]);
  });

  it('Desperate still attacks a face-down monster', () => {
    const sc = colScene().board(1, 0, 'c-five').board(0, 0, 'p-hidden', { faceDown: true }).mood(2);
    expect(sc.decide()).toBe('attack c-five > p-hidden');
  });
});

describe('the Collector and Ambush', () => {
  it('flips a face-down monster to attack when the +2 Power wins the fight', () => {
    // 5 Power cannot beat the 6-Power foe; sprung it has 7
    const sc = colScene().board(1, 0, 'c-five', { faceDown: true }).board(0, 0, 'p-six');
    expect(sc.turn()).toEqual(['repos c-five', 'attack c-five > p-six', 'end']);
  });

  it('keeps it hidden when the flip gains nothing', () => {
    const sc = colScene().board(1, 0, 'c-five', { faceDown: true }).board(0, 0, 'p-brute');
    expect(sc.turn()).toEqual(['end']);
  });

  it('sets a monster face-down when it would guard (Composed, or Slow)', () => {
    const sc = colScene().hand(1, 'c-five').board(0, 0, 'p-brute');
    expect(sc.decide()).toBe('summon c-five down');
  });
});

describe('greedy and the expert on a face-down Collector monster', () => {
  const act = (sc: SceneT, mk: () => ReturnType<typeof createGreedy>): string => {
    const s = sc.state();
    return sc.fmt(s, botAction(mk(), world.collector.brain, s));
  };
  const weak = (): SceneT => playerScene().board(0, 0, 'p-two').board(1, 0, 'c-seven', { faceDown: true });
  const strong = (): SceneT => playerScene().board(0, 0, 'p-brute').board(1, 0, 'c-five', { faceDown: true });

  it('greedy and the expert decline a gamble that Riposte punishes', () => {
    expect(act(weak(), createGreedy)).toBe('end');
    expect(act(weak(), () => createExpert())).toBe('end');
  });

  it('and take it when the Power is high enough', () => {
    expect(act(strong(), createGreedy)).toMatch(/^attack p-brute/);
    expect(act(strong(), () => createExpert())).toMatch(/^attack p-brute/);
  });

  it('the expert sees the Ambush: it flips a face-down monster and attacks with the +2', () => {
    // 5 Power against a 6-Power foe loses; sprung it has 7 and wins (round 2: no Appraisal waits for the flipped monster)
    const sc = new Scene(world, 2).board(0, 0, 'p-five', { faceDown: true }).board(1, 0, 'c-six');
    const bot = createExpert();
    const s = sc.state();
    const first = sc.fmt(s, botAction(bot, world.collector.brain, s));
    expect(first).toBe('repos p-five');
  });
});

it('the live content keeps the Collector able to set monsters face-down', () => {
  expect(CONTENT.collector.ai.allowFaceDown).toBe(true);
});
