// Vain Flaw (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.5, D-052, D-091).
// The engine blocks endTurn while a Vain monster in attack position has a legal attack (D-052); the Collector AI
// chooses the target (ai/collector/best-target.ts). This hook only declares the obligation.
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'vain',
  name: 'Vain',
  kind: 'flaw',
  icon: 'vain', // not given in DESIGN.md (judgment call)
  visual: 'vain-frame', // not given in DESIGN.md (judgment call)
  text: 'Must attack if able, choosing the best legal target.',
  hooks: { mustAttack: () => true },
});
