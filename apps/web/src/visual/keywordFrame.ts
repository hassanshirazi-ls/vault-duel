// Which keyword frame a card wears (D-238): the higher-priority keyword's frame, both glyphs. Priority is a list of
// keyword ids; anything not listed ranks below it, in the order the card carries them. Flaws rank last and show
// their own frame only when the card has no keyword (Relics carry exactly one Flaw, so that is the usual case).
import type { KeywordView } from '../view/cards';

export const FRAME_PRIORITY: readonly string[] = ['sentinel', 'ward'];

export interface Frame {
  /** `KeywordDef.visual` of the winning keyword; null for a plain frame */
  readonly visual: string | null;
  readonly flawVisual: string | null;
  /** every glyph to draw in the corner, frame keyword first */
  readonly glyphs: readonly KeywordView[];
}

function rank(k: KeywordView): number {
  if (k.flaw) return FRAME_PRIORITY.length + 1;
  const i = FRAME_PRIORITY.indexOf(k.id);
  return i < 0 ? FRAME_PRIORITY.length : i;
}

export function frameFor(keywords: readonly KeywordView[]): Frame {
  const sorted = [...keywords].sort((a, b) => rank(a) - rank(b)); // stable: ties keep the card's order
  const top = sorted.find((k) => !k.flaw);
  const flaw = sorted.find((k) => k.flaw);
  return { visual: top?.visual ?? null, flawVisual: flaw?.visual ?? null, glyphs: sorted };
}
