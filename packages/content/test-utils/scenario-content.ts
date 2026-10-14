// scenarioContent (D-169, D-193): CompiledContent for a content-side scenario or keyword example. It holds the live
// elements, kinds, Chimera recipes and KEYWORDS, plus only the scenario's declared cards and the reserved filler
// card. No live player or Collector card is included, so a scenario depends on its own declarations. Run it under
// TEST_GLOBALS. Built with the engine's board-DSL builder, so the declarations are validated the same way.
import type { CompiledContent } from '@vault-duel/engine';
import { withDeclared, type DeclaredCard } from '@vault-duel/engine/test-utils/board-dsl';
import { buildContent, DSL_FILLER_ID, dslFillerSpec } from '@vault-duel/engine/test-utils/content-builder';
import type { ContentSpec, DefSpec } from '@vault-duel/engine/test-utils/content-builder';
import { KEYWORDS } from '../keywords/index.gen';
import { RAW_CONTENT } from '../src/data';
import { parseContent } from '../src/files';

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`scenarioContent: ${what} is missing`);
  return value;
}

/** Content with the live vocabulary and recipes, the declared cards, and the reserved filler (D-193). */
export function scenarioContent(declared: readonly DeclaredCard[]): CompiledContent {
  if (declared.some((card) => card.id === DSL_FILLER_ID)) {
    throw new Error(`scenarioContent: card '${DSL_FILLER_ID}' is reserved for the filler (D-193)`);
  }
  const live = parseContent(RAW_CONTENT).data;
  const elements = need(live.elements, 'elements.json');
  const kinds = need(live.kinds, 'kinds.json');
  const recipes = need(live.recipes, 'recipes.json');
  const vocabulary = {
    elements: elements.map((element) => ({ id: element.id, beats: element.beats })),
    kinds: kinds.map((kind) => kind.id),
  };
  const families: DefSpec[] = recipes.map((recipe) => ({
    id: recipe.id,
    type: 'family',
    power: recipe.power,
    guard: recipe.guard,
  }));
  const base: ContentSpec = {
    ...vocabulary,
    recipes: recipes.map((recipe) => ({ kinds: recipe.kinds, family: recipe.id })),
    keywords: KEYWORDS,
    defs: [...families, dslFillerSpec(vocabulary)],
  };
  return buildContent(withDeclared(base, declared));
}
