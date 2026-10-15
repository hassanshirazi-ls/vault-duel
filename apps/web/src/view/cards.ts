// Card and monster view models, from engine queries and compiled content. Text is rendered through renderText (D-172).
import type { Engine, GameState, Iid } from '@vault-duel/engine';
import type { CardInfo, ElementInfo, GameCtx } from '../content/load';

export interface KeywordView {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly flaw: boolean;
  readonly text: string;
}

export interface CardView {
  readonly iid: Iid;
  readonly id: string;
  readonly name: string;
  readonly type: CardInfo['type'];
  readonly element: ElementInfo | null;
  readonly kind: string | null;
  readonly isChimera: boolean;
  /** printed Power/Guard for monsters (Chimera: the family's), null for spells and traps */
  readonly power: number | null;
  readonly guard: number | null;
  readonly keywords: readonly KeywordView[];
  readonly text: string | null;
}

/** Keyword and Flaw views for a keyword mask; bit i is `content.keywords[i]` (D-197). */
export function keywordViews(ctx: GameCtx, mask: number): KeywordView[] {
  const out: KeywordView[] = [];
  ctx.content.keywords.forEach((k, bit) => {
    if ((mask >>> bit) & 1) out.push({ id: k.id, name: k.name, icon: k.icon, flaw: k.kind === 'flaw', text: ctx.render(k.text) });
  });
  return out;
}

export function cardView(ctx: GameCtx, engine: Engine, state: GameState, iid: Iid): CardView {
  const inst = state.inst[iid];
  if (inst === undefined) throw new Error(`no instance ${iid}`);
  const id = ctx.content.ids[inst.def] as string;
  const info = ctx.cards.get(id);
  if (info === undefined) throw new Error(`no card info for ${id}`);
  const elementIdx = engine.elementOf(state, iid);
  const elementId = elementIdx >= 0 ? ctx.content.elementIds[elementIdx] : undefined;
  const kindIdx = engine.kindOf(state, iid);
  const kindId = kindIdx >= 0 ? ctx.content.kindIds[kindIdx] : undefined;
  const isMonster = info.type === 'monster' || info.type === 'family';
  return {
    iid,
    id,
    name: info.name,
    type: info.type,
    element: elementId === undefined ? null : (ctx.elements.get(elementId) ?? null),
    kind: kindId === undefined ? null : (ctx.kindNames.get(kindId) ?? kindId),
    isChimera: inst.chimera !== null,
    power: isMonster ? engine.effectivePower(state, iid) : null,
    guard: isMonster ? engine.effectiveGuard(state, iid) : null,
    keywords: keywordViews(ctx, engine.printedKeywords(state, iid)),
    text: info.text === null ? null : ctx.render(info.text),
  };
}

/** Deck-list line for a card id (home screen). */
export function deckLine(ctx: GameCtx, id: string): { name: string; type: CardInfo['type']; element: ElementInfo | null; text: string | null } {
  const info = ctx.cards.get(id);
  if (info === undefined) return { name: id, type: 'monster', element: null, text: null };
  return {
    name: info.name,
    type: info.type,
    element: info.element === null ? null : (ctx.elements.get(info.element) ?? null),
    text: info.text === null ? null : ctx.render(info.text),
  };
}
