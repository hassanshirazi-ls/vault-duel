// Drift guard for the engine's test globals (D-143). The engine copies the ARCHITECTURE.md §11 values into
// test-utils/globals.ts so it never imports content; this test fails if the copy and DEFAULT_GLOBALS diverge.
import { describe, expect, it } from 'vitest';
import { TEST_GLOBALS } from '@vault-duel/engine/test-utils/globals';
import { DEFAULT_GLOBALS } from './globals';

describe('engine TEST_GLOBALS against DEFAULT_GLOBALS (D-143)', () => {
  it('equals the real globals once the content version is aligned, FLAGS included', () => {
    expect({ ...TEST_GLOBALS, CONTENT_VERSION: DEFAULT_GLOBALS.CONTENT_VERSION }).toStrictEqual(DEFAULT_GLOBALS);
  });

  it('marks its content version as a fixture', () => {
    expect(TEST_GLOBALS.CONTENT_VERSION).toBe(DEFAULT_GLOBALS.CONTENT_VERSION + '-fixture');
  });
});
