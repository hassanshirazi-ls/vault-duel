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
  text: 'Enemy attacks in its lane and in the lanes within {SENTINEL_REACH|lane|lanes} of it must target it.',
  hooks: { restrictTargets: () => true },
  examples: [
    `
card ex-striker P ember beast 3/2
card ex-plain P tide beast 2/2
card ex-sentinel P tide beast 2/3 sentinel
step attack
P board [ex-striker A]
C board [ex-plain A] [ex-sentinel G]
expect illegal attack P0 > C0
expect legal attack P0 > C1
`,
  ],
});
