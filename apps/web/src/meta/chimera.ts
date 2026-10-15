// The Binder's Chimera triangle (D-238): every unordered kind pair of the content's kinds, from recipes.json. Nothing
// is hard-coded to five kinds; a sixth kind in kinds.json grows the triangle.
import type { GameCtx, RecipeInfo } from '../content/load';

export interface FamilyCell {
  readonly row: number;
  readonly col: number;
  readonly kinds: readonly [string, string];
  readonly recipe: RecipeInfo | null;
}

/** Cells with col >= row, in row-major order: the upper triangle including the diagonal (same-kind pairs). */
export function familyCells(ctx: Pick<GameCtx, 'kindOrder' | 'recipes'>): FamilyCell[] {
  const order = ctx.kindOrder;
  const cells: FamilyCell[] = [];
  order.forEach((a, row) => {
    order.forEach((b, col) => {
      if (col < row) return;
      const recipe = ctx.recipes.find((r) => (r.kinds[0] === a && r.kinds[1] === b) || (r.kinds[0] === b && r.kinds[1] === a)) ?? null;
      cells.push({ row, col, kinds: [a, b], recipe });
    });
  });
  return cells;
}
