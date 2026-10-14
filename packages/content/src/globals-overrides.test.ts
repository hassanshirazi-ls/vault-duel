// withOverrides and GlobalsSchema (ARCHITECTURE.md §11, D-147, D-171): "KEY=VALUE", "FLAGS.KEY=VALUE" and content
// numbers by name are JSON-parsed, unknown keys are rejected, the merged object is schema-checked and returned
// deep-frozen. Each case uses the engine fixture as the base, so no live value is involved (D-168).
import { describe, expect, it } from 'vitest';
import { TEST_GLOBALS as BASE } from '@vault-duel/engine/test-utils/globals';
import { withOverrides } from './globals';
import { GlobalsSchema } from './schemas/globals';

const NUMBER = 'UNMAKE_MAX_POWER'; // a CONTENT_NUMBERS name in the engine fixture (D-171)

describe('withOverrides', () => {
  it('returns the base values unchanged when there are no overrides', () => {
    expect(withOverrides(BASE, [])).toStrictEqual(BASE);
  });

  it('applies numbers, booleans, arrays and bare words', () => {
    const g = withOverrides(BASE, [
      'PLAYER_LIFE=18',
      'FLAGS.ASCEND=false',
      'APPRAISAL_ROUNDS=[3,6]',
      'UNSTABLE_EXPIRY=startOfOwnTurnAfterNext',
      'SEED_WINRATE_MIN=0.25',
    ]);
    expect(g.PLAYER_LIFE).toBe(18);
    expect(g.FLAGS.ASCEND).toBe(false);
    expect(g.FLAGS.UNSTABLE).toBe(BASE.FLAGS.UNSTABLE);
    expect([...g.APPRAISAL_ROUNDS]).toEqual([3, 6]);
    expect(g.UNSTABLE_EXPIRY).toBe('startOfOwnTurnAfterNext');
    expect(g.SEED_WINRATE_MIN).toBe(0.25);
  });

  it('applies later overrides after earlier ones', () => {
    expect(withOverrides(BASE, ['PLAYER_LIFE=18', 'PLAYER_LIFE=12']).PLAYER_LIFE).toBe(12);
  });

  it('returns a deep-frozen object and leaves the base untouched', () => {
    const before = BASE.HAND_SIZE;
    const g = withOverrides(BASE, ['HAND_SIZE=4']);
    expect(Object.isFrozen(g)).toBe(true);
    expect(Object.isFrozen(g.FLAGS)).toBe(true);
    expect(BASE.HAND_SIZE).toBe(before);
  });

  it('routes NAME=V to CONTENT_NUMBERS when the name is there, and leaves the base untouched', () => {
    const before = BASE.CONTENT_NUMBERS[NUMBER];
    const g = withOverrides(BASE, [`${NUMBER}=${(before ?? 0) + 1}`]);
    expect(g.CONTENT_NUMBERS[NUMBER]).toBe((before ?? 0) + 1);
    expect(BASE.CONTENT_NUMBERS[NUMBER]).toBe(before);
  });

  it('accepts the explicit CONTENT_NUMBERS.NAME=V form', () => {
    expect(withOverrides(BASE, [`CONTENT_NUMBERS.${NUMBER}=7`]).CONTENT_NUMBERS[NUMBER]).toBe(7);
  });

  it('rejects an unknown key, including a whole CONTENT_NUMBERS record (a --set never adds a number)', () => {
    expect(() => withOverrides(BASE, ['NOT_A_KEY=1'])).toThrow('globals.ts › NOT_A_KEY › unknown key');
    expect(() => withOverrides(BASE, ['CONTENT_NUMBERS={"NEW_ONE":1}'])).toThrow('globals.ts › CONTENT_NUMBERS › unknown key');
    expect(() => withOverrides(BASE, ['CONTENT_NUMBERS.NEW_ONE=1'])).toThrow('globals.ts › CONTENT_NUMBERS.NEW_ONE › unknown key');
  });

  it('rejects an unknown flag', () => {
    expect(() => withOverrides(BASE, ['FLAGS.NOPE=true'])).toThrow('globals.ts › FLAGS.NOPE › unknown flag');
  });

  it('rejects a set without "=" and a value of the wrong type', () => {
    expect(() => withOverrides(BASE, ['PLAYER_LIFE'])).toThrow('not in KEY=VALUE form');
    expect(() => withOverrides(BASE, ['PLAYER_LIFE=eighteen'])).toThrow('globals.ts › PLAYER_LIFE ›');
    expect(() => withOverrides(BASE, ['FLAGS.ASCEND=1'])).toThrow('globals.ts › FLAGS › ASCEND: ');
  });

  it('validates the merged object with GlobalsSchema, sanity checks included', () => {
    expect(() => withOverrides(BASE, ['WARD_CHARGES=2'])).toThrow('D-133');
    expect(() => withOverrides(BASE, [`APPRAISAL_ROUNDS=[${BASE.MAX_ROUNDS + 1}]`])).toThrow(
      `globals.ts › APPRAISAL_ROUNDS › round ${BASE.MAX_ROUNDS + 1} > MAX_ROUNDS=${BASE.MAX_ROUNDS} › remove it`,
    );
    expect(() => withOverrides(BASE, ['TARGET_EXPERT_WINRATE=[0.6,0.4]'])).toThrow('min 0.6 > max 0.4');
  });
});

describe('GlobalsSchema', () => {
  it('rejects a missing key and an extra key', () => {
    const rest: Record<string, unknown> = { ...BASE };
    delete rest['PLAYER_LIFE'];
    expect(GlobalsSchema.safeParse(rest).success).toBe(false);
    expect(GlobalsSchema.safeParse({ ...BASE, EXTRA: 1 }).success).toBe(false);
  });

  it('rejects a CONTENT_NUMBERS name that repeats a core key', () => {
    const clash = { ...BASE, CONTENT_NUMBERS: { ...BASE.CONTENT_NUMBERS, PLAYER_LIFE: 3 } };
    expect(GlobalsSchema.safeParse(clash).success).toBe(false);
  });

  it('rejects a CONTENT_NUMBERS name that is not in capitals', () => {
    const lower = { ...BASE, CONTENT_NUMBERS: { ...BASE.CONTENT_NUMBERS, 'new-number': 3 } };
    expect(GlobalsSchema.safeParse(lower).success).toBe(false);
  });
});
