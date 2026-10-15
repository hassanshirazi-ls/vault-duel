// Loads the live content with the run's `--set` overrides applied (ARCHITECTURE.md §11, §15). Every worker and the
// main thread build the same context from the same override list, so they agree on the compiled content and globals.
import { compileContent, DEFAULT_GLOBALS, KEYWORDS, parseContent, RAW_CONTENT, formatError, withOverrides } from '@vault-duel/content';
import type { GameContent } from '@vault-duel/content';
import type { Globals } from '@vault-duel/engine';
import type { DayContext } from '@vault-duel/ai';

export interface SimContext extends DayContext {
  /** the overrides that were applied, in order */
  readonly sets: readonly string[];
}

/** Throws OverridesError for a bad `--set`, and Error listing every content problem if the content does not parse. */
export function loadContext(sets: readonly string[]): SimContext {
  const globals: Globals = withOverrides(DEFAULT_GLOBALS, sets);
  const load = parseContent(RAW_CONTENT);
  if (load.errors.length > 0) throw new Error(`content does not parse:\n${load.errors.map(formatError).join('\n')}`);
  const content: GameContent = compileContent(load.data, KEYWORDS, globals);
  const objectives = load.data.objectives ?? [];
  return { content, globals, objectiveIds: objectives.map((o) => o.id), sets };
}
