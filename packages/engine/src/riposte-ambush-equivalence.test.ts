// D-337, D-338: with FLAGS.RIPOSTE and FLAGS.AMBUSH off the engine is the engine before them (the pinned digests in
// bond-equivalence.test.ts run with both off, since the fixture globals leave them off). With them on, whole duels stay
// deterministic: the same seed and walk give the same digest, and the rules differ from the off walk.
import { describe, expect, it } from 'vitest';
import { DUEL_GLOBALS } from '../test-utils/duel-fixture';
import { walkDigest } from '../test-utils/equivalence';
import { withGlobals } from '../test-utils/globals';

describe('Riposte and Ambush on', () => {
  const on = withGlobals({ ...DUEL_GLOBALS, FLAGS: { RIPOSTE: true, AMBUSH: true } });
  const off = withGlobals({ ...DUEL_GLOBALS, FLAGS: { RIPOSTE: false, AMBUSH: false } });
  it('walks are deterministic and differ from the off rules', () => {
    for (let n = 0; n < 4; n++) expect(walkDigest(on, n)).toBe(walkDigest(on, n));
    expect([0, 1, 2, 3].some((n) => walkDigest(on, n) !== walkDigest(off, n))).toBe(true);
  });
});
