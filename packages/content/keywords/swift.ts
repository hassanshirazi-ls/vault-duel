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
});
