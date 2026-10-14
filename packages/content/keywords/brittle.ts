// Brittle Flaw (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.5, D-049, D-050, D-124).
// Only when the Brittle monster is the defender and the attacker has element advantage: setBrittleWin() makes
// the defender destroyed and the attacker survive (D-049). Ward can still prevent that destruction (D-050).
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'brittle',
  name: 'Brittle',
  kind: 'flaw',
  icon: 'brittle', // not given in DESIGN.md (judgment call)
  visual: 'brittle-frame', // not given in DESIGN.md (judgment call)
  text: 'Destroyed by any attack with element advantage, regardless of Power.',
  hooks: {
    beforeCombat: (ctx) => {
      if (ctx.evt.target === ctx.self && ctx.combat.advantage) ctx.setBrittleWin();
    },
  },
  examples: [
    `
card ex-brittle C ember beast 4/4 brittle
card ex-striker P tide beast 1/1
step attack
P board [ex-striker A]
C board [ex-brittle G]
do attack P0 > C0
expect C0 empty
expect P0 card ex-striker
`,
  ],
});
