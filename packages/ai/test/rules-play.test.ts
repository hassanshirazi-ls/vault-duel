// Play-phase rules, one at a time (DESIGN.md "AI priorities", D-081 to D-090, D-204). Each rule runs alone on a scene, so
// a failure names the rule.
import { describe, expect, it } from 'vitest';
import { BASE_AI, createWorld, mon, playRule, Scene, withAi } from './world';
import type { Scene as SceneT } from './world';

const world = createWorld([
  mon('c-brute', 'C', 7, 3, 'fire'),
  mon('c-brute2', 'C', 7, 3, 'fire'),
  mon('c-mid', 'C', 5, 4, 'air'),
  mon('c-mid-void', 'C', 5, 4, 'void'),
  mon('c-slow-a', 'C', 6, 5, 'water', ['slow']),
  mon('c-slow-b', 'C', 5, 7, 'water', ['slow']),
  mon('c-slow-c', 'C', 5, 7, 'water', ['slow']),
  mon('c-tether', 'C', 8, 4, 'void', ['tethered']),
  mon('c-brittle', 'C', 9, 4, 'fire', ['brittle']),
  mon('c-weak', 'C', 2, 2, 'void'),
  mon('p-blocker', 'P', 2, 2, 'void'),
  mon('p-small', 'P', 3, 3, 'void'),
  mon('p-small-b', 'P', 3, 3, 'void'),
  mon('p-blocker-b', 'P', 2, 2, 'void'),
  mon('p-four', 'P', 4, 3, 'void'),
  mon('p-five', 'P', 5, 3, 'void'),
  mon('p-six', 'P', 6, 3, 'void'),
  mon('p-seven', 'P', 7, 3, 'void'),
  mon('p-guard', 'P', 2, 6, 'void'),
  mon('p-water', 'P', 6, 3, 'water'),
  mon('p-air', 'P', 4, 3, 'air'),
  mon('p-stolen', 'P', 6, 3, 'void'),
  mon('p-stolen2', 'P', 3, 3, 'void'),
  mon('c-swift', 'C', 7, 3, 'void', ['swift']),
]);
const scene = (): SceneT => new Scene(world);

describe('winThisTurn (rule 1, D-082)', () => {
  it('casts Gilt Frame when its Power makes the direct attack lethal', () => {
    const sc = scene().board(1, 0, 'c-brute').hand(1, 'c-gilt').life(0, 9);
    expect(playRule(sc, 'winThisTurn')).toBe('cast c-gilt > c-brute');
  });

  it('does nothing when even the spell leaves the opponent alive', () => {
    const sc = scene().board(1, 0, 'c-brute').hand(1, 'c-gilt').life(0, 10);
    expect(playRule(sc, 'winThisTurn')).toBeNull();
  });

  it('casts Forfeit to remove the only blocker when a direct attack then wins', () => {
    const sc = scene().board(1, 0, 'c-brute').hand(1, 'c-forfeit').board(0, 0, 'p-blocker').life(0, 6);
    expect(playRule(sc, 'winThisTurn')).toBe('cast c-forfeit > p-blocker');
  });

  it('leaves a win that needs no play to the attack phase', () => {
    const sc = scene().board(1, 0, 'c-brute').hand(1, 'c-gilt').life(0, 7);
    expect(playRule(sc, 'winThisTurn')).toBeNull();
  });

  it('never tries a draw spell, whose card it cannot know', () => {
    const sc = scene().board(1, 0, 'c-brute').hand(1, 'c-ledger').life(0, 9);
    expect(playRule(sc, 'winThisTurn')).toBeNull();
  });

  it('tries a summon as the enabling play: a Swift monster adds a second attacker (D-220)', () => {
    // brute alone takes 5 off the 10 life (7 over the 2-Power blocker); the Swift 7 first clears it, brute then goes direct.
    const sc = scene().board(1, 0, 'c-brute').hand(1, 'c-swift').board(0, 0, 'p-blocker').life(0, 10);
    expect(playRule(sc, 'winThisTurn')).toBe('summon c-swift atk');
  });

  it('does not summon when the Swift attacker does not make the win', () => {
    expect(playRule(scene().board(1, 0, 'c-brute').hand(1, 'c-swift').board(0, 0, 'p-blocker').life(0, 20), 'winThisTurn')).toBeNull();
  });

  it('breaks a tie between equal winning casts by leftmost target slot, not by card id', () => {
    // Two 7-Power attackers, two 2/2 blockers, 12 life: removing either blocker lets the second attacker go direct.
    const mk = (first: string, second: string): SceneT =>
      scene().board(1, 0, 'c-brute').board(1, 1, 'c-brute2').hand(1, 'c-smite').board(0, 0, first).board(0, 1, second).life(0, 12);
    expect(playRule(mk('p-blocker', 'p-blocker-b'), 'winThisTurn')).toBe('cast c-smite > p-blocker');
    expect(playRule(mk('p-blocker-b', 'p-blocker'), 'winThisTurn')).toBe('cast c-smite > p-blocker-b');
  });
});

describe('summonAce (rule 2)', () => {
  it('summons the ace by sacrificing a monster taken by Appraisal, in attack position', () => {
    const sc = scene().hand(1, 'c-ace').vault(1, 'p-stolen');
    expect(playRule(sc, 'summonAce')).toBe('covetous c-ace sac p-stolen atk');
  });

  it('sacrifices the weakest candidate when several are legal', () => {
    const sc = scene().hand(1, 'c-ace').vault(1, 'p-stolen', 'p-stolen2');
    expect(playRule(sc, 'summonAce')).toBe('covetous c-ace sac p-stolen2 atk');
  });

  it('sacrifices a vault monster before a board one, even a stronger one (D-213)', () => {
    const sc = scene().hand(1, 'c-ace').vault(1, 'p-stolen').board(1, 1, 'p-stolen2', { appraised: true });
    // the vault card has Power 6, the board monster 3: the vault card still goes first
    expect(playRule(sc, 'summonAce')).toBe('covetous c-ace sac p-stolen atk');
  });

  it('within the board zone the weakest goes first, then the leftmost slot (D-213)', () => {
    const w = scene().hand(1, 'c-ace').board(1, 0, 'p-six', { appraised: true }).board(1, 1, 'p-stolen2', { appraised: true }).board(1, 2, 'p-small', { appraised: true });
    // slots 1 and 2 both have Power 3: the leftmost
    expect(playRule(w, 'summonAce')).toBe('covetous c-ace sac p-stolen2 atk');
  });

  it('does nothing without a sacrifice, or without the ace in hand', () => {
    expect(playRule(scene().hand(1, 'c-ace'), 'summonAce')).toBeNull();
    expect(playRule(scene().hand(1, 'c-brute').vault(1, 'p-stolen'), 'summonAce')).toBeNull();
  });
});

describe('summonBeater (rule 3, D-083)', () => {
  it('plays the card that beats the strongest face-up monster', () => {
    const sc = scene().hand(1, 'c-brute', 'c-weak').board(0, 0, 'p-five');
    expect(playRule(sc, 'summonBeater')).toBe('summon c-brute atk');
  });

  it('counts the element bonus', () => {
    // 5 Power with advantage over water is 7 and beats a 6-Power water monster; the same 5 without advantage does not.
    const adv = scene().hand(1, 'c-mid').board(0, 0, 'p-water');
    expect(playRule(adv, 'summonBeater')).toBe('summon c-mid atk');
    const neutral = scene().hand(1, 'c-mid-void').board(0, 0, 'p-water');
    expect(playRule(neutral, 'summonBeater')).toBeNull();
  });

  it('plays the highest-Power qualifier, ties by card id', () => {
    const sc = scene().hand(1, 'c-brute2', 'c-brute', 'c-mid').board(0, 0, 'p-four');
    expect(playRule(sc, 'summonBeater')).toBe('summon c-brute atk');
  });

  it('is skipped with no face-up monster to beat', () => {
    const sc = scene().hand(1, 'c-brute');
    expect(playRule(sc, 'summonBeater')).toBeNull();
    const down = scene().hand(1, 'c-brute').board(0, 0, 'p-small', { faceDown: true });
    expect(playRule(down, 'summonBeater')).toBeNull();
  });

  it('compares with Guard when the strongest monster is in guard position', () => {
    // Power 7 does not beat Guard 6+... p-guard is 2/6 in guard: 5 power does not beat Guard 6, 7 does.
    const sc = scene().hand(1, 'c-mid-void').board(0, 0, 'p-guard', { pos: 1 });
    expect(playRule(sc, 'summonBeater')).toBeNull();
    const sc2 = scene().hand(1, 'c-brute').board(0, 0, 'p-guard', { pos: 1 });
    expect(playRule(sc2, 'summonBeater')).toBe('summon c-brute atk');
  });

  it('uses the Power after the summon: Tethered counts when it would be his only monster', () => {
    // 8-2 = 6 as a lone monster does not beat a 6-Power target; with a second monster on board it is 8.
    const alone = scene().hand(1, 'c-tether').board(0, 0, 'p-six');
    expect(playRule(alone, 'summonBeater')).toBeNull();
    const two = scene().hand(1, 'c-tether').board(1, 0, 'c-weak').board(0, 0, 'p-six');
    expect(playRule(two, 'summonBeater')).toBe('summon c-tether atk');
  });

  it('M-10 switch skipBrittleCountered skips a Brittle card the strongest monster would destroy by element', () => {
    // c-brittle (fire) as a defender against a water attacker: water beats fire, so Brittle triggers.
    const sc = scene().hand(1, 'c-brittle').board(0, 0, 'p-water');
    expect(playRule(sc, 'summonBeater')).toBe('summon c-brittle atk');
    const strict = withAi((ai) => {
      ((ai['params'] as Record<string, Record<string, unknown>>)['summonBeater'] as Record<string, unknown>)['skipBrittleCountered'] = true;
    });
    expect(playRule(sc, 'summonBeater', strict)).toBeNull();
  });
});

describe('setTrapWhenBehind (rule 4, D-081, D-088)', () => {
  it('sets a trap with fewer monsters than the opponent', () => {
    const sc = scene().hand(1, 'c-case').board(0, 0, 'p-small');
    expect(playRule(sc, 'setTrapWhenBehind')).toBe('trap c-case');
  });

  it('does not with equal numbers when the comparison is "fewer"', () => {
    const sc = scene().hand(1, 'c-case').board(0, 0, 'p-small').board(1, 0, 'c-weak').mood(1);
    expect(playRule(sc, 'setTrapWhenBehind')).toBeNull();
  });

  it('Composed also sets it with equal numbers', () => {
    const sc = scene().hand(1, 'c-case').board(0, 0, 'p-small').board(1, 0, 'c-weak').mood(0);
    // the base block says "fewer"; the Composed override in BASE_AI says "fewerOrEqual"
    expect(playRule(sc, 'setTrapWhenBehind')).toBe('trap c-case');
  });

  it('counts face-down monsters', () => {
    const sc = scene().hand(1, 'c-case').board(0, 0, 'p-small', { faceDown: true }).mood(1);
    expect(playRule(sc, 'setTrapWhenBehind')).toBe('trap c-case');
  });

  it('follows trapPreference, ties by instance id', () => {
    const sc = scene().hand(1, 'c-counter', 'c-claim', 'c-case').board(0, 0, 'p-small');
    expect(playRule(sc, 'setTrapWhenBehind')).toBe('trap c-case');
    const sc2 = scene().hand(1, 'c-counter', 'c-claim').board(0, 0, 'p-small');
    expect(playRule(sc2, 'setTrapWhenBehind')).toBe('trap c-claim');
  });

  it('never sets a trap that the preference list does not name', () => {
    const sc = scene().hand(1, 'c-extra-trap').board(0, 0, 'p-small');
    expect(playRule(sc, 'setTrapWhenBehind')).toBeNull();
  });

  it('does nothing without a free trap slot', () => {
    const sc = scene().hand(1, 'c-case').board(0, 0, 'p-small').trap(1, 0, 'c-claim').trap(1, 1, 'c-counter');
    expect(playRule(sc, 'setTrapWhenBehind')).toBeNull();
  });
});

describe('castHighValueSpell (rule 5, D-087, D-204)', () => {
  it('Forfeit goes to the highest-Power face-up target it can destroy (Power 4 or less)', () => {
    const sc = scene().hand(1, 'c-forfeit').board(0, 0, 'p-small').board(0, 1, 'p-four').board(0, 2, 'p-seven');
    expect(playRule(sc, 'castHighValueSpell')).toBe('cast c-forfeit > p-four');
  });

  it('Forfeit does not qualify with no legal target, and skips face-down monsters', () => {
    expect(playRule(scene().hand(1, 'c-forfeit').board(0, 0, 'p-seven'), 'castHighValueSpell')).toBeNull();
    expect(playRule(scene().hand(1, 'c-forfeit').board(0, 0, 'p-small', { faceDown: true }), 'castHighValueSpell')).toBeNull();
  });

  it('ties between targets of equal Power break to the leftmost slot, then card id', () => {
    const mk = (first: string, second: string): SceneT => scene().hand(1, 'c-forfeit').board(0, 0, first).board(0, 1, second);
    expect(playRule(mk('p-small', 'p-small-b'), 'castHighValueSpell')).toBe('cast c-forfeit > p-small');
    expect(playRule(mk('p-small-b', 'p-small'), 'castHighValueSpell')).toBe('cast c-forfeit > p-small-b');
  });

  it('Restoration returns the highest-Power Relic in his discard', () => {
    const sc = scene().hand(1, 'c-restoration').discard(1, 'c-weak', 'c-brute', 'c-mid');
    expect(playRule(sc, 'castHighValueSpell')).toBe('cast c-restoration > c-brute');
  });

  it('Restoration does nothing with an empty discard', () => {
    expect(playRule(scene().hand(1, 'c-restoration'), 'castHighValueSpell')).toBeNull();
  });

  it('Gilt Frame is cast on a contested attack: the extra Power turns a non-kill into a kill', () => {
    // brute 7 vs p-guard 2/6 in guard: 7 > 6 already kills; use mid 5 (void) vs guard 6: no kill, +2 = 7 kills.
    const sc = scene().hand(1, 'c-gilt').board(1, 0, 'c-mid-void').board(0, 0, 'p-guard', { pos: 1 });
    expect(playRule(sc, 'castHighValueSpell')).toBe('cast c-gilt > c-mid-void');
  });

  it('Gilt Frame is not cast when the attack already kills, or when +Power would not be enough', () => {
    const already = scene().hand(1, 'c-gilt').board(1, 0, 'c-brute').board(0, 0, 'p-guard', { pos: 1 });
    expect(playRule(already, 'castHighValueSpell')).toBeNull();
    const short = scene().hand(1, 'c-gilt').board(1, 0, 'c-weak').board(0, 0, 'p-guard', { pos: 1 });
    expect(playRule(short, 'castHighValueSpell')).toBeNull();
  });

  it('Gilt Frame picks the attacker whose kill removes the highest-Power target', () => {
    const sc = scene()
      .hand(1, 'c-gilt')
      .board(1, 0, 'c-weak') // Power 2: with +2 it kills the 3-Power monster
      .board(1, 1, 'c-mid-void') // Power 5: with +2 it kills the 6-Power monster
      .board(0, 0, 'p-small')
      .board(0, 1, 'p-six');
    expect(playRule(sc, 'castHighValueSpell')).toBe('cast c-gilt > c-mid-void');
  });

  it('a tie of Power on both sides of a trade is not a contested kill: it is destroyed already', () => {
    const sc = scene().hand(1, 'c-gilt').board(1, 0, 'c-mid-void').board(0, 0, 'p-five');
    expect(playRule(sc, 'castHighValueSpell')).toBeNull();
  });

  it('contestedAttack applies the whole cast: an effect with an `if` counts only where it holds (D-219)', () => {
    const ai = withAi((a) => {
      const params = a.params as { castHighValueSpell: Record<string, unknown> };
      params.castHighValueSpell['c-gilt-fire'] = { when: 'contestedAttack' };
    });
    const w = createWorld([mon('c-fire5', 'C', 5, 3, 'fire'), mon('c-void5', 'C', 5, 3, 'void'), mon('p-guard', 'P', 2, 6, 'void')], ai);
    const fire = new Scene(w).hand(1, 'c-gilt-fire').board(1, 0, 'c-fire5').board(0, 0, 'p-guard', { pos: 1 });
    // fire 5 against Guard 6 fails; the +4 reaches the fire monster (5 + 4 > 6)
    expect(playRule(fire, 'castHighValueSpell', ai)).toBe('cast c-gilt-fire > c-fire5');
    // the same spell on a void monster does nothing, so the rule does not cast it
    const plain = new Scene(w).hand(1, 'c-gilt-fire').board(1, 0, 'c-void5').board(0, 0, 'p-guard', { pos: 1 });
    expect(playRule(plain, 'castHighValueSpell', ai)).toBeNull();
  });

  it('casts candidates in card-id order whatever the order in JSON, taking the first that qualifies', () => {
    const sc = scene().hand(1, 'c-restoration', 'c-forfeit').board(0, 0, 'p-small').discard(1, 'c-brute');
    // "c-forfeit" < "c-restoration"
    expect(playRule(sc, 'castHighValueSpell')).toBe('cast c-forfeit > p-small');
    const sc2 = scene().hand(1, 'c-restoration', 'c-forfeit').board(0, 0, 'p-seven').discard(1, 'c-brute');
    expect(playRule(sc2, 'castHighValueSpell')).toBe('cast c-restoration > c-brute');
  });

  it('a spell with an entry and nothing else in the code (D-204): a new "pick" spell is cast on the highest Power', () => {
    const ai = withAi((a) => {
      (((a['params'] as Record<string, unknown>)['castHighValueSpell']) as Record<string, unknown>)['c-smite'] = { pick: 'highestPower' };
    });
    const sc = scene().hand(1, 'c-smite').board(0, 0, 'p-small').board(0, 1, 'p-seven');
    expect(playRule(sc, 'castHighValueSpell', ai)).toBe('cast c-smite > p-seven');
    expect(playRule(sc, 'castHighValueSpell')).toBeNull(); // no entry in the base block: never cast
  });

  it('an untargeted "pick" spell has its one choice', () => {
    const ai = withAi((a) => {
      (((a['params'] as Record<string, unknown>)['castHighValueSpell']) as Record<string, unknown>)['c-ledger'] = { pick: 'highestPower' };
    });
    expect(playRule(scene().hand(1, 'c-ledger'), 'castHighValueSpell', ai)).toBe('cast c-ledger > -');
  });

  it('a mood entry replaces only that spell id and leaves the others (D-204 merge)', () => {
    const ai = withAi((a) => {
      const moods = a['moods'] as Record<string, Record<string, unknown>>;
      moods['agitated'] = { ...moods['agitated'], params: { killWithoutLoss: { allowTrades: true }, castHighValueSpell: { 'c-forfeit': { pick: 'highestPower' }, 'c-smite': { pick: 'highestPower' } } } };
    });
    // Agitated: smite gets an entry from the mood; forfeit and restoration stay from the base.
    const sc = scene().mood(1).hand(1, 'c-smite', 'c-restoration').board(0, 0, 'p-seven').discard(1, 'c-brute');
    expect(playRule(sc, 'castHighValueSpell', ai)).toBe('cast c-restoration > c-brute'); // "c-restoration" < "c-smite"
    const sc2 = scene().mood(1).hand(1, 'c-smite').board(0, 0, 'p-seven');
    expect(playRule(sc2, 'castHighValueSpell', ai)).toBe('cast c-smite > p-seven');
    // The same hand in Composed: smite has no entry.
    expect(playRule(scene().mood(0).hand(1, 'c-smite').board(0, 0, 'p-seven'), 'castHighValueSpell', ai)).toBeNull();
  });

  it('a mood entry for the same id replaces the base entry', () => {
    const ai = withAi((a) => {
      const moods = a['moods'] as Record<string, Record<string, unknown>>;
      moods['agitated'] = { ...moods['agitated'], params: { castHighValueSpell: { 'c-gilt': { pick: 'highestPower' } } } };
    });
    // In Agitated Gilt Frame is cast on the highest-Power own monster even with no contested attack.
    const sc = scene().mood(1).hand(1, 'c-gilt').board(1, 0, 'c-weak').board(1, 1, 'c-brute');
    expect(playRule(sc, 'castHighValueSpell', ai)).toBe('cast c-gilt > c-brute');
    expect(playRule(scene().mood(0).hand(1, 'c-gilt').board(1, 0, 'c-weak').board(1, 1, 'c-brute'), 'castHighValueSpell', ai)).toBeNull();
  });
});

describe('summonFallback (rule 6, D-084, D-081, D-089)', () => {
  it('summons the highest-Power monster that is not Slow, in attack position', () => {
    const sc = scene().hand(1, 'c-mid', 'c-brute', 'c-slow-a').mood(1);
    expect(playRule(sc, 'summonFallback')).toBe('summon c-brute atk');
  });

  it('skips Slow monsters while a non-Slow one is held', () => {
    const sc = scene().hand(1, 'c-weak', 'c-slow-a').mood(1);
    expect(playRule(sc, 'summonFallback')).toBe('summon c-weak atk');
  });

  it('with only Slow monsters, summons the highest Guard in guard position (ties by card id)', () => {
    const sc = scene().hand(1, 'c-slow-a', 'c-slow-c', 'c-slow-b').mood(1);
    expect(playRule(sc, 'summonFallback')).toBe('summon c-slow-b grd');
  });

  it('Composed summons in guard unless the monster out-powers the strongest face-up monster', () => {
    const weak = scene().hand(1, 'c-mid').board(0, 0, 'p-seven').mood(0);
    expect(playRule(weak, 'summonFallback')).toBe('summon c-mid grd');
    const strong = scene().hand(1, 'c-brute').board(0, 0, 'p-six').mood(0);
    expect(playRule(strong, 'summonFallback')).toBe('summon c-brute atk');
    const tie = scene().hand(1, 'c-brute').board(0, 0, 'p-seven').mood(0);
    expect(playRule(tie, 'summonFallback')).toBe('summon c-brute grd'); // equal does not exceed
  });

  it('Composed with no face-up opposing monster counts as exceeding it (judgment call)', () => {
    expect(playRule(scene().hand(1, 'c-mid').mood(0), 'summonFallback')).toBe('summon c-mid atk');
  });

  it('allowFaceDown turns a guard summon into a face-down one', () => {
    const ai = withAi((a) => {
      a['allowFaceDown'] = true;
    });
    expect(playRule(scene().hand(1, 'c-slow-b').mood(1), 'summonFallback', ai)).toBe('summon c-slow-b down');
    expect(playRule(scene().hand(1, 'c-brute').mood(1), 'summonFallback', ai)).toBe('summon c-brute atk');
  });

  it('does nothing without a monster or a free slot', () => {
    expect(playRule(scene().hand(1, 'c-case'), 'summonFallback')).toBeNull();
    const full = scene().hand(1, 'c-brute').board(1, 0, 'c-weak').board(1, 1, 'c-weak').board(1, 2, 'c-weak');
    expect(playRule(full, 'summonFallback')).toBeNull();
  });
});

describe('utility (step 7, D-085)', () => {
  it('casts a draw spell first, then sets a trap, in the configured order', () => {
    const sc = scene().hand(1, 'c-case', 'c-ledger');
    expect(playRule(sc, 'utility')).toBe('cast c-ledger > -');
    expect(playRule(scene().hand(1, 'c-case'), 'utility')).toBe('trap c-case');
  });

  it('sets a trap outside the preference list when nothing else is left (judgment call)', () => {
    expect(playRule(scene().hand(1, 'c-extra-trap'), 'utility')).toBe('trap c-extra-trap');
  });

  it('"pass" ends the list, so later steps never run', () => {
    const ai = withAi((a) => {
      ((a['params'] as Record<string, Record<string, unknown>>)['utility'] as Record<string, unknown>)['order'] = ['pass', 'setTrap'];
    });
    expect(playRule(scene().hand(1, 'c-case'), 'utility', ai)).toBeNull();
  });

  it('a spell that is not draw-only is not a draw spell', () => {
    expect(playRule(scene().hand(1, 'c-forfeit').board(0, 0, 'p-small'), 'utility')).toBeNull();
  });

  it('order is data: trap first', () => {
    const ai = withAi((a) => {
      ((a['params'] as Record<string, Record<string, unknown>>)['utility'] as Record<string, unknown>)['order'] = ['setTrap', 'castDrawSpell', 'pass'];
    });
    expect(playRule(scene().hand(1, 'c-case', 'c-ledger'), 'utility', ai)).toBe('trap c-case');
  });
});

describe('the base block is a valid AI block', () => {
  it('parses', () => {
    expect(BASE_AI.play[0]).toBe('winThisTurn');
  });
});
