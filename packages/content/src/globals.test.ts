// DEFAULT_GLOBALS (ARCHITECTURE.md §11, D-168): the schema accepts it, and the rule levers keep their DESIGN values.
// No tuning value is pinned here: those are checked by content:check and by the sim (D-166, D-168).
import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBALS as G } from './globals';
import { GlobalsSchema } from './schemas/globals';

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
});
