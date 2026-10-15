// What the AI needs besides a state: the compiled content (with its `collector.json › ai` block, D-210), the globals,
// and an engine. The engine answers legality, every rule query (stats, keywords, combat previews: ARCHITECTURE.md
// §8.7) and every look-ahead (src/shared/look-ahead.ts). The AI keeps no copy of a rule (D-209).
import { createEngine } from '@vault-duel/engine';
import type { Engine, Globals } from '@vault-duel/engine';
import type { GameContent } from '@vault-duel/content';

export interface Brain {
  readonly content: GameContent;
  readonly globals: Globals;
  /** Legality, queries and look-ahead only. It never plays a real duel, so its intent policy is never called. */
  readonly engine: Engine;
}

export function createBrain(content: GameContent, globals: Globals): Brain {
  return {
    content,
    globals,
    engine: createEngine(content, globals, { intent: () => 'guard' }, { events: false, log: false, trusted: true }),
  };
}
