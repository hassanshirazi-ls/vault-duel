// Haunt (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.4, §8.5, D-045).
// Only its own destruction, only with a destroyer. The modifier fizzles unless the destroyer is still on the
// board after the batch (D-045), and a destruction by a spell, trap or Unstable expiry has by = -1.
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'haunt',
  name: 'Haunt',
  kind: 'keyword',
  icon: 'wisp',
  visual: 'ghost-wisps',
  text: 'When destroyed, the monster that destroyed it loses {HAUNT_PENALTY} Power permanently.',
  hooks: {
    onDestroyed: (ctx) => {
      if (ctx.evt.iid !== ctx.self || ctx.evt.by < 0) return;
      ctx.effect({
        op: 'modifyStats',
        target: 'destroyer',
        power: '-$HAUNT_PENALTY',
        duration: 'permanent',
        if: { onBoard: true },
      });
    },
  },
  examples: [
    `
card ex-haunt P ember beast 2/2 haunt
card ex-hammer C tide beast 5/1
turn 3
step attack
P board [ex-haunt G]
C board [ex-hammer A]
do attack C0 > P0
expect P0 empty
expect C0 power 3
`,
  ],
});
