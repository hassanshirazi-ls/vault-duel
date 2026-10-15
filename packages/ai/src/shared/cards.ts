// Card and monster records shared by the Collector view and the player view. Each is built from a full state but
// carries only what the viewing side may know: a face-down monster is never described by identity.
import { DefType, resolveNum } from '@vault-duel/engine';
import type { GameState, Iid, Monster } from '@vault-duel/engine';
import type { Brain } from './brain';

export type CardType = 'monster' | 'spell' | 'trap';

/** A card of his own, fully known to him. `power` and `guard` are printed (0 for spells and traps). */
export interface OwnCard {
  readonly iid: Iid;
  readonly id: string;
  readonly type: CardType;
  readonly power: number;
  readonly guard: number;
  readonly element: string | null;
  readonly kind: string | null;
  readonly keywords: readonly string[];
  readonly flaw: string | null;
  /** a spell whose every effect draws for him */
  readonly drawOnly: boolean;
  /** Power the spell gives its chosen target (0 if none); resolved from its `modifyStats` effects */
  readonly grantsPower: number;
}

export interface OwnMonster {
  readonly slot: number;
  readonly card: OwnCard;
  /** effective Power and Guard on the board now */
  readonly power: number;
  readonly guard: number;
  readonly pos: 'atk' | 'grd';
  readonly faceDown: boolean;
  readonly enteredThisTurn: boolean;
  readonly attacked: boolean;
  readonly wardActive: boolean;
  /** a keyword obliges it to attack if able (Vain) */
  readonly forced: boolean;
  readonly appraised: boolean;
}

/** What anyone can see of a card (a discard pile entry). */
export interface PublicCard {
  readonly id: string;
  readonly type: CardType;
}

export interface PublicMonster {
  readonly faceDown: false;
  readonly slot: number;
  readonly id: string;
  readonly element: string | null;
  readonly kind: string | null;
  readonly keywords: readonly string[];
  readonly power: number;
  readonly guard: number;
  readonly pos: 'atk' | 'grd';
  readonly wardActive: boolean;
}

export type FoeMonster = PublicMonster | { readonly faceDown: true; readonly slot: number };

export function typeOf(b: Brain, def: number): CardType {
  const t = b.content.type[def];
  return t === DefType.Spell ? 'spell' : t === DefType.Trap ? 'trap' : 'monster';
}

export function keywordIds(b: Brain, mask: number): { keywords: string[]; flaw: string | null } {
  const keywords: string[] = [];
  let flaw: string | null = null;
  for (let bit = 0; bit < b.content.keywords.length; bit++) {
    if ((mask & (1 << bit)) === 0) continue;
    const k = b.content.keywords[bit];
    if (k === undefined) continue;
    if (k.kind === 'flaw') flaw = k.id;
    else keywords.push(k.id);
  }
  return { keywords, flaw };
}

export function ownCard(b: Brain, s: GameState, iid: Iid): OwnCard {
  const inst = s.inst[iid] as GameState['inst'][number];
  const c = b.content;
  const type = typeOf(b, inst.def);
  const { keywords, flaw } = keywordIds(b, b.mirror.printedKw(s, iid));
  const el = b.mirror.element(s, iid);
  const kd = b.mirror.kind(s, iid);
  const spell = c.spell[inst.def] ?? null;
  let drawOnly = false;
  let grantsPower = 0;
  if (spell !== null) {
    drawOnly = spell.effects.length > 0 && spell.effects.every((e) => e.op === 'draw' && e.who === 'self');
    for (const e of spell.effects) {
      if (e.op === 'modifyStats' && e.target === 'chosen' && e.power !== undefined && e.if === undefined) {
        grantsPower += resolveNum(b.globals, e.power);
      }
    }
  }
  return {
    iid,
    id: c.ids[inst.def] as string,
    type,
    power: type === 'monster' ? (c.power[inst.def] ?? 0) : 0,
    guard: type === 'monster' ? (c.guard[inst.def] ?? 0) : 0,
    element: el >= 0 ? (c.elementIds[el] ?? null) : null,
    kind: kd >= 0 ? (c.kindIds[kd] ?? null) : null,
    keywords,
    flaw,
    drawOnly,
    grantsPower,
  };
}

export function ownMonster(b: Brain, s: GameState, m: Monster, slot: number): OwnMonster {
  const mask = b.mirror.activeKwOf(s, m);
  return {
    slot,
    card: ownCard(b, s, m.iid),
    power: b.mirror.power(s, m.iid),
    guard: b.mirror.guard(s, m.iid),
    pos: m.pos === 0 ? 'atk' : 'grd',
    faceDown: m.faceDown,
    enteredThisTurn: m.entered === s.turn,
    attacked: m.attacked === s.turn,
    wardActive: (mask & b.content.hookMask.beforeDestroy) !== 0,
    forced: b.mirror.mustAttack(s, m.iid),
    appraised: m.appraised,
  };
}

export function foeMonster(b: Brain, s: GameState, m: Monster, slot: number): FoeMonster {
  if (m.faceDown) return { faceDown: true, slot };
  const inst = s.inst[m.iid] as GameState['inst'][number];
  const mask = b.mirror.activeKwOf(s, m);
  const el = b.mirror.element(s, m.iid);
  const kd = b.mirror.kind(s, m.iid);
  return {
    faceDown: false,
    slot,
    id: b.content.ids[inst.def] as string,
    element: el >= 0 ? (b.content.elementIds[el] ?? null) : null,
    kind: kd >= 0 ? (b.content.kindIds[kd] ?? null) : null,
    keywords: keywordIds(b, mask).keywords,
    power: b.mirror.power(s, m.iid),
    guard: b.mirror.guard(s, m.iid),
    pos: m.pos === 0 ? 'atk' : 'grd',
    wardActive: (mask & b.content.hookMask.beforeDestroy) !== 0,
  };
}

