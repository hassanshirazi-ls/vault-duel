// Slow Flaw (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.5, D-053, D-183).
// Restricts attacks until the monster has seen SLOW_TURNS of its controller's turns start after it entered. With the
// launch value SLOW_TURNS = 1 that is the summon turn only, exactly as written. Proposal M-01 (SLOW_TURNS = 2) is
// honoured by ownTurnsSinceEntered, so the lever changes behaviour without a code change (D-183).
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'slow',
  name: 'Slow',
  kind: 'flaw',
  icon: 'slow', // not given in DESIGN.md (judgment call)
  visual: 'slow-frame', // not given in DESIGN.md (judgment call)
  text: 'Cannot attack the turn it is summoned.',
  hooks: {
    attackPermission: (q) => (q.ownTurnsSinceEntered(q.self) < q.g.SLOW_TURNS ? { restrict: 'none' } : {}),
  },
  examples: [
    `
card ex-relic C ember beast 4/2 slow
turn 3
step attack
C board [ex-relic A new]
expect illegal attack C0 > face
do end
do end
expect legal attack C0 > face
`,
  ],
});
