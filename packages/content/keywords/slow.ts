// Slow Flaw (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.5, D-053 PROPOSAL).
// Restricts attacks on the summon turn, exactly as written. Under D-022 that is already true for every monster,
// so this is a no-op until the owner decides on proposal M-01 (SLOW_TURNS = 2). The hook reads the
// enteredThisTurn query, so it cannot honour SLOW_TURNS > 1 yet (see report).
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'slow',
  name: 'Slow',
  kind: 'flaw',
  icon: 'slow', // not given in DESIGN.md (judgment call)
  visual: 'slow-frame', // not given in DESIGN.md (judgment call)
  text: 'Cannot attack the turn it is summoned.',
  hooks: {
    attackPermission: (q) => (q.enteredThisTurn(q.self) ? { restrict: 'none' } : {}),
  },
});
