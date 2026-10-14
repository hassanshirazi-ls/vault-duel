// The engine's fixture globals (D-168) are independent of DEFAULT_GLOBALS. The content side checks only that they
// pass GlobalsSchema, which adds the sanity rules that TypeScript cannot express.
import { describe, expect, it } from 'vitest';
import { TEST_GLOBALS } from '@vault-duel/engine/test-utils/globals';
import { GlobalsSchema } from './schemas/globals';

describe('engine TEST_GLOBALS (D-168)', () => {
  it('passes GlobalsSchema', () => {
    expect(GlobalsSchema.safeParse(TEST_GLOBALS).success).toBe(true);
  });
});
