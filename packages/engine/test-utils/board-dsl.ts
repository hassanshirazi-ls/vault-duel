// Board-state DSL (ARCHITECTURE.md §17): a line-based text format parsed into a valid GameState, with
// actions applied through the engine and expectations checked. Used by scenario tests and by the
// generated keyword-example tests (`KeywordDef.examples`, via the "@vault-duel/engine/test-utils/*" subpath).
//
//   cards        card <id> <P|C> <element> <kind> <power>/<guard> [<kw>[,<kw>...]]     (D-169)
//                Declares a monster for this scenario only. `P` = player pool; `C` = Collector pool (a Relic: its
//                Flaw goes in the keyword list). Element, kind and keywords must exist in the base content. A
//                declared id that collides with a base content id, or is declared twice, is an error. `parseScenario`
//                returns the declarations as `Scenario.declared`, apart from the board; build the content with
//                `withDeclared(baseSpec, sc.declared)` + `buildContent`, or run everything with `runScenarioOn`.
//   setup        turn 6 | round 4 collector | step main|attack|mulligan | played yes|no | twist N
//                P|C life N
//                P|C hand <id> ...        (`*` = filler up to HAND_SIZE)
//                P|C deck <id> ... | *    (top first; `*` or absent = filler, 2 x OPENING_HAND cards)
//                The filler is the reserved card `dsl-filler` (D-193): player pool, first element, first kind, 1/1, no
//                keywords. `withDeclared` adds it when the base lacks it; declaring that id in a `card` line is an error.
//                P|C discard <id> ...
//                P|C board [<id> A|G|D flags...] ... [-]       P|C traps [<id>] [-] ...
//                P|C vault [<id> flags...] ...
//   monster flags new moved done ward-used appraised p+2 g-1 p+3@7 g+1@7 unstable@T shroud@T
//                sym(<card-id>) (attached symbiote, D-308; the card is in no zone)
//                chimera(<family>,<element>,<kw>,<kw>[,asc][,grafted@T][,mats=<id>+<id>[+<id>]])
//                (mats= creates the stored materials in the owner's discard, in order, D-307)
//   bond         bond used | closed | open   (GameState.bond, D-306; default open)
//   spell        spell used | open           (GameState.spell, FLAGS.TURN_SLOTS, D-335; default open)
//   actions      do end | keep | redraw | summon <card> A|G|D [lane N] | covetous <card> sac <ref> A|G [lane N] | set <card>
//                | reposition P0 | move P0 > N (lane move, FLAGS.LANES) | cast <card> [> <ref>] | attack P0 > C1|face
//                | graft <ref> <ref> [| ascend <ref>] [| kw a,b] [| lane N] | pos A|G
//                | split P0 | symbiose <card> > P0
//   lanes        a board line `[a A] [-] [b G]` places by lane (slot index); the Globals under test come from the caller
//   expectations expect legal|illegal <action> | expect P|C life N | expect <slot> empty|power N|guard N|pos X|card <id>|has <kw>
//                | expect P|C hand|deck|discard|vault N | expect P|C hand|discard|vault has <id>
//                | expect <slot> sym <id>|none
//                | expect event <Name> [<slot>] | expect no event <Name> [<slot>] | expect winner P|C
//
// Refs: `P0..P2`, `C0..C2` (board slots; also resolved against the board as it was at setup for events),
// `face` (direct), `[P.|C.]hand:<id>`, `discard:<id>`, `vault:<id>` (side defaults to the side to move).
// A card id means the first matching card in that zone. Appraised monsters on the Collector's side are
// owned by the player. A monster that is not `new` entered before the current turn (`entered = -1`).
import { createEngineInternals } from '../src/engine';
import type { EngineInternals } from '../src/engine';
import { moodOf } from '../src/mood';
import { configHash, stream } from '../src/setup/seed';
import { activeKw, effectiveGuard, effectivePower } from '../src/stats';
import { emptyTrack } from '../src/track';
import type { Action, SummonMode } from '../src/types/actions';
import type { CompiledContent, DefIdx } from '../src/types/content';
import type { GameEvent } from '../src/types/events';
import type { Globals } from '../src/types/globals';
import type {
  ChimeraInfo, GameState, Iid, Instance, Monster, Pos, Side, SideState, Step, TimedMod, TrapSlot,
} from '../src/types/state';
import { deepFreeze } from '../src/freeze';
import { makeMonster } from '../src/monster';
import { buildContent, DSL_FILLER_ID, dslFillerSpec } from './content-builder';
import type { ContentSpec, DefSpec } from './content-builder';
import { constantIntent } from './intent';

export class ScenarioError extends Error {
  constructor(line: number, message: string) {
    super(line > 0 ? `line ${line}: ${message}` : message);
    this.name = 'ScenarioError';
  }
}

// ---- parsed form -----------------------------------------------------------------------------

export interface MonsterSpec {
  readonly id: string;
  readonly pos: 'A' | 'G' | 'D';
  readonly isNew: boolean;
  readonly moved: boolean;
  readonly done: boolean;
  readonly wardUsed: boolean;
  readonly appraised: boolean;
  readonly permP: number;
  readonly permG: number;
  readonly timed: readonly TimedMod[];
  readonly unstable: number | null;
  readonly shroud: number | null;
  readonly sym: string | null;
  readonly chimera: { readonly family: string; readonly element: string; readonly kw: readonly string[]; readonly asc: boolean; readonly grafted: number | null; readonly mats: readonly string[] } | null;
}

export interface SideSpec {
  life: number | null;
  hand: readonly string[] | '*' | null;
  deck: readonly string[] | '*' | null;
  discard: readonly string[];
  board: readonly (MonsterSpec | null)[] | null;
  traps: readonly (string | null)[] | null;
  vault: readonly MonsterSpec[];
}

export interface ScriptLine {
  readonly kind: 'do' | 'expect';
  readonly text: string;
  readonly line: number;
}

/** A `card` line (D-169): a monster that exists for one scenario only. */
export interface DeclaredCard {
  readonly id: string;
  readonly pool: 'player' | 'collector';
  readonly element: string;
  readonly kind: string;
  readonly power: number;
  readonly guard: number;
  readonly kw: readonly string[];
  readonly line: number;
}

export interface Scenario {
  /** cards declared by `card` lines, in source order; not part of any side */
  readonly declared: DeclaredCard[];
  turn: number | null;
  /** `round R collector|player` resolved at parse time */
  step: Step;
  played: boolean;
  bond: 0 | 1 | 2;
  spell: 0 | 1;
  twist: number;
  readonly sides: [SideSpec, SideSpec];
  readonly script: ScriptLine[];
}

const SIDE: Readonly<Record<string, Side>> = { P: 0, C: 1 };

function emptySide(): SideSpec {
  return { life: null, hand: null, deck: null, discard: [], board: null, traps: null, vault: [] };
}

function num(line: number, s: string | undefined): number {
  if (s === undefined || !/^-?\d+$/.test(s)) throw new ScenarioError(line, `expected an integer, got '${s ?? ''}'`);
  return Number(s);
}

function parseMonster(line: number, body: string): MonsterSpec | null {
  const t = body.trim();
  if (t === '-') return null;
  const parts = t.match(/chimera\([^)]*\)|\S+/g) ?? [];
  const id = parts[0];
  if (id === undefined) throw new ScenarioError(line, 'empty monster token');
  let pos: 'A' | 'G' | 'D' = 'A';
  let rest = parts.slice(1);
  if (rest[0] === 'A' || rest[0] === 'G' || rest[0] === 'D') {
    pos = rest[0];
    rest = rest.slice(1);
  }
  const m = { isNew: false, moved: false, done: false, wardUsed: false, appraised: false, permP: 0, permG: 0, unstable: null as number | null, shroud: null as number | null, sym: null as string | null };
  const timed: TimedMod[] = [];
  let chimera: MonsterSpec['chimera'] = null;
  for (const f of rest) {
    let r: RegExpMatchArray | null;
    if (f === 'new') m.isNew = true;
    else if (f === 'moved') m.moved = true;
    else if (f === 'done') m.done = true;
    else if (f === 'ward-used') m.wardUsed = true;
    else if (f === 'appraised') m.appraised = true;
    else if ((r = f.match(/^([pg])([+-]\d+)@(\d+)$/))) {
      const v = Number(r[2]);
      timed.push({ p: r[1] === 'p' ? v : 0, g: r[1] === 'g' ? v : 0, until: Number(r[3]) });
    } else if ((r = f.match(/^([pg])([+-]\d+)$/))) {
      if (r[1] === 'p') m.permP += Number(r[2]);
      else m.permG += Number(r[2]);
    } else if ((r = f.match(/^unstable@(\d+)$/))) m.unstable = Number(r[1]);
    else if ((r = f.match(/^shroud@(\d+)$/))) m.shroud = Number(r[1]);
    else if ((r = f.match(/^sym\((.+)\)$/))) m.sym = r[1] as string;
    else if ((r = f.match(/^chimera\((.*)\)$/))) {
      const args = (r[1] ?? '').split(',').map((a) => a.trim());
      const [family, element, ...more] = args;
      if (family === undefined || element === undefined || family === '' || element === '') {
        throw new ScenarioError(line, `chimera needs (family,element,...): '${f}'`);
      }
      const kw: string[] = [];
      let asc = false;
      let grafted: number | null = null;
      let mats: string[] = [];
      for (const a of more) {
        const g = a.match(/^grafted@(\d+)$/);
        if (a.startsWith('mats=')) mats = a.slice(5).split('+').filter((x) => x !== '');
        else if (a === 'asc') asc = true;
        else if (g !== null) grafted = Number(g[1]);
        else if (a !== '' && a !== '-' && a !== 'none') kw.push(a);
      }
      chimera = { family, element, kw, asc, grafted, mats };
    } else throw new ScenarioError(line, `unknown monster flag '${f}'`);
  }
  return { id, pos, ...m, timed, chimera };
}

function bracketed(line: number, text: string): string[] {
  const out = [...text.matchAll(/\[([^\]]*)\]/g)].map((x) => x[1] ?? '');
  if (out.length === 0) throw new ScenarioError(line, 'expected [..] tokens');
  return out;
}

function parseCard(line: number, words: readonly string[]): DeclaredCard {
  const [, id, pool, element, kind, stats, kws, ...extra] = words;
  const usage = 'card <id> <P|C> <element> <kind> <power>/<guard> [<kw>[,<kw>...]]';
  if (id === undefined || pool === undefined || element === undefined || kind === undefined || stats === undefined || extra.length > 0) {
    throw new ScenarioError(line, `card needs: ${usage}`);
  }
  if (pool !== 'P' && pool !== 'C') throw new ScenarioError(line, `card pool must be P or C, got '${pool}'`);
  const st = stats.match(/^(\d+)\/(\d+)$/);
  if (st === null) throw new ScenarioError(line, `card stats must be <power>/<guard>, got '${stats}'`);
  const kw = kws === undefined ? [] : kws.split(',').filter((k) => k !== '');
  if (id === DSL_FILLER_ID) throw new ScenarioError(line, `card id '${DSL_FILLER_ID}' is reserved for the filler card (D-193)`);
  return { id, pool: pool === 'P' ? 'player' : 'collector', element, kind, power: Number(st[1]), guard: Number(st[2]), kw, line };
}

/** The `DefSpec`s for declared cards. Reference checks happen in `withDeclared`, which knows the base content. */
export function declaredDefs(declared: readonly DeclaredCard[]): DefSpec[] {
  return declared.map((d) => ({
    id: d.id, type: 'monster', pool: d.pool, power: d.power, guard: d.guard, element: d.element, kind: d.kind, kw: d.kw,
  }));
}

/**
 * `base` plus the declared cards, plus the reserved filler card when `base` does not have it yet (D-193).
 * Throws ScenarioError on an id collision or an unknown element, kind or keyword.
 */
export function withDeclared(base: ContentSpec, declared: readonly DeclaredCard[]): ContentSpec {
  const hasFiller = base.defs.some((d) => d.id === DSL_FILLER_ID);
  const taken = new Set(base.defs.map((d) => d.id));
  const elements = new Set(base.elements.map((e) => e.id));
  const kinds = new Set(base.kinds);
  const keywords = new Set(base.keywords.map((k) => k.id));
  for (const d of declared) {
    if (taken.has(d.id)) throw new ScenarioError(d.line, `card '${d.id}' collides with an existing card id`);
    taken.add(d.id);
    if (!elements.has(d.element)) throw new ScenarioError(d.line, `card '${d.id}': unknown element '${d.element}'`);
    if (!kinds.has(d.kind)) throw new ScenarioError(d.line, `card '${d.id}': unknown kind '${d.kind}'`);
    for (const k of d.kw) if (!keywords.has(k)) throw new ScenarioError(d.line, `card '${d.id}': unknown keyword '${k}'`);
  }
  return { ...base, defs: [...base.defs, ...(hasFiller ? [] : [dslFillerSpec(base)]), ...declaredDefs(declared)] };
}

export function parseScenario(text: string): Scenario {
  const sc: Scenario = { declared: [], turn: null, step: 'main', played: false, bond: 0, spell: 0, twist: -1, sides: [emptySide(), emptySide()], script: [] };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = (lines[i] ?? '').replace(/(^|\s)#.*$/, '').trim();
    if (raw === '') continue;
    const words = raw.split(/\s+/);
    const head = words[0] as string;
    if (head === 'do' || head === 'expect') {
      sc.script.push({ kind: head, text: raw.slice(head.length).trim(), line: lineNo });
      continue;
    }
    if (head === 'card') sc.declared.push(parseCard(lineNo, words));
    else if (head === 'turn') sc.turn = num(lineNo, words[1]);
    else if (head === 'round') {
      const r = num(lineNo, words[1]);
      const who = words[2] ?? 'player';
      if (who !== 'player' && who !== 'collector') throw new ScenarioError(lineNo, `round R player|collector, got '${who}'`);
      sc.turn = (r - 1) * 2 + (who === 'collector' ? 1 : 0);
    } else if (head === 'step') {
      const s = words[1];
      if (s !== 'main' && s !== 'attack' && s !== 'mulligan') throw new ScenarioError(lineNo, `step main|attack|mulligan, got '${s ?? ''}'`);
      sc.step = s;
    } else if (head === 'played') sc.played = words[1] === 'yes';
    else if (head === 'bond') {
      const b = words[1];
      if (b !== 'used' && b !== 'closed' && b !== 'open') throw new ScenarioError(lineNo, `bond used|closed|open, got '${b ?? ''}'`);
      sc.bond = b === 'used' ? 1 : b === 'closed' ? 2 : 0;
    } else if (head === 'spell') {
      const b = words[1];
      if (b !== 'used' && b !== 'open') throw new ScenarioError(lineNo, `spell used|open, got '${b ?? ''}'`);
      sc.spell = b === 'used' ? 1 : 0;
    }
    else if (head === 'twist') sc.twist = num(lineNo, words[1]);
    else if (head === 'P' || head === 'C') {
      const side = sc.sides[SIDE[head] as Side];
      const key = words[1];
      const args = words.slice(2);
      const tail = raw.slice(raw.indexOf(key ?? '') + (key ?? '').length);
      if (key === 'life') side.life = num(lineNo, args[0]);
      else if (key === 'hand') side.hand = args[0] === '*' ? '*' : args;
      else if (key === 'deck') side.deck = args[0] === '*' ? '*' : args;
      else if (key === 'discard') side.discard = args;
      else if (key === 'board') side.board = bracketed(lineNo, tail).map((b) => parseMonster(lineNo, b));
      else if (key === 'traps') side.traps = bracketed(lineNo, tail).map((b) => (b.trim() === '-' ? null : b.trim()));
      else if (key === 'vault') side.vault = bracketed(lineNo, tail).map((b) => parseMonster(lineNo, b)).filter((m): m is MonsterSpec => m !== null);
      else throw new ScenarioError(lineNo, `unknown ${head} field '${key ?? ''}'`);
    } else throw new ScenarioError(lineNo, `unknown line '${raw}'`);
  }
  return sc;
}

// ---- building the state ----------------------------------------------------------------------

export interface BuiltScenario {
  readonly state: GameState;
  /** iid at each board slot at setup: index `side * LOC + slot` (see `slotKey`) */
  readonly setupBoard: ReadonlyMap<number, Iid>;
}

const slotKey = (side: Side, slot: number): number => side * 16 + slot;

/** The reserved filler card (D-193). Content built without `withDeclared` or FX_SPEC must include it. */
function fillerDef(c: CompiledContent): DefIdx {
  const d = c.index.get(DSL_FILLER_ID);
  if (d === undefined) throw new ScenarioError(0, `content has no '${DSL_FILLER_ID}' card; build it with withDeclared (D-193)`);
  return d;
}

export function buildScenario(sc: Scenario, c: CompiledContent, g: Globals): BuiltScenario {
  const inst: Instance[] = [];
  const def = (id: string, line = 0): DefIdx => {
    const d = c.index.get(id);
    if (d === undefined) throw new ScenarioError(line, `unknown card '${id}'`);
    return d;
  };
  const turn = sc.turn ?? 2;
  const newCard = (d: DefIdx, owner: Side, chimera: ChimeraInfo | null = null): Iid => inst.push({ def: d, owner, chimera }) - 1;
  const filler = (owner: Side, n: number): Iid[] => Array.from({ length: n }, () => newCard(fillerDef(c), owner));

  const sides: SideState[] = [];
  const setupBoard = new Map<number, Iid>();
  for (const sideNo of [0, 1] as const) {
    const sp = sc.sides[sideNo];
    const extraDiscard: Iid[] = [];
    const mk = (m: MonsterSpec, owner: Side): { iid: Iid; mon: Monster } => {
      let chimera: ChimeraInfo | null = null;
      let d: DefIdx;
      const entered = m.isNew ? turn : -1; // judgment call: "older" monsters get -1 (any value < turn works)
      if (m.chimera !== null) {
        const ch = m.chimera;
        d = def(ch.family);
        const e = c.elementIds.indexOf(ch.element);
        if (e < 0) throw new ScenarioError(0, `unknown element '${ch.element}'`);
        let kw = 0;
        for (const k of ch.kw) {
          const bit = c.kwBit[k];
          if (bit === undefined) throw new ScenarioError(0, `unknown keyword '${k}'`);
          kw |= 1 << bit;
        }
        const materials = ch.mats.map((id) => {
          const mi = newCard(def(id), m.appraised ? 0 : owner);
          extraDiscard.push(mi); // stored materials sit in the owner's discard, as after a real Graft (D-307)
          return mi;
        });
        chimera = { element: e, kw: kw >>> 0, ascended: ch.asc, materials, grafted: ch.grafted ?? entered };
      } else d = def(m.id);
      const iid = newCard(d, m.appraised ? 0 : owner, chimera);
      const sym = m.sym === null ? -1 : newCard(def(m.sym), m.appraised ? 0 : owner);
      const mon = makeMonster(iid, {
        pos: m.pos === 'A' ? 0 : 1,
        faceDown: m.pos === 'D',
        entered,
        repositioned: m.moved ? turn : -1,
        attacked: m.done ? turn : -1,
        wardUsed: m.wardUsed,
        permP: m.permP,
        permG: m.permG,
        ...(m.timed.length > 0 ? { timed: m.timed } : {}),
        unstableUntil: m.unstable ?? -1,
        shroudUntil: m.shroud ?? -1,
        appraised: m.appraised,
        sym,
      });
      return { iid, mon };
    };
    const board: (Monster | null)[] = Array.from({ length: g.BOARD_SLOTS }, () => null);
    (sp.board ?? []).forEach((m, slot) => {
      if (slot >= g.BOARD_SLOTS) throw new ScenarioError(0, `more than BOARD_SLOTS=${g.BOARD_SLOTS} board entries`);
      if (m === null) return;
      const { iid, mon } = mk(m, sideNo);
      board[slot] = mon;
      setupBoard.set(slotKey(sideNo, slot), iid);
    });
    const traps: (TrapSlot | null)[] = Array.from({ length: g.TRAP_SLOTS }, () => null);
    (sp.traps ?? []).forEach((id, slot) => {
      if (slot >= g.TRAP_SLOTS) throw new ScenarioError(0, `more than TRAP_SLOTS=${g.TRAP_SLOTS} trap entries`);
      if (id !== null) traps[slot] = { iid: newCard(def(id), sideNo), set: Math.max(0, turn - 2) };
    });
    const cards = (ids: readonly string[]): Iid[] => ids.map((id) => newCard(def(id), sideNo));
    const hand = sp.hand === '*' ? filler(sideNo, g.HAND_SIZE) : cards(sp.hand ?? []);
    // Judgment call: §17 says "filler" without a size; an unspecified deck is 2 x OPENING_HAND filler cards.
    const deck = sp.deck === null || sp.deck === '*' ? filler(sideNo, 2 * g.OPENING_HAND) : cards(sp.deck);
    const discard = [...cards(sp.discard), ...extraDiscard];
    const vault = sp.vault.map((m) => mk(m, sideNo).iid);
    sides.push({
      life: sp.life ?? (sideNo === 0 ? g.PLAYER_LIFE : g.COLLECTOR_LIFE),
      deck, hand, discard, board, traps, vault,
    });
  }
  const [p, col] = sides as [SideState, SideState];
  const state: GameState = {
    v: 1,
    cfg: configHash(c, g),
    seed: 'board-dsl',
    rng: stream('board-dsl', 'engine').state(),
    turn,
    step: sc.step,
    played: sc.played,
    bond: sc.bond,
    spell: sc.spell,
    redrawsLeft: sc.step === 'mulligan' && g.FLAGS.REDRAW ? g.REDRAWS : 0,
    pending: null,
    sides: [p, col],
    inst,
    appraisal: { attempts: 0, successes: 0, taken: [] },
    collector: { mood: moodOf(col.life, g), intent: null }, // D-161
    twist: sc.twist,
    track: emptyTrack(g),
    result: null,
    log: null,
    nActions: 0,
  };
  return { state: deepFreeze(state), setupBoard };
}

// ---- running ---------------------------------------------------------------------------------

export interface ScenarioResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** An engine suitable for scenarios over `c` / `g`: dev mode, constant intent policy. */
export function scenarioEngine(c: CompiledContent, g: Globals): EngineInternals {
  return createEngineInternals(c, g, g.FLAGS.INTENTS ? { intent: constantIntent } : {}, { dev: true });
}

const EVENT_IID_FIELDS = ['iid', 'attacker', 'defender'] as const;

function eventTouches(ev: GameEvent, iid: Iid): boolean {
  const rec = ev as unknown as Record<string, unknown>;
  return EVENT_IID_FIELDS.some((f) => rec[f] === iid);
}

class Runner {
  state: GameState;
  readonly events: GameEvent[] = [];
  constructor(
    readonly engine: EngineInternals,
    readonly built: BuiltScenario,
  ) {
    this.state = built.state;
  }

  private get c(): CompiledContent {
    return this.engine.content;
  }
  private get toMove(): Side {
    return (this.state.turn & 1) as Side;
  }

  /** Board slot like `P0` / `C2`, or null. */
  private slotOf(tok: string): { side: Side; slot: number } | null {
    const m = tok.match(/^([PC])(\d+)$/);
    return m === null ? null : { side: SIDE[m[1] as string] as Side, slot: Number(m[2]) };
  }

  /** Resolve a ref against the current state; `-1` for `face`. */
  ref(line: number, tok: string): Iid | -1 {
    if (tok === 'face') return -1;
    const slot = this.slotOf(tok);
    if (slot !== null) {
      const m = this.state.sides[slot.side].board[slot.slot];
      if (m === null || m === undefined) throw new ScenarioError(line, `${tok} is empty`);
      return m.iid;
    }
    const z = tok.match(/^(?:([PC])\.)?(hand|discard|vault):(.+)$/);
    if (z !== null) {
      const side = z[1] === undefined ? this.toMove : (SIDE[z[1]] as Side);
      return this.inZone(line, side, z[2] as 'hand' | 'discard' | 'vault', z[3] as string);
    }
    return this.inZone(line, this.toMove, 'hand', tok); // a bare card id means a card in hand
  }

  private inZone(line: number, side: Side, zone: 'hand' | 'discard' | 'vault', id: string): Iid {
    const d = this.c.index.get(id);
    if (d === undefined) throw new ScenarioError(line, `unknown card '${id}'`);
    const found = this.state.sides[side][zone].find((iid) => this.state.inst[iid]?.def === d);
    if (found === undefined) throw new ScenarioError(line, `no ${id} in ${side === 0 ? 'P' : 'C'} ${zone}`);
    return found;
  }

  private pos(line: number, tok: string | undefined): SummonMode {
    if (tok === 'A') return 'atk';
    if (tok === 'G') return 'grd';
    if (tok === 'D') return 'down';
    throw new ScenarioError(line, `position A|G|D, got '${tok ?? ''}'`);
  }

  /** An optional trailing `lane N` in an action's words, as a spreadable fragment. */
  private lane(line: number, words: readonly string[]): { lane?: number } {
    const i = words.indexOf('lane');
    if (i < 0) return {};
    const n = Number(words[i + 1]);
    if (!Number.isInteger(n)) throw new ScenarioError(line, `lane <number>, got '${words[i + 1] ?? ''}'`);
    return { lane: n };
  }

  /** One non-graft action from words (shared by `do`, `expect legal` and `expect illegal`). */
  action(line: number, words: readonly string[]): Action {
    const [verb, ...a] = words;
    switch (verb) {
      case 'end': return { t: 'endTurn' };
      case 'keep': return { t: 'keep' };
      case 'redraw': return { t: 'redraw' };
      case 'graftcancel': return { t: 'graftCancel' };
      case 'graftbegin': return { t: 'graftBegin' };
      case 'reposition': return { t: 'reposition', m: this.ref(line, a[0] ?? '') as Iid };
      case 'set': return { t: 'setTrap', c: this.ref(line, a[0] ?? '') as Iid };
      case 'move': {
        if (a[1] !== '>') throw new ScenarioError(line, 'move <slot> > <lane>');
        return { t: 'moveLane', m: this.ref(line, a[0] ?? '') as Iid, to: Number(a[2]) };
      }
      case 'split': return { t: 'split', m: this.ref(line, a[0] ?? '') as Iid };
      case 'symbiose': {
        if (a[1] !== '>') throw new ScenarioError(line, 'symbiose <card> > <slot>');
        return { t: 'symbiose', c: this.ref(line, a[0] ?? '') as Iid, host: this.ref(line, a[2] ?? '') as Iid };
      }
      case 'summon': return { t: 'summon', c: this.ref(line, a[0] ?? '') as Iid, mode: this.pos(line, a[1]), ...this.lane(line, a) };
      case 'covetous': {
        const mode = this.pos(line, a[3]);
        if (a[1] !== 'sac' || mode === 'down') throw new ScenarioError(line, 'covetous <card> sac <ref> A|G');
        return { t: 'summonCovetous', c: this.ref(line, a[0] ?? '') as Iid, sac: this.ref(line, a[2] ?? '') as Iid, mode, ...this.lane(line, a) };
      }
      case 'cast': {
        const gt = a.indexOf('>');
        return { t: 'cast', c: this.ref(line, a[0] ?? '') as Iid, target: gt < 0 ? -1 : this.ref(line, a[gt + 1] ?? '') };
      }
      case 'attack': {
        if (a[1] !== '>') throw new ScenarioError(line, 'attack <slot> > <slot>|face');
        return { t: 'attack', a: this.ref(line, a[0] ?? '') as Iid, target: this.ref(line, a[2] ?? '') };
      }
      default:
        throw new ScenarioError(line, `unknown action '${verb ?? ''}'`);
    }
  }

  private apply(line: number, a: Action): void {
    try {
      const r = this.engine.applyAction(this.state, a);
      this.state = r.state;
      this.events.push(...r.events);
    } catch (e) {
      throw new ScenarioError(line, `${JSON.stringify(a)} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** `graft <mat> <mat> [| ascend <mat>] [| kw a,b] [| pos A|G]`: drives the pending stages. */
  private graft(line: number, text: string): void {
    const sections = text.split('|').map((s) => s.trim());
    const mats = (sections[0] ?? '').split(/\s+/).filter((w) => w !== '');
    if (mats.length !== 2) throw new ScenarioError(line, 'graft needs exactly two materials before the first |');
    let ascend: string | null = null;
    let kw: string[] | null = null;
    let pos: 'A' | 'G' = 'A';
    let lane: { lane?: number } = {};
    for (const sec of sections.slice(1)) {
      const w = sec.split(/\s+/);
      if (w[0] === 'ascend') ascend = w[1] ?? '';
      else if (w[0] === 'kw') kw = (w[1] ?? '').split(',').filter((k) => k !== '');
      else if (w[0] === 'pos') pos = w[1] === 'G' ? 'G' : 'A';
      else if (w[0] === 'lane') lane = this.lane(line, w);
      else throw new ScenarioError(line, `unknown graft section '${sec}'`);
    }
    this.apply(line, { t: 'graftBegin' });
    for (const m of mats) this.apply(line, { t: 'graftPick', m: this.ref(line, m) as Iid });
    const stage = (): string | undefined => this.state.pending?.stage;
    if (stage() === 'ascend') {
      if (ascend !== null) this.apply(line, { t: 'graftPick', m: this.ref(line, ascend) as Iid });
      else this.apply(line, { t: 'graftSkipAscend' });
    } else if (ascend !== null) throw new ScenarioError(line, 'no Ascend stage is available');
    if (stage() === 'keywords') {
      if (kw === null) throw new ScenarioError(line, 'more keywords are available than can be inherited: add `| kw a,b`');
      let mask = 0;
      for (const k of kw) {
        const bit = this.c.kwBit[k];
        if (bit === undefined) throw new ScenarioError(line, `unknown keyword '${k}'`);
        mask |= 1 << bit;
      }
      this.apply(line, { t: 'graftKeywords', kw: mask >>> 0 });
    } else if (kw !== null) throw new ScenarioError(line, 'no keyword choice is needed');
    this.apply(line, { t: 'graftPosition', pos: pos === 'A' ? 0 : 1, ...lane });
  }

  private fail(line: number, msg: string): never {
    throw new ScenarioError(line, `expectation failed: ${msg}`);
  }

  private expectLegal(line: number, want: boolean, words: readonly string[]): void {
    const a = words[0] === 'graft' ? ({ t: 'graftBegin' } as Action) : this.action(line, words);
    const got = this.engine.isLegal(this.state, a);
    if (got !== want) this.fail(line, `${JSON.stringify(a)} is ${got ? 'legal' : 'illegal'}`);
  }

  private expect(line: number, text: string): void {
    const w = text.split(/\s+/);
    const [h, k] = w;
    if (h === 'legal' || h === 'illegal') return this.expectLegal(line, h === 'legal', w.slice(1));
    if (h === 'event' || (h === 'no' && k === 'event')) {
      const rest = w.slice(h === 'no' ? 2 : 1);
      const name = rest[0];
      const arg = rest[1];
      let iid: Iid | null = null;
      if (arg !== undefined) {
        const slot = this.slotOf(arg);
        iid = slot !== null ? (this.built.setupBoard.get(slotKey(slot.side, slot.slot)) ?? null) : (this.ref(line, arg) as Iid);
        if (iid === null) this.fail(line, `${arg} was empty at setup`);
      }
      const hit = this.events.some((e) => e.e === name && (iid === null || eventTouches(e, iid)));
      if (hit === (h === 'no')) this.fail(line, `${h === 'no' ? 'unexpected' : 'missing'} event ${rest.join(' ')}`);
      return;
    }
    if (h === 'winner') {
      const want = SIDE[k ?? ''];
      if (this.state.result?.winner !== want) this.fail(line, `winner is ${String(this.state.result?.winner)}`);
      return;
    }
    const side = SIDE[h ?? ''];
    if (side !== undefined) {
      const n = Number(w[2]);
      if (k === 'life') {
        if (this.state.sides[side].life !== n) this.fail(line, `${h} life is ${this.state.sides[side].life}, expected ${n}`);
      } else if (k === 'hand' || k === 'deck' || k === 'discard' || k === 'vault') {
        const zone = this.state.sides[side][k];
        if (w[2] === 'has') {
          const d = this.c.index.get(w[3] ?? '');
          if (!zone.some((iid) => this.state.inst[iid]?.def === d)) this.fail(line, `${h} ${k} lacks ${w[3] ?? ''}`);
        } else if (zone.length !== n) this.fail(line, `${h} ${k} has ${zone.length} cards, expected ${n}`);
      } else this.fail(line, `unknown field '${k ?? ''}'`);
      return;
    }
    const slot = this.slotOf(h ?? '');
    if (slot === null) throw new ScenarioError(line, `cannot read expectation '${text}'`);
    const m = this.state.sides[slot.side].board[slot.slot] ?? null;
    if (k === 'empty') {
      if (m !== null) this.fail(line, `${h} is not empty`);
      return;
    }
    if (m === null) this.fail(line, `${h} is empty`);
    const e = this.engine.env;
    if (k === 'power') {
      const got = effectivePower(this.state, e, m.iid);
      if (got !== Number(w[2])) this.fail(line, `${h} power is ${got}, expected ${w[2] ?? ''}`);
    } else if (k === 'guard') {
      const got = effectiveGuard(this.state, e, m.iid);
      if (got !== Number(w[2])) this.fail(line, `${h} guard is ${got}, expected ${w[2] ?? ''}`);
    } else if (k === 'pos') {
      const got: Pos | 'D' = m.faceDown ? 'D' : m.pos;
      const want = w[2] === 'A' ? 0 : w[2] === 'G' ? 1 : 'D';
      if (got !== want) this.fail(line, `${h} is ${m.faceDown ? 'D' : m.pos === 0 ? 'A' : 'G'}, expected ${w[2] ?? ''}`);
    } else if (k === 'sym') {
      const want = w[2] ?? '';
      const got = m.sym < 0 ? 'none' : (this.c.ids[this.state.inst[m.sym]?.def ?? -1] ?? '?');
      if (got !== want) this.fail(line, `${h} sym is ${got}, expected ${want}`);
    } else if (k === 'card') {
      if (this.state.inst[m.iid]?.def !== this.c.index.get(w[2] ?? '')) this.fail(line, `${h} is not ${w[2] ?? ''}`);
    } else if (k === 'has') {
      const bit = this.c.kwBit[w[2] ?? ''];
      if (bit === undefined) throw new ScenarioError(line, `unknown keyword '${w[2] ?? ''}'`);
      if ((activeKw(this.state, e, m.iid) & (1 << bit)) === 0) this.fail(line, `${h} lacks active keyword ${w[2] ?? ''}`);
    } else throw new ScenarioError(line, `unknown slot expectation '${k ?? ''}'`);
  }

  run(script: readonly ScriptLine[]): void {
    for (const s of script) {
      if (s.kind === 'expect') this.expect(s.line, s.text);
      else if (s.text.startsWith('graft ')) this.graft(s.line, s.text.slice(6));
      else this.apply(s.line, this.action(s.line, s.text.split(/\s+/)));
    }
  }
}

/** Parse, build, apply the `do` lines through the engine and check the `expect` lines. Throws ScenarioError. */
export function runScenario(text: string, engine: EngineInternals): ScenarioResult {
  const sc = parseScenario(text);
  const built = buildScenario(sc, engine.content, engine.globals);
  const r = new Runner(engine, built);
  r.run(sc.script);
  return { state: r.state, events: r.events };
}

/**
 * D-169: parse `text`, build content from `base` plus the scenario's declared cards, and run it under `g`.
 * Returns the content the scenario ran on, so callers can look cards up.
 */
export function runScenarioOn(
  text: string,
  base: ContentSpec,
  g: Globals,
): ScenarioResult & { readonly content: CompiledContent } {
  const sc = parseScenario(text);
  const content = buildContent(withDeclared(base, sc.declared));
  const engine = scenarioEngine(content, g);
  const built = buildScenario(sc, content, g);
  const r = new Runner(engine, built);
  r.run(sc.script);
  return { state: r.state, events: r.events, content };
}
