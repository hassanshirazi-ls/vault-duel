// The numbers in DEFAULT_GLOBALS must equal the numbers in DESIGN.md's "Balance targets and globals" block.
import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBALS as G } from './globals';

describe('DEFAULT_GLOBALS against DESIGN.md', () => {
  it('matches the life, length and deck numbers', () => {
    expect([G.PLAYER_LIFE, G.COLLECTOR_LIFE, G.MAX_ROUNDS]).toEqual([20, 25, 12]);
    expect([G.HAND_SIZE, G.MAX_DRAW_PER_TURN, G.REDRAWS]).toEqual([5, 2, 1]);
    expect([G.BOARD_SLOTS, G.TRAP_SLOTS]).toEqual([3, 2]);
    expect([G.DECK_MONSTERS, G.DECK_SPELLS, G.DECK_TRAPS, G.MAX_COPIES]).toEqual([15, 5, 4, 2]);
    expect(G.PLAYER_DECK_SIZE).toBe(G.DECK_MONSTERS + G.DECK_SPELLS + G.DECK_TRAPS);
    expect(G.COLLECTOR_DECK_SIZE).toBe(G.COLLECTOR_DECK_MONSTERS + G.COLLECTOR_DECK_SPELLS + G.COLLECTOR_DECK_TRAPS);
  });

  it('matches the combat, Graft and keyword numbers', () => {
    expect([G.ELEMENT_BONUS, G.UNSTABLE_BONUS, G.ASCEND_POWER, G.ASCEND_GUARD]).toEqual([2, 3, 2, 1]);
    expect([G.MAX_GRAFT_MATERIALS, G.MAX_INHERITED_KEYWORDS]).toEqual([3, 2]);
    expect([G.HAUNT_PENALTY, G.TETHERED_PENALTY]).toEqual([2, 2]);
    expect(G.UNSTABLE_EXPIRY).toBe('endOfNextOwnTurn');
  });

  it('matches the Appraisal, mood and spell numbers', () => {
    expect([...G.APPRAISAL_ROUNDS]).toEqual([3, 6, 9]);
    expect([G.APPRAISAL_MIN_POWER, G.MOOD_AGITATED_AT, G.MOOD_DESPERATE_AT]).toEqual([7, 15, 7]);
    expect([G.UNMAKE_MAX_POWER, G.BLOODLUST_POWER, G.FORFEIT_MAX_POWER]).toEqual([5, 3, 4]);
    expect([G.GILT_POWER, G.GILT_GUARD, G.COUNTERFEIT_PENALTY, G.INSURANCE_HEAL]).toEqual([2, 2, 3, 3]);
  });

  it('matches the difficulty check and the stat budget', () => {
    expect([G.SIM_RUNS_PER_SEED, G.SEED_WINRATE_MIN, G.SEED_WINRATE_MAX]).toEqual([500, 0.3, 0.7]);
    expect([G.STAT_BUDGET_MIN, G.STAT_BUDGET_MAX, G.KEYWORD_COST]).toEqual([8, 10, 1]);
  });

  it('keeps the feature flags as DESIGN describes them', () => {
    expect(G.FLAGS.WEEKLY_TWIST).toBe(false);
    expect(G.FLAGS.ASCEND && G.FLAGS.UNSTABLE && G.FLAGS.APPRAISAL && G.FLAGS.MOODS && G.FLAGS.INTENTS).toBe(true);
    expect(G.FLAGS.REDRAW && G.FLAGS.BONUS_OBJECTIVES && G.FLAGS.ANIMATIONS).toBe(true);
    expect(G.FLAGS.DEBUG_OVERLAY).toBe(false);
  });
});
