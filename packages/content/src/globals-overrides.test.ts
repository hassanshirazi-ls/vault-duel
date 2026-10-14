// withOverrides and GlobalsSchema (ARCHITECTURE.md §11, D-147): "KEY=VALUE" and "FLAGS.KEY=VALUE" overrides are
// JSON-parsed, unknown keys are rejected, the merged object is schema-checked and returned deep-frozen.
import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBALS, withOverrides } from './globals';
import { GlobalsSchema } from './schemas/globals';

describe('withOverrides', () => {
  it('returns the base values unchanged when there are no overrides', () => {
    expect(withOverrides(DEFAULT_GLOBALS, [])).toStrictEqual(DEFAULT_GLOBALS);
  });

  it('applies numbers, booleans, arrays and bare words', () => {
    const g = withOverrides(DEFAULT_GLOBALS, [
      'PLAYER_LIFE=18',
      'FLAGS.ASCEND=false',
      'APPRAISAL_ROUNDS=[3,6]',
      'UNSTABLE_EXPIRY=startOfOwnTurnAfterNext',
      'SEED_WINRATE_MIN=0.25',
    ]);
    expect(g.PLAYER_LIFE).toBe(18);
    expect(g.FLAGS.ASCEND).toBe(false);
    expect(g.FLAGS.UNSTABLE).toBe(true);
    expect([...g.APPRAISAL_ROUNDS]).toEqual([3, 6]);
    expect(g.UNSTABLE_EXPIRY).toBe('startOfOwnTurnAfterNext');
    expect(g.SEED_WINRATE_MIN).toBe(0.25);
  });

  it('applies later overrides after earlier ones', () => {
    expect(withOverrides(DEFAULT_GLOBALS, ['PLAYER_LIFE=18', 'PLAYER_LIFE=12']).PLAYER_LIFE).toBe(12);
  });

  it('returns a deep-frozen object and leaves the base untouched', () => {
    const g = withOverrides(DEFAULT_GLOBALS, ['HAND_SIZE=4']);
    expect(Object.isFrozen(g)).toBe(true);
    expect(Object.isFrozen(g.FLAGS)).toBe(true);
    expect(DEFAULT_GLOBALS.HAND_SIZE).toBe(5);
  });

  it('rejects an unknown key', () => {
    expect(() => withOverrides(DEFAULT_GLOBALS, ['NOT_A_KEY=1'])).toThrow('globals.ts › NOT_A_KEY › unknown key');
  });

  it('rejects an unknown flag', () => {
    expect(() => withOverrides(DEFAULT_GLOBALS, ['FLAGS.NOPE=true'])).toThrow('globals.ts › FLAGS.NOPE › unknown flag');
  });

  it('rejects a set without "=" and a value of the wrong type', () => {
    expect(() => withOverrides(DEFAULT_GLOBALS, ['PLAYER_LIFE'])).toThrow('not in KEY=VALUE form');
    expect(() => withOverrides(DEFAULT_GLOBALS, ['PLAYER_LIFE=eighteen'])).toThrow('globals.ts › PLAYER_LIFE ›');
    expect(() => withOverrides(DEFAULT_GLOBALS, ['FLAGS.ASCEND=1'])).toThrow('globals.ts › FLAGS › ASCEND: ');
  });

  it('validates the merged object with GlobalsSchema, sanity checks included', () => {
    expect(() => withOverrides(DEFAULT_GLOBALS, ['WARD_CHARGES=2'])).toThrow('D-133');
    expect(() => withOverrides(DEFAULT_GLOBALS, ['APPRAISAL_ROUNDS=[13]'])).toThrow(
      'globals.ts › APPRAISAL_ROUNDS › round 13 > MAX_ROUNDS=12 › remove it',
    );
    expect(() => withOverrides(DEFAULT_GLOBALS, ['TARGET_EXPERT_WINRATE=[0.6,0.4]'])).toThrow('min 0.6 > max 0.4');
  });
});

describe('GlobalsSchema', () => {
  it('accepts the default globals', () => {
    expect(GlobalsSchema.safeParse(DEFAULT_GLOBALS).success).toBe(true);
  });

  it('rejects a missing key and an extra key', () => {
    const rest: Record<string, unknown> = { ...DEFAULT_GLOBALS };
    delete rest['PLAYER_LIFE'];
    expect(GlobalsSchema.safeParse(rest).success).toBe(false);
    expect(GlobalsSchema.safeParse({ ...DEFAULT_GLOBALS, EXTRA: 1 }).success).toBe(false);
  });
});
