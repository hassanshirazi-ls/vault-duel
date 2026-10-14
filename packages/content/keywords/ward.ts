// Ward (DESIGN.md › Keywords and Flaws; ARCHITECTURE.md §8.4, D-034, D-035, D-044, D-133, D-134).
// A one-shot destruction replacement: the engine asks only the monster being destroyed, and a 'prevent' sets
// wardUsed, which switches off every beforeDestroy bit of that monster (D-133).
import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'ward',
  name: 'Ward',
  kind: 'keyword',
  icon: 'barrier',
  visual: 'pale-barrier',
  text: 'The first time it would be destroyed, it loses Ward instead.',
  hooks: { beforeDestroy: () => 'prevent' },
});
