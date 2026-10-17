// Card and monster records shared by the Collector view and the player view. Each is built from a full state but
// carries only what the viewing side may know: a face-down monster is never described by identity.
import { DefType } from '@vault-duel/engine';
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
  /** turn index at whose end an Unstable Chimera is destroyed, or -1 */
  readonly unstableUntil: number;
  /** Shroud protects it from Appraisal while the turn index is below this */
  readonly shroudUntil: number;
  /** Power it has only until the end of this turn (an Ambush flip, D-338, a spell): evaluations may discount it */
  readonly tempPower: number;
  /** the attached symbiote (FLAGS.SYMBIOSIS, D-308), or null. It is face-up, so it is public (D-311). */
  readonly sym: OwnCard | null;
  /** keywords the symbiote gives the host right now (active minus printed, flaws never), empty without one */
  readonly bondedKeywords: readonly string[];
}

/** What anyone can see of a card (a discard pile entry). */
export interface PublicCard {
  readonly id: string;
  readonly type: CardType;
}

export interface PublicMonster {
  readonly faceDown: false;
  readonly iid: Iid;
  readonly slot: number;
  readonly id: string;
  readonly element: string | null;
  readonly kind: string | null;
  readonly keywords: readonly string[];
  readonly power: number;
  readonly guard: number;
  readonly pos: 'atk' | 'grd';
  readonly wardActive: boolean;
  /** the attached symbiote, or null (D-311). A face-down monster is never a host, so this leaks nothing hidden. */
  readonly sym: PublicCard | null;
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
  const { keywords, flaw } = keywordIds(b, b.engine.printedKeywords(s, iid));
  const el = b.engine.elementOf(s, iid);
  const kd = b.engine.kindOf(s, iid);
  const spell = c.spell[inst.def] ?? null;
  let drawOnly = false;
  if (spell !== null) drawOnly = spell.effects.length > 0 && spell.effects.every((e) => e.op === 'draw' && e.who === 'self');
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
  };
}

export function ownMonster(b: Brain, s: GameState, m: Monster, slot: number): OwnMonster {
  const mask = b.engine.activeKeywords(s, m.iid);
  const bonded = m.sym >= 0 ? keywordIds(b, mask & ~b.engine.printedKeywords(s, m.iid)).keywords : [];
  return {
    slot,
    card: ownCard(b, s, m.iid),
    power: b.engine.effectivePower(s, m.iid),
    guard: b.engine.effectiveGuard(s, m.iid),
    pos: m.pos === 0 ? 'atk' : 'grd',
    faceDown: m.faceDown,
    enteredThisTurn: m.entered === s.turn,
    attacked: m.attacked === s.turn,
    wardActive: (mask & b.content.hookMask.beforeDestroy) !== 0,
    forced: b.engine.mustAttack(s, m.iid),
    appraised: m.appraised,
    unstableUntil: m.unstableUntil,
    shroudUntil: m.shroudUntil,
    tempPower: m.timed.reduce((n, t) => (t.until <= s.turn && t.p > 0 ? n + t.p : n), 0),
    sym: m.sym >= 0 ? ownCard(b, s, m.sym) : null,
    bondedKeywords: bonded,
  };
}

export function foeMonster(b: Brain, s: GameState, m: Monster, slot: number): FoeMonster {
  if (m.faceDown) return { faceDown: true, slot };
  const inst = s.inst[m.iid] as GameState['inst'][number];
  const mask = b.engine.activeKeywords(s, m.iid);
  const el = b.engine.elementOf(s, m.iid);
  const kd = b.engine.kindOf(s, m.iid);
  return {
    faceDown: false,
    iid: m.iid,
    slot,
    id: b.content.ids[inst.def] as string,
    element: el >= 0 ? (b.content.elementIds[el] ?? null) : null,
    kind: kd >= 0 ? (b.content.kindIds[kd] ?? null) : null,
    keywords: keywordIds(b, mask).keywords,
    power: b.engine.effectivePower(s, m.iid),
    guard: b.engine.effectiveGuard(s, m.iid),
    pos: m.pos === 0 ? 'atk' : 'grd',
    wardActive: (mask & b.content.hookMask.beforeDestroy) !== 0,
    sym: m.sym >= 0 ? publicCard(b, s, m.sym) : null,
  };
}

/** What anyone can see of a card (id and type). */
export function publicCard(b: Brain, s: GameState, iid: Iid): PublicCard {
  const def = (s.inst[iid] as GameState['inst'][number]).def;
  return { id: b.content.ids[def] as string, type: typeOf(b, def) };
}

