// Echo (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.5, D-046, D-140).
// Returns the destroyed card from its owner's discard to its owner's hand. Fires on any destruction; a sacrifice
// does not call onDestroyed, so Echo does not fire on Graft or Covetous sacrifice (D-054).
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'echo',
  name: 'Echo',
  kind: 'keyword',
  icon: 'echo', // not given in DESIGN.md (judgment call)
  visual: 'faded-double-image',
  text: "When destroyed, return it to its owner's hand.",
  hooks: {
    onDestroyed: (ctx) => {
      if (ctx.evt.iid !== ctx.self) return;
      ctx.effect({ op: 'returnToHand', target: 'self' });
    },
  },
});
