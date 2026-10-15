// Card and monster view models, from engine queries and compiled content. Text is rendered through renderText (D-172).
import type { Engine, GameState, Iid } from '@vault-duel/engine';
import type { CardInfo, ElementInfo, GameCtx } from '../content/load';

export interface KeywordView {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  /** KeywordDef.visual (D-195): the frame treatment id */
  readonly visual: string;
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
  /** silhouette id for the placeholder art; chimeras get 'chimera', spells 'spell', traps 'trap' */
  readonly silhouette: string;
  readonly isChimera: boolean;
  readonly ascended: boolean;
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
    if ((mask >>> bit) & 1) out.push({ id: k.id, name: k.name, icon: k.icon, visual: k.visual, flaw: k.kind === 'flaw', text: ctx.render(k.text) });
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
  const silhouette =
    inst.chimera !== null ? 'chimera' : kindId !== undefined ? (ctx.kinds.get(kindId)?.silhouette ?? 'chimera') : info.type === 'family' ? 'chimera' : info.type;
  return {
    iid,
    id,
    name: info.name,
    type: info.type,
    element: elementId === undefined ? null : (ctx.elements.get(elementId) ?? null),
    kind: kindId === undefined ? null : (ctx.kindNames.get(kindId) ?? kindId),
    silhouette,
    isChimera: inst.chimera !== null,
    ascended: inst.chimera?.ascended === true,
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

/** "Beats" and "weak to" lines for the inspect sheet, from elements.json (the reverse of `beats` is the weakness). */
export function elementMatchups(ctx: GameCtx, id: string): { beats: ElementInfo[]; weakTo: ElementInfo[] } {
  const all = [...ctx.elements.values()];
  const me = ctx.elements.get(id);
  return {
    beats: all.filter((e) => me?.beats.includes(e.id) === true),
    weakTo: all.filter((e) => e.beats.includes(id)),
  };
}

/** A card by definition id, for places with no instance (the home plinth, the deck list). Printed values only. */
export function definitionView(ctx: GameCtx, id: string): CardView | null {
  const info = ctx.cards.get(id);
  const idx = ctx.content.index.get(id);
  if (info === undefined || idx === undefined) return null;
  const c = ctx.content;
  const isMonster = info.type === 'monster' || info.type === 'family';
  const elementId = c.elementIds[c.element[idx] ?? -1];
  const kindId = c.kindIds[c.kind[idx] ?? -1];
  return {
    iid: -1,
    id,
    name: info.name,
    type: info.type,
    element: elementId === undefined ? null : (ctx.elements.get(elementId) ?? null),
    kind: kindId === undefined ? null : (ctx.kindNames.get(kindId) ?? kindId),
    silhouette: kindId !== undefined ? (ctx.kinds.get(kindId)?.silhouette ?? 'chimera') : info.type === 'family' ? 'chimera' : info.type,
    isChimera: false,
    ascended: false,
    power: isMonster ? (c.power[idx] ?? 0) : null,
    guard: isMonster ? (c.guard[idx] ?? 0) : null,
    keywords: keywordViews(ctx, c.kw[idx] ?? 0),
    text: info.text === null ? null : ctx.render(info.text),
  };
}
