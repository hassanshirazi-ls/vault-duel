// DEFAULT_GLOBALS (ARCHITECTURE.md §11, D-168): the schema accepts it, and the rule levers keep their DESIGN values.
// No tuning value is pinned here: those are checked by content:check and by the sim (D-166, D-168).
import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBALS as G } from './globals';
import { GlobalsSchema, globalsProblems } from './schemas/globals';

describe('DEFAULT_GLOBALS', () => {
  it('passes GlobalsSchema, sanity checks included', () => {
    expect(GlobalsSchema.safeParse(G).success).toBe(true);
  });
});

// Owner-only rule levers (D-166, D-168). They encode DESIGN rules, not tuning. Change them together with the
// D-entry that adopts an M-proposal.
describe('rule levers (owner-only, D-166, D-168)', () => {
  it('keeps the proposal levers at DESIGN as written', () => {
    expect(G.FLAGS.APPRAISED_ENTERS_GUARD).toBe(false);
    expect(G.FLAGS.ACE_SET_ASIDE).toBe(false);
    expect(G.FLAGS.CHIMERA_TO_HAND).toBe(true);
    expect(G.UNSTABLE_EXPIRY).toBe('endOfNextOwnTurn');
    expect(G.SLOW_TURNS).toBe(1);
  });

  it('keeps the bond rules off until the owner adopts them (D-305..D-316)', () => {
    expect(G.FLAGS.SPLIT).toBe(false);
    expect(G.FLAGS.SYMBIOSIS).toBe(false);
    expect(G.FLAGS.BOND_ACTION).toBe(false);
    expect(G.BOND_GRAFT_MAX_HAND_MATERIALS).toBe(G.MAX_GRAFT_MATERIALS); // 3 = no limit
  });
});

// Inert globals and ranges (D-170, D-199). The tests move each value off its own launch value, so they hold for any
// tuning and pin no value of their own.
describe('inert pins and ranges (D-170, D-199)', () => {
  const accepts = (over: Record<string, unknown>): boolean => GlobalsSchema.safeParse({ ...G, ...over }).success;

  it('accepts only the value the engine reads for each inert count', () => {
    for (const key of ['PLAYS_PER_TURN', 'REPOSITIONS_PER_TURN', 'ATTACKS_PER_TURN', 'MIN_GRAFT_MATERIALS', 'RELIC_FLAWS', 'BONDS_PER_TURN', 'SYMBIOTES_PER_HOST']) {
      expect(accepts({ [key]: G[key as keyof typeof G] }), key).toBe(true);
      expect(accepts({ [key]: (G[key as keyof typeof G] as number) + 1 }), key).toBe(false);
    }
  });

  it('lets SPLIT_PART_PERM_P go below zero, the one signed global (D-310)', () => {
    expect(accepts({ SPLIT_PART_PERM_P: -1 })).toBe(true);
    expect(accepts({ SPLIT_PART_PERM_P: 1.5 })).toBe(false);
    expect(accepts({ SYMBIOSIS_GUARD_BONUS: -1 })).toBe(false);
  });

  it('accepts only the set-aside flag value the engine reads (D-184)', () => {
    expect(accepts({ FLAGS: { ...G.FLAGS, ACE_SET_ASIDE: !G.FLAGS.ACE_SET_ASIDE } })).toBe(false);
  });

  it('keeps MAX_GRAFT_MATERIALS in the graft range and BOARD_SLOTS within the engine stride', () => {
    expect(accepts({ MAX_GRAFT_MATERIALS: 1 })).toBe(false);
    expect(accepts({ MAX_GRAFT_MATERIALS: 10 })).toBe(false);
    expect(accepts({ BOARD_SLOTS: G.BOARD_SLOTS + 100 })).toBe(false);
  });

  it('names the pinned key, the problem and the fix in §10.3 form', () => {
    const result = GlobalsSchema.safeParse({ ...G, PLAYS_PER_TURN: G.PLAYS_PER_TURN + 1 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const lines = globalsProblems(result.error).map((p) => `${p.key} › ${p.problem} › ${p.fix}`);
    expect(lines).toEqual([
      `PLAYS_PER_TURN › must be ${G.PLAYS_PER_TURN} until the engine supports other values › keep ${G.PLAYS_PER_TURN}`,
    ]);
  });
});
