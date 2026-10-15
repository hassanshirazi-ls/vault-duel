// The turn procedure (ARCHITECTURE.md §13.3), repositioning (D-089), the mood lists (D-081) and the only-legal-actions
// guarantee. Whole Collector turns are played through the real engine.
import { describe, expect, it } from 'vitest';
import { collectorWith, createWorld, mon, Scene, withAi } from './world';
import type { Scene as SceneT } from './world';

const world = createWorld([
  mon('c-brute', 'C', 7, 3, 'fire'),
  mon('c-brute2', 'C', 7, 3, 'fire'),
  mon('c-six', 'C', 6, 3, 'void'),
  mon('c-mid-void', 'C', 5, 4, 'void'),
  mon('c-weak', 'C', 2, 2, 'void'),
  mon('c-vain', 'C', 6, 3, 'void', ['vain']),
  mon('c-slow', 'C', 6, 5, 'void', ['slow']),
  mon('p-small', 'P', 3, 3, 'void'),
  mon('p-four', 'P', 4, 3, 'void'),
  mon('p-five', 'P', 5, 3, 'void'),
  mon('p-six', 'P', 6, 3, 'void'),
  mon('p-seven', 'P', 7, 3, 'void'),
  mon('p-hidden', 'P', 3, 3, 'void'),
  mon('p-stolen', 'P', 6, 3, 'void'),
]);
const scene = (): SceneT => new Scene(world);

describe('turn procedure', () => {
  it('runs reposition, play, attacks, then ends the turn', () => {
    const sc = scene().board(1, 0, 'c-brute', { pos: 1 }).hand(1, 'c-weak').board(0, 0, 'p-small').mood(1);
    expect(sc.turn()).toEqual([
      'repos c-brute', // a kill is available once it is in attack position
      'summon c-weak atk', // the play
      'attack c-brute > p-small',
      'end',
    ]);
  });

  it('plays at most once, then attacks with every monster in descending Power', () => {
    const sc = scene().board(1, 0, 'c-six').board(1, 1, 'c-brute').hand(1, 'c-weak', 'c-mid-void').board(0, 0, 'p-small').board(0, 1, 'p-four').mood(1);
    const out = sc.turn();
    expect(out.filter((a) => a.startsWith('summon')).length).toBe(1);
    expect(out.filter((a) => a.startsWith('attack'))).toEqual(['attack c-brute > p-four', 'attack c-six > p-small']);
    expect(out[out.length - 1]).toBe('end');
  });

  it('takes the first non-null play rule: the ace before a beater', () => {
    const sc = scene().hand(1, 'c-ace', 'c-brute').vault(1, 'p-stolen').board(0, 0, 'p-four');
    expect(sc.decide()).toBe('covetous c-ace sac p-stolen atk');
  });

  it('ends the turn when no rule applies', () => {
    expect(scene().board(1, 0, 'c-weak').board(0, 0, 'p-seven').turn()).toEqual(['end']);
  });

  it('a forced Vain attack replaces endTurn even when the mood list has no hold rule', () => {
    const ai = withAi((a) => {
      a['attack'] = ['lethal'];
      (a['moods'] as Record<string, Record<string, unknown>>)['composed'] = {};
    });
    const sc = scene().board(1, 0, 'c-vain').board(0, 0, 'p-five');
    expect(sc.turn(collectorWith(world, ai))).toEqual(['attack c-vain > p-five', 'end']);
  });

  it('is deterministic: the same state gives the same turn, repeatedly', () => {
    const mk = (): string[] => scene().board(1, 0, 'c-brute').board(1, 1, 'c-brute2').hand(1, 'c-weak', 'c-case').board(0, 0, 'p-five').board(0, 1, 'p-five').turn();
    expect(mk()).toEqual(mk());
    expect(mk()).toEqual(mk());
  });

  it('a decision is always one of the engine legal actions', () => {
    const sc = scene().board(1, 0, 'c-brute').board(1, 1, 'c-vain').hand(1, 'c-weak', 'c-case', 'c-forfeit').board(0, 0, 'p-five');
    const s = sc.state();
    const legal = world.collector.brain.engine.getLegalActions(s);
    expect(legal).toContainEqual(world.collector.act(s));
  });
});

describe('repositioning (D-089)', () => {
  it('a guard monster switches to attack when that gives it a clean kill', () => {
    const sc = scene().board(1, 0, 'c-brute', { pos: 1 }).board(0, 0, 'p-small');
    expect(sc.decide()).toBe('repos c-brute');
  });

  it('it stays in guard when it would have no attack under rule 1, 2 or 4', () => {
    // 7 against a 7-Power monster is a trade; Composed does not take trades.
    const sc = scene().board(1, 0, 'c-brute', { pos: 1 }).board(0, 0, 'p-seven').mood(0);
    expect(sc.turn()).toEqual(['end']);
  });

  it('...but a trade counts in Agitated, where rule 2 takes even trades', () => {
    const sc = scene().board(1, 0, 'c-brute', { pos: 1 }).board(0, 0, 'p-seven').mood(1);
    expect(sc.decide()).toBe('repos c-brute');
  });

  it('a guard monster switches to attack for a direct attack on an empty board', () => {
    expect(scene().board(1, 0, 'c-weak', { pos: 1 }).decide()).toBe('repos c-weak');
  });

  it('a guard monster switches for a lethal attack', () => {
    const sc = scene().board(1, 0, 'c-brute', { pos: 1 }).board(0, 0, 'p-six').life(0, 1);
    expect(sc.decide()).toBe('repos c-brute');
  });

  it('never moves an attack-position monster to guard', () => {
    const sc = scene().board(1, 0, 'c-weak').board(0, 0, 'p-seven');
    expect(sc.turn()).toEqual(['end']);
  });

  it('no reposition is offered the turn a monster enters', () => {
    const sc = scene().board(1, 0, 'c-brute', { pos: 1, entered: 7 }).board(0, 0, 'p-small');
    expect(sc.turn()).toEqual(['end']);
  });

  it('only the monster that gains an attack switches', () => {
    const sc = scene().board(1, 0, 'c-weak', { pos: 1 }).board(1, 1, 'c-brute', { pos: 1 }).board(0, 0, 'p-small');
    expect(sc.turn()[0]).toBe('repos c-brute');
  });

  it('Desperate puts every guard monster in attack, leftmost first (reposition: allAttack)', () => {
    const sc = scene().board(1, 0, 'c-weak', { pos: 1 }).board(1, 1, 'c-mid-void', { pos: 1 }).board(0, 0, 'p-seven').mood(2);
    expect(sc.turn().slice(0, 2)).toEqual(['repos c-weak', 'repos c-mid-void']);
  });
});

describe('moods (D-080, D-081)', () => {
  it('Agitated moves the removal spell above the beater; Composed does not', () => {
    // Hand: a beater (7 beats the 4-Power monster) and Forfeit (can destroy it).
    const mk = (mood: 0 | 1): SceneT => scene().hand(1, 'c-brute', 'c-forfeit').board(0, 0, 'p-four').mood(mood);
    expect(mk(0).decide()).toBe('summon c-brute atk');
    expect(mk(1).decide()).toBe('cast c-forfeit > p-four');
  });

  it('Composed summons in guard where the others summon in attack', () => {
    const mk = (mood: 0 | 1): SceneT => scene().hand(1, 'c-mid-void').board(0, 0, 'p-seven').mood(mood);
    expect(mk(0).decide()).toBe('summon c-mid-void grd');
    expect(mk(1).decide()).toBe('summon c-mid-void atk');
  });

  it('Composed uses only attack rules 1, 2 and 4: it does not attack a face-down monster', () => {
    const mk = (mood: 0 | 1): SceneT => scene().board(1, 0, 'c-brute').board(0, 0, 'p-hidden', { faceDown: true }).mood(mood);
    expect(mk(0).turn()).toEqual(['end']);
    expect(mk(1).turn()).toEqual(['attack c-brute > p-hidden', 'end']);
  });

  it('Desperate attacks anything, a face-down monster included, with every monster', () => {
    const sc = scene().board(1, 0, 'c-weak').board(1, 1, 'c-mid-void').board(0, 0, 'p-hidden', { faceDown: true }).board(0, 1, 'p-seven').mood(2);
    const out = sc.turn();
    expect(out.filter((a) => a.startsWith('attack')).length).toBe(2);
  });

  it('the mood is read from the state, so a state with a different mood plays differently', () => {
    const a = scene().board(1, 0, 'c-brute').board(0, 0, 'p-hidden', { faceDown: true });
    expect(a.mood(0).decide()).toBe('end');
    expect(a.mood(1).decide()).toBe('attack c-brute > p-hidden');
  });
});

describe('mood parameter merging (D-204 and ARCHITECTURE.md §13.2)', () => {
  it('lists replace, params merge per rule and then per key', async () => {
    const { effectiveAi } = await import('../src/collector/moods');
    const { BASE_AI } = await import('./world');
    const composed = effectiveAi(BASE_AI, 0);
    expect(composed.params.summonFallback).toEqual({ position: 'guardUnlessBeater', slowPosition: 'guard', slowPick: 'highestGuard' });
    expect(composed.params.setTrapWhenBehind).toEqual({ compare: 'fewerOrEqual' });
    expect(composed.attack).toEqual(['lethal', 'killWithoutLoss', 'directIfEmpty', 'holdExceptVain']);
    expect(composed.play).toEqual(BASE_AI.play);
    const agitated = effectiveAi(BASE_AI, 1);
    expect(agitated.play[2]).toBe('castHighValueSpell');
    expect(agitated.params.killWithoutLoss).toEqual({ allowTrades: true });
    expect(agitated.params.summonFallback.position).toBe('attack');
    const desperate = effectiveAi(BASE_AI, 2);
    expect(desperate.reposition).toBe('allAttack');
    expect(desperate.params.faceDownIfStrong).toEqual({ minPower: 0 });
    expect(desperate.attack).toEqual(['lethal', 'attackAnything']);
  });
});
