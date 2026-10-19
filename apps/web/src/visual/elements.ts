// Elements are CSS tokens keyed by element id (style/tokens.css): --el-pat-<id> is the ink pattern that stands for the
// element (D-351, no color), --el-<id> and --el-on-<id> a single tone and the ink drawn on it. A new element is one
// token entry there; an id with no entry resolves to the neutral token through the var() fallback (D-238).
import type { CSSProperties } from 'react';

const SAFE_ID = /^[a-z0-9-]+$/;

/** The `var()` expression for an element's gem color. Unknown or missing ids fall back to the neutral token. */
export function elementColorVar(id: string | null | undefined): string {
  return id !== null && id !== undefined && SAFE_ID.test(id) ? `var(--el-${id}, var(--el-neutral))` : 'var(--el-neutral)';
}

/** The ink drawn on top of the gem (icon, stat text), picked per element for contrast. */
export function elementInkVar(id: string | null | undefined): string {
  return id !== null && id !== undefined && SAFE_ID.test(id) ? `var(--el-on-${id}, var(--el-on-neutral))` : 'var(--el-on-neutral)';
}

/** The `var()` expression for an element's ink pattern (a background-image value). Unknown or missing ids get the neutral pattern. */
export function elementPatternVar(id: string | null | undefined): string {
  return id !== null && id !== undefined && SAFE_ID.test(id) ? `var(--el-pat-${id}, var(--el-pat-neutral))` : 'var(--el-pat-neutral)';
}

/** Inline custom properties that scope `--el`, `--el-on` and `--elp` (the pattern) to a card, badge or plaque. */
export function elementStyle(id: string | null | undefined): CSSProperties {
  return { '--el': elementColorVar(id), '--el-on': elementInkVar(id), '--elp': elementPatternVar(id) } as CSSProperties;
}
