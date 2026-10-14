// Covetous Flaw (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.5, D-054, D-055, D-114).
// Only the Collector's ace can carry it (validator rule, collector.json › ace). It makes the summon a
// sacrifice of an Appraised monster on the Collector's board or in its vault, so only summonCovetous is legal.
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'covetous',
  name: 'Covetous',
  kind: 'flaw',
  icon: 'covetous', // not given in DESIGN.md (judgment call)
  visual: 'covetous-frame', // not given in DESIGN.md (judgment call)
  text: 'Can only be summoned by sacrificing a monster he acquired through Appraisal (ace only).',
  hooks: {
    summonRequirement: () => ({ kind: 'sacrifice', appraised: true, zones: ['board', 'vault'] }),
  },
  examples: [
    `
card ex-stolen P ember beast 3/3
card ex-covetous C ember beast 5/3 covetous
turn 3
step main
C hand ex-covetous
C vault [ex-stolen appraised]
expect illegal summon ex-covetous A
expect legal covetous ex-covetous sac vault:ex-stolen A
`,
  ],
});
