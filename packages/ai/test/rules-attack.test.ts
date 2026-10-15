// Attack-phase rules (DESIGN.md "AI priorities", D-082, D-090 to D-093) and the best legal target (D-091), one at a time.
import { describe, expect, it } from 'vitest';
import { attackRule, createWorld, mon, Scene, withAi } from './world';
import type { Scene as SceneT } from './world';

const world = createWorld([
  mon('c-brute', 'C', 7, 3, 'fire'),
  mon('c-brute2', 'C', 7, 3, 'fire'),
  mon('c-six', 'C', 6, 3, 'void'),
  mon('c-mid-void', 'C', 5, 4, 'void'),
  mon('c-three', 'C', 3, 3, 'void'),
  mon('c-weak', 'C', 2, 2, 'void'),
  mon('c-vain', 'C', 6, 3, 'void', ['vain']),
  mon('c-vain2', 'C', 5, 3, 'void', ['vain']),
  mon('c-swift', 'C', 7, 3, 'void', ['swift']),
  mon('c-pierce', 'C', 8, 3, 'void', ['pierce']),
  mon('p-blocker', 'P', 2, 2, 'void'),
  mon('p-small', 'P', 3, 3, 'void'),
  mon('p-four', 'P', 4, 3, 'void'),
  mon('p-five', 'P', 5, 3, 'void'),
  mon('p-six', 'P', 6, 3, 'void'),
  mon('p-seven', 'P', 7, 3, 'void'),
  mon('p-big', 'P', 8, 5, 'void'),
  mon('p-wall', 'P', 1, 9, 'void'),
  mon('p-wall7', 'P', 1, 7, 'void'),
  mon('p-warded', 'P', 5, 3, 'void', ['ward']),
  mon('p-sentinel', 'P', 2, 5, 'void', ['sentinel']),
  mon('p-hidden', 'P', 3, 3, 'void'),
  mon('p-hidden2', 'P', 9, 9, 'void'),
]);
const scene = (): SceneT => new Scene(world);

describe('lethal (attack rule 1, D-082)', () => {
  it('takes a direct attack with enough Power', () => {
    const sc = scene().board(1, 0, 'c-brute').life(0, 7);
    expect(attackRule(sc, 'lethal')).toEqual(['attack c-brute > face']);
  });

  it('takes nothing when the attack falls short', () => {
    expect(attackRule(scene().board(1, 0, 'c-brute').life(0, 8), 'lethal')).toEqual([]);
  });

  it('counts the excess damage over a monster in attack position', () => {
    const sc = scene().board(1, 0, 'c-brute').board(0, 0, 'p-blocker').life(0, 5);
    expect(attackRule(sc, 'lethal')).toEqual(['attack c-brute > p-blocker']);
  });

  it('finds a sequence: the first attack clears the blocker so the second goes direct', () => {
    const sc = scene().board(1, 0, 'c-brute').board(1, 1, 'c-brute2').board(0, 0, 'p-blocker').life(0, 12);
    expect(attackRule(sc, 'lethal')).toEqual(['attack c-brute > p-blocker', 'attack c-brute2 > p-blocker']);
  });

  it('counts Pierce damage over a guard-position monster', () => {
    const sc = scene().board(1, 0, 'c-pierce').board(0, 0, 'p-wall', { pos: 1 }).life(0, 1);
    // Power 8 against Guard 9: no destruction, no Pierce damage. With Guard 7 the excess 1 is lethal.
    expect(attackRule(sc, 'lethal')).toEqual([]);
    const sc2 = scene().board(1, 0, 'c-pierce').board(0, 0, 'p-wall7', { pos: 1 }).life(0, 1);
    expect(attackRule(sc2, 'lethal')).toEqual(['attack c-pierce > p-wall7']);
  });

  it('ignores a set trap (it is unknown to him): the attack is still lethal', () => {
    const sc = scene().board(1, 0, 'c-brute').life(0, 7).trap(0, 0, 'p-hidden');
    expect(attackRule(sc, 'lethal')).toEqual(['attack c-brute > face']);
  });

  it('does not count on a face-down monster: it is a blocker that survives', () => {
    const sc = scene().board(1, 0, 'c-brute').board(0, 0, 'p-hidden', { faceDown: true }).life(0, 3);
    expect(attackRule(sc, 'lethal')).toEqual([]);
  });

  it('lists the strongest attacker first', () => {
    const sc = scene().board(1, 0, 'c-three').board(1, 1, 'c-brute').life(0, 3);
    expect(attackRule(sc, 'lethal')).toEqual(['attack c-brute > face', 'attack c-three > face']);
  });
});

describe('killWithoutLoss (attack rule 2, D-092)', () => {
  it('destroys the highest-Power monster it can beat without losing the attacker', () => {
    const sc = scene().board(1, 0, 'c-brute').board(0, 0, 'p-small').board(0, 1, 'p-four').board(0, 2, 'p-seven');
    // against the 7-Power monster it would trade, so it is excluded; 4 then 3.
    expect(attackRule(sc, 'killWithoutLoss')).toEqual(['attack c-brute > p-four', 'attack c-brute > p-small']);
  });

  it('actual destructions rank before Ward strips, whatever the Power', () => {
    const sc = scene().board(1, 0, 'c-brute').board(0, 0, 'p-warded').board(0, 1, 'p-small');
    expect(attackRule(sc, 'killWithoutLoss')).toEqual(['attack c-brute > p-small', 'attack c-brute > p-warded']);
  });

  it('beats a guard-position monster by Guard, not Power', () => {
    const sc = scene().board(1, 0, 'c-six').board(0, 0, 'p-wall', { pos: 1 }).board(0, 1, 'p-four', { pos: 1 });
    expect(attackRule(sc, 'killWithoutLoss')).toEqual(['attack c-six > p-four']);
  });

  it('never attacks a face-down monster', () => {
    expect(attackRule(scene().board(1, 0, 'c-brute').board(0, 0, 'p-hidden', { faceDown: true }), 'killWithoutLoss')).toEqual([]);
  });

  it('does not accept an even trade in Composed, accepts it in Agitated (allowTrades, D-081)', () => {
    const mk = (mood: 0 | 1): SceneT => scene().board(1, 0, 'c-mid-void').board(0, 0, 'p-five').mood(mood);
    expect(attackRule(mk(0), 'killWithoutLoss')).toEqual([]);
    expect(attackRule(mk(1), 'killWithoutLoss')).toEqual(['attack c-mid-void > p-five']);
  });

  it('a trade ranks after every clean kill', () => {
    const sc = scene().board(1, 0, 'c-mid-void').board(1, 1, 'c-six').board(0, 0, 'p-five').board(0, 1, 'p-small').mood(1);
    // c-six kills p-five clean (6 > 5) and p-small; c-mid-void trades with p-five and kills p-small.
    const out = attackRule(sc, 'killWithoutLoss');
    expect(out[0]).toBe('attack c-six > p-five');
    expect(out[out.length - 1]).toBe('attack c-mid-void > p-five');
  });

  it('does not lose the attacker: a weaker attacker is not listed against a stronger monster', () => {
    expect(attackRule(scene().board(1, 0, 'c-weak').board(0, 0, 'p-small'), 'killWithoutLoss')).toEqual([]);
  });

  it('the strongest attacker takes the kill (D-090), ties by slot', () => {
    const sc = scene().board(1, 0, 'c-six').board(1, 1, 'c-brute').board(1, 2, 'c-brute2').board(0, 0, 'p-small');
    expect(attackRule(sc, 'killWithoutLoss').slice(0, 3)).toEqual([
      'attack c-brute > p-small',
      'attack c-brute2 > p-small',
      'attack c-six > p-small',
    ]);
  });

  it('the element bonus can turn a trade into a clean kill', () => {
    // fire 5 vs a 6-Power air monster... fire beats air: 5 + 2 = 7 > 6.
    const w = createWorld([mon('c-fire5', 'C', 5, 3, 'fire'), mon('p-air6', 'P', 6, 3, 'air')]);
    const sc = new Scene(w).board(1, 0, 'c-fire5').board(0, 0, 'p-air6');
    expect(attackRule(sc, 'killWithoutLoss')).toEqual(['attack c-fire5 > p-air6']);
  });
});

describe('faceDownIfStrong (attack rule 3, D-093)', () => {
  it('attacks a face-down monster with 7 or more Power (from the globals)', () => {
    const sc = scene().board(1, 0, 'c-brute').board(0, 0, 'p-hidden', { faceDown: true });
    expect(attackRule(sc, 'faceDownIfStrong')).toEqual(['attack c-brute > p-hidden']);
  });

  it('does not with less', () => {
    const sc = scene().board(1, 0, 'c-six').board(0, 0, 'p-hidden', { faceDown: true });
    expect(attackRule(sc, 'faceDownIfStrong')).toEqual([]);
  });

  it('uses Power without the element bonus', () => {
    const w = createWorld([mon('c-fire6', 'C', 6, 3, 'fire'), mon('p-air', 'P', 3, 3, 'air')]);
    const sc = new Scene(w).board(1, 0, 'c-fire6').board(0, 0, 'p-air', { faceDown: true });
    expect(attackRule(sc, 'faceDownIfStrong')).toEqual([]);
  });

  it('Desperate lowers the threshold to the mood parameter', () => {
    const sc = scene().board(1, 0, 'c-weak').board(0, 0, 'p-hidden', { faceDown: true }).mood(2);
    expect(attackRule(sc, 'faceDownIfStrong')).toEqual(['attack c-weak > p-hidden']);
  });

  it('takes the leftmost face-down monster, with the strongest attacker', () => {
    const sc = scene()
      .board(1, 0, 'c-brute')
      .board(1, 1, 'c-brute2')
      .board(0, 0, 'p-small')
      .board(0, 1, 'p-hidden', { faceDown: true })
      .board(0, 2, 'p-hidden2', { faceDown: true });
    expect(attackRule(sc, 'faceDownIfStrong')[0]).toBe('attack c-brute > p-hidden');
  });

  it('a numeric minPower works as well as a $NAME', () => {
    const ai = withAi((a) => {
      ((a['params'] as Record<string, Record<string, unknown>>)['faceDownIfStrong'] as Record<string, unknown>)['minPower'] = 6;
    });
    const sc = scene().board(1, 0, 'c-six').board(0, 0, 'p-hidden', { faceDown: true });
    expect(attackRule(sc, 'faceDownIfStrong', ai)).toEqual(['attack c-six > p-hidden']);
  });
});

describe('directIfEmpty (attack rule 4)', () => {
  it('attacks directly when the opposing board is empty, strongest first', () => {
    const sc = scene().board(1, 0, 'c-three').board(1, 1, 'c-brute');
    expect(attackRule(sc, 'directIfEmpty')).toEqual(['attack c-brute > face', 'attack c-three > face']);
  });

  it('does nothing when the opponent has a monster', () => {
    expect(attackRule(scene().board(1, 0, 'c-brute').board(0, 0, 'p-small'), 'directIfEmpty')).toEqual([]);
  });

  it('a Swift monster summoned this turn cannot hit life, so the rule skips it', () => {
    expect(attackRule(scene().board(1, 0, 'c-swift', { entered: 7 }), 'directIfEmpty')).toEqual([]);
  });
});

describe('holdExceptVain (attack rule 5, D-091)', () => {
  it('holds when nothing is forced', () => {
    expect(attackRule(scene().board(1, 0, 'c-brute').board(0, 0, 'p-small'), 'holdExceptVain')).toEqual([]);
  });

  it('a Vain monster with a legal attack attacks its best target', () => {
    const sc = scene().board(1, 0, 'c-vain').board(0, 0, 'p-small').board(0, 1, 'p-five');
    expect(attackRule(sc, 'holdExceptVain')).toEqual(['attack c-vain > p-five']);
  });

  it('a Vain monster that cannot attack yet forces nothing', () => {
    const sc = scene().board(1, 0, 'c-vain', { entered: 7 }).board(0, 0, 'p-small');
    expect(attackRule(sc, 'holdExceptVain')).toEqual([]);
  });

  it('only the Vain monsters are listed, strongest first', () => {
    const sc = scene().board(1, 0, 'c-vain2').board(1, 1, 'c-brute').board(1, 2, 'c-vain').board(0, 0, 'p-small');
    const out = attackRule(sc, 'holdExceptVain');
    expect(out.map((l) => l.split(' ')[1])).toEqual(['c-vain', 'c-vain2']);
  });
});

describe('best legal target (D-091)', () => {
  const vain = (): SceneT => scene().board(1, 0, 'c-vain');

  it('(1) a lethal direct attack', () => {
    expect(attackRule(vain().life(0, 6), 'attackAnything')).toEqual(['attack c-vain > face']);
  });

  it('(2) a target it destroys without losing the attacker, highest target Power', () => {
    const sc = vain().board(0, 0, 'p-small').board(0, 1, 'p-five').board(0, 2, 'p-seven');
    expect(attackRule(sc, 'attackAnything')).toEqual(['attack c-vain > p-five']);
  });

  it('(3) then a target it trades with, highest target Power', () => {
    const sc = vain().board(0, 0, 'p-six').board(0, 1, 'p-seven');
    expect(attackRule(sc, 'attackAnything')).toEqual(['attack c-vain > p-six']);
  });

  it('(4) then a direct attack', () => {
    expect(attackRule(vain(), 'attackAnything')).toEqual(['attack c-vain > face']);
  });

  it('(5) then a target whose Ward it strips', () => {
    const sc = vain().board(0, 0, 'p-warded').board(0, 1, 'p-seven');
    expect(attackRule(sc, 'attackAnything')).toEqual(['attack c-vain > p-warded']);
  });

  it('(6) then the attack that costs him the least life', () => {
    // against p-seven he loses the attacker and 1 life; against the 9-Guard wall he loses 3 life.
    const sc = vain().board(0, 0, 'p-wall', { pos: 1 }).board(0, 1, 'p-big');
    // p-big costs 2 life and the attacker, p-wall costs 3: the least life is p-big.
    expect(attackRule(sc, 'attackAnything')).toEqual(['attack c-vain > p-big']);
  });

  it('(7) then the least board: the attacker survives', () => {
    // p-seven costs 1 life and the attacker; p-wall7 (Guard 7) costs 1 life and nothing else.
    const sc = vain().board(0, 0, 'p-seven').board(0, 1, 'p-wall7', { pos: 1 });
    expect(attackRule(sc, 'attackAnything')).toEqual(['attack c-vain > p-wall7']);
  });

  it('a face-down target ranks after the known ones', () => {
    const sc = vain().board(0, 0, 'p-hidden', { faceDown: true }).board(0, 1, 'p-wall', { pos: 1 });
    expect(attackRule(sc, 'attackAnything')).toEqual(['attack c-vain > p-wall']);
    expect(attackRule(vain().board(0, 0, 'p-hidden', { faceDown: true }), 'attackAnything')).toEqual(['attack c-vain > p-hidden']);
  });

  it('ties go to the leftmost slot, then card id', () => {
    const sc = vain().board(0, 0, 'p-five').board(0, 1, 'p-five');
    expect(attackRule(sc, 'attackAnything')).toEqual(['attack c-vain > p-five']);
    const w2 = createWorld([mon('c-v', 'C', 6, 3, 'void', ['vain']), mon('p-a', 'P', 5, 3, 'void'), mon('p-b', 'P', 5, 3, 'void')]);
    expect(attackRule(new Scene(w2).board(1, 0, 'c-v').board(0, 0, 'p-b').board(0, 1, 'p-a'), 'attackAnything')).toEqual(['attack c-v > p-b']);
  });

  it('Sentinels restrict the choice (the engine lists only them)', () => {
    const sc = vain().board(0, 0, 'p-sentinel').board(0, 1, 'p-small');
    expect(attackRule(sc, 'attackAnything')).toEqual(['attack c-vain > p-sentinel']);
  });
});

describe('attackAnything (Desperate)', () => {
  it('every able monster attacks, strongest first, each at its best target', () => {
    const sc = scene().board(1, 0, 'c-three').board(1, 1, 'c-brute').board(0, 0, 'p-small').board(0, 1, 'p-hidden', { faceDown: true });
    expect(attackRule(sc, 'attackAnything')).toEqual(['attack c-brute > p-small', 'attack c-three > p-small']);
  });
});
