// Swift (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.5, D-041, D-042).
// On its summon turn it may attack monsters but not life directly. The round-1 player ban (D-042) still wins
// because the engine applies it before any grant.
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'swift',
  name: 'Swift',
  kind: 'keyword',
  icon: 'swift', // not given in DESIGN.md (judgment call)
  visual: 'motion-streaks',
  text: 'Can attack monsters the turn it is summoned, but not life directly.',
  hooks: {
    attackPermission: (q) => (q.enteredThisTurn(q.self) ? { grant: 'monstersOnly' } : {}),
  },
  examples: [
    `
card ex-swift P ember beast 3/2 swift
card ex-wall P gale beast 1/3
step attack
P board [ex-swift A new]
C board [ex-wall G]
expect legal attack P0 > C0
`,
    `
card ex-swift P ember beast 3/2 swift
card ex-runner P gale beast 2/1
step attack
P board [ex-swift A new] [ex-runner A]
expect illegal attack P0 > face
expect legal attack P1 > face
`,
  ],
});
