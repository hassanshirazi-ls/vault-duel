// Sentinel (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.4, §8.5, D-037, D-038).
// Face-up Sentinels on the defending board are the only legal targets. The engine applies the face-up check
// (D-037) and the "any of them" rule (D-038); this hook only marks the monster as a mandatory target.
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'sentinel',
  name: 'Sentinel',
  kind: 'keyword',
  icon: 'shield',
  visual: 'iron-shield-border',
  text: 'Enemy attacks must target Sentinels first.',
  hooks: { restrictTargets: () => true },
});
