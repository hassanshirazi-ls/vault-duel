// Tethered Flaw (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.5, D-051).
// A static Power modifier while its controller has exactly one monster on the board (vault monsters do not count).
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'tethered',
  name: 'Tethered',
  kind: 'flaw',
  icon: 'tethered', // not given in DESIGN.md (judgment call)
  visual: 'tethered-frame', // not given in DESIGN.md (judgment call)
  text: '−{TETHERED_PENALTY} Power while it is his only monster.',
  hooks: {
    staticPower: (q) => (q.monsters(q.side).length === 1 ? -q.g.TETHERED_PENALTY : 0),
  },
});
