// The bond options model (D-313, D-320): what the Bond options sheet and the Split preview draw. It reads the engine's
// `bondOptions(state)` (facts: result stats, keywords, slots, Appraisal exposure) and turns ids into names, gems and
// short sentences. It decides nothing about rules: performing an option replays its `steps`, each one a member of the
// legal list (store `performBond`). Many Graft options are folded into families (the same result), so the list stays short.
import type { Action, BondKind, BondOption, BondPreview, BondResultMonster, Engine, GameState, Iid } from '@vault-duel/engine';
import type { ElementInfo, GameCtx } from '../content/load';
import { keywordViews } from './cards';
import type { KeywordView } from './cards';
import { lanesOn } from './lanes';
import type { BondRank, BondRanking } from './rank';

export interface PartView {
  readonly iid: Iid;
  readonly name: string;
  readonly element: ElementInfo | null;
  readonly power: number;
  readonly guard: number;
  readonly keywords: readonly KeywordView[];
  /** "Lane 2" / "Slot 2" / "Hand" */
  readonly place: string;
  readonly inHand: boolean;
  readonly symbiote: string | null;
  readonly canAttack: boolean;
}

export interface ExposureView {
  readonly safe: boolean;
  readonly icon: 'check' | 'gavel';
  readonly text: string;
}

export interface MaterialView {
  readonly iid: Iid;
  readonly name: string;
  readonly element: ElementInfo | null;
  readonly from: 'hand' | 'board';
}

export interface DeltaChip {
  readonly icon: string;
  readonly text: string;
}

export interface BondRowView {
  readonly id: string;
  readonly kind: BondKind;
  readonly option: BondOption;
  readonly title: string;
  readonly parts: readonly PartView[];
  /** graft: the materials in order; split: the Chimera that comes apart; symbiosis: the attached card */
  readonly materials: readonly MaterialView[];
  /** symbiosis: what the host gains */
  readonly gains: readonly string[];
  readonly exposure: ExposureView;
  readonly deltas: readonly DeltaChip[];
  readonly cost: string;
  readonly rank: BondRank | null;
}

export interface BondFamily {
  readonly key: string;
  readonly head: BondRowView;
  readonly rows: readonly BondRowView[];
}

export interface BondGroupView {
  readonly kind: BondKind;
  readonly label: string;
  readonly icon: string;
  readonly families: readonly BondFamily[];
  readonly count: number;
}

export interface BondView {
  readonly groups: readonly BondGroupView[];
  /** the best row overall (by the ranking hint), or null when nothing is ranked */
  readonly best: BondRowView | null;
  readonly empty: boolean;
}

export const BOND_LABEL: Readonly<Record<BondKind, string>> = { graft: 'Graft', split: 'Split', symbiosis: 'Symbiosis' };
export const BOND_ICON: Readonly<Record<BondKind, string>> = { graft: 'swap', split: 'split', symbiosis: 'link' };

/** Is this action one the player may take now? Compared by value: the steps come from a separate engine query. */
export function sameAction(a: Action, b: Action): boolean {
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  const ks = Object.keys(x);
  return ks.length === Object.keys(y).length && ks.every((k) => x[k] === y[k]);
}

function nameOf(ctx: GameCtx, state: GameState, iid: Iid): string {
  const inst = state.inst[iid];
  const id = inst === undefined ? undefined : ctx.content.ids[inst.def];
  return (id === undefined ? undefined : ctx.cards.get(id)?.name) ?? 'a card';
}

function defName(ctx: GameCtx, def: number): string {
  const id = ctx.content.ids[def];
  return (id === undefined ? undefined : ctx.cards.get(id)?.name) ?? 'a card';
}

function elementOfIdx(ctx: GameCtx, idx: number): ElementInfo | null {
  const id = ctx.content.elementIds[idx];
  return id === undefined ? null : (ctx.elements.get(id) ?? null);
}

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

function partOf(ctx: GameCtx, state: GameState, r: BondResultMonster): PartView {
  const where = lanesOn(ctx.globals) ? 'Lane' : 'Slot';
  return {
    iid: r.iid,
    // a new Chimera has no instance in `state` yet, so the name comes from the result's own definition
    name: defName(ctx, r.def),
    element: elementOfIdx(ctx, r.element),
    power: r.power,
    guard: r.guard,
    keywords: keywordViews(ctx, r.kw),
    place: r.slot < 0 ? 'Hand' : `${where} ${r.slot + 1}`,
    inHand: r.slot < 0,
    symbiote: r.symbiote >= 0 ? nameOf(ctx, state, r.symbiote) : null,
    canAttack: r.canAttackThisTurn,
  };
}

function exposureOf(ctx: GameCtx, state: GameState, o: BondOption): ExposureView {
  const e = o.exposure;
  if (e.nextRound < 0) return { safe: true, icon: 'check', text: 'No Appraisal left' };
  if (e.target < 0) return { safe: true, icon: 'check', text: 'Safe from Appraisal' };
  const mine = o.result.some((r) => r.iid === e.target);
  if (!mine) return { safe: true, icon: 'check', text: `Safe from Appraisal (${nameOf(ctx, state, e.target)} is the target)` };
  const when = e.turnsAway === 0 ? `round ${e.nextRound}, next` : `round ${e.nextRound}`;
  return { safe: false, icon: 'gavel', text: `Exposed in ${when}${e.cardsLost === 2 ? ': both cards go' : ''}` };
}

function rowOf(ctx: GameCtx, engine: Engine, state: GameState, o: BondOption, rank: BondRank | null): BondRowView {
  const parts = o.result.map((r) => partOf(ctx, state, r));
  const first = o.steps[0] as Action;
  let title = parts[0]?.name ?? BOND_LABEL[o.kind];
  const materials: MaterialView[] = [];
  const gains: string[] = [];
  if (o.kind === 'graft') {
    for (const a of o.steps) {
      if (a.t !== 'graftPick') continue;
      const inst = state.inst[a.m];
      const elIdx = inst === undefined ? -1 : engine.elementOf(state, a.m);
      materials.push({ iid: a.m, name: nameOf(ctx, state, a.m), element: elementOfIdx(ctx, elIdx), from: state.sides[0].hand.includes(a.m) ? 'hand' : 'board' });
    }
  } else if (o.kind === 'split' && first.t === 'split') {
    const elIdx = engine.elementOf(state, first.m);
    materials.push({ iid: first.m, name: nameOf(ctx, state, first.m), element: elementOfIdx(ctx, elIdx), from: 'board' });
    title = `Split ${nameOf(ctx, state, first.m)}`;
  } else if (o.kind === 'symbiosis' && first.t === 'symbiose') {
    const elIdx = engine.elementOf(state, first.c);
    materials.push({ iid: first.c, name: nameOf(ctx, state, first.c), element: elementOfIdx(ctx, elIdx), from: 'hand' });
    const host = o.result[0];
    if (host !== undefined) {
      title = `${nameOf(ctx, state, first.c)} under ${nameOf(ctx, state, host.iid)}`;
      const gd = host.guard - engine.effectiveGuard(state, host.iid);
      if (gd !== 0) gains.push(`${signed(gd)} Guard`);
      const had = engine.printedKeywords(state, host.iid);
      for (const k of keywordViews(ctx, host.kw & ~had)) gains.push(k.name);
    }
  }
  const deltas: DeltaChip[] = [];
  if (o.boardPowerDelta !== 0) deltas.push({ icon: 'sword', text: `${signed(o.boardPowerDelta)} Power on board` });
  if (o.boardGuardDelta !== 0) deltas.push({ icon: 'shield', text: `${signed(o.boardGuardDelta)} Guard on board` });
  if (o.bodiesDelta !== 0) deltas.push({ icon: 'pos', text: `${signed(o.bodiesDelta)} ${Math.abs(o.bodiesDelta) === 1 ? 'monster' : 'monsters'}` });
  const cost = o.usesPlay ? 'Uses your card play' : '';
  return { id: o.id, kind: o.kind, option: o, title, parts, materials, gains, exposure: exposureOf(ctx, state, o), deltas, cost, rank };
}

const rankOf = (r: BondRowView): number => r.rank?.score ?? Number.NEGATIVE_INFINITY;

/** The families of Graft: same result (family, element, stats, keywords), different ways to make it. */
const familyKey = (r: BondRowView): string => {
  const p = r.parts[0];
  return p === undefined ? r.id : `${p.name}|${p.element?.id ?? ''}|${p.power}|${p.guard}|${p.keywords.map((k) => k.id).join(',')}`;
};

export function bondView(ctx: GameCtx, engine: Engine, state: GameState, preview: BondPreview, ranking: BondRanking): BondView {
  const rows = preview.options.map((o) => rowOf(ctx, engine, state, o, ranking.scores.get(o.id) ?? null));
  const byKind = (k: BondKind): BondRowView[] => rows.filter((r) => r.kind === k);
  const groups: BondGroupView[] = [];
  for (const kind of ['graft', 'split', 'symbiosis'] as const) {
    const list = byKind(kind);
    if (list.length === 0) continue;
    const map = new Map<string, BondRowView[]>();
    for (const r of list) {
      const k = kind === 'graft' ? familyKey(r) : r.id;
      const cur = map.get(k);
      if (cur === undefined) map.set(k, [r]);
      else cur.push(r);
    }
    const families = [...map.entries()].map(([key, fam]): BondFamily => {
      const sorted = [...fam].sort((a, b) => rankOf(b) - rankOf(a) || b.option.boardPowerDelta - a.option.boardPowerDelta);
      return { key, head: sorted[0] as BondRowView, rows: sorted };
    });
    families.sort((a, b) => rankOf(b.head) - rankOf(a.head) || (b.head.parts[0]?.power ?? 0) - (a.head.parts[0]?.power ?? 0));
    groups.push({ kind, label: BOND_LABEL[kind], icon: BOND_ICON[kind], families, count: list.length });
  }
  const best = ranking.bestId === null ? null : (rows.find((r) => r.id === ranking.bestId) ?? null);
  return { groups, best, empty: rows.length === 0 };
}
