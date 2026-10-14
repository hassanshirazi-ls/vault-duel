// Pierce (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.5, D-039, D-040, D-124).
// Only against a guard-position defender (a revealed face-down one counts, since the reveal sets pos = guard):
// the excess Power over Guard is dealt to the defender's controller. The damage math lives in combat.ts.
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'pierce',
  name: 'Pierce',
  kind: 'keyword',
  icon: 'pierce', // not given in DESIGN.md (judgment call)
  visual: 'spear-notch-on-frame',
  text: "Power beyond the defender's Guard is dealt to its owner's life.",
  hooks: {
    beforeCombat: (ctx) => {
      // Pos 1 = guard (ARCHITECTURE.md §4).
      if (ctx.evt.attacker === ctx.self && ctx.combat.defPos === 1) ctx.setPierce();
    },
  },
});
