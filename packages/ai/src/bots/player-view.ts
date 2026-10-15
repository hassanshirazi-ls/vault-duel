// The player's view (ARCHITECTURE.md §14): his own hand, board and traps, the Collector's public information, the
// number of cards in the Collector's hand, how many traps he has set, the mood and the intent. It has no field for the
// Collector's hand contents, deck order, or set-trap identities. A bot receives a `BotContext`; the view is built only
// when the bot asks, so a bot that needs no information (novice) costs nothing.
import { activeSide, redactState, roundOf } from '@vault-duel/engine';
import type { Action, CombatPreview, GameState, GraftPreview, Intent, Mood, Side } from '@vault-duel/engine';
import type { Brain } from '../shared/brain';
import { lookAhead } from '../shared/look-ahead';
import { foeMonster, ownCard, ownMonster, typeOf } from '../shared/cards';
import type { FoeMonster, OwnCard, OwnMonster, PublicCard } from '../shared/cards';

const PLAYER: Side = 0;
const COLLECTOR: Side = 1;

export interface PlayerView {
  readonly turn: number;
  readonly round: number;
  readonly mood: Mood;
  readonly intent: Intent | null;
  readonly myLife: number;
  readonly foeLife: number;
  readonly hand: readonly OwnCard[];
  readonly board: readonly (OwnMonster | null)[];
  readonly traps: readonly (OwnCard | null)[];
  readonly discard: readonly OwnCard[];
  readonly deckCount: number;
  readonly foeHandCount: number;
  readonly foeDeckCount: number;
  readonly foeBoard: readonly (FoeMonster | null)[];
  /** how many of his trap slots are filled; their identities are hidden */
  readonly foeTrapCount: number;
  readonly foeDiscard: readonly PublicCard[];
  readonly foeVault: readonly PublicCard[];
  /** a Graft is in progress: only its stage actions are legal */
  readonly pendingGraft: boolean;
  /** the winning side once the duel is over */
  readonly winner: Side | null;
  /**
   * The monster the Collector takes at the start of his next turn if that turn is an Appraisal (flag on, round listed, a
   * face-up unshrouded monster of enough Power): the highest Power, leftmost on a tie. Null otherwise, and on his own turn.
   */
  readonly appraisalTarget: OwnMonster | null;
  /** the engine's legal actions for the side to move, in engine order */
  readonly legal: readonly Action[];
  /**
   * The view after taking `legal[i]`, looked ahead on `redactState(s, 0)`: the Collector's hand, deck and traps removed and
   * the player's own deck removed too (what he does not know cannot influence the answer). Hand and deck counts in the
   * returned view are therefore not real. Null if the action is refused (it targets a face-down Collector monster, D-209).
   */
  after(index: number): PlayerView | null;
  /** The engine's combat preview of my monster `attacker` against `target` (an iid, or -1 for a direct attack). `known: false` against a face-down monster. */
  previewCombat(attacker: number, target: number): CombatPreview;
  /** The Chimera the pending Graft's choices so far would create (null with fewer than two materials). */
  previewGraft(): GraftPreview | null;
  /** Does an attacker of element `attacker` have the advantage over a defender of element `defender`? (content's element table) */
  beats(attacker: string | null, defender: string | null): boolean;
}

/** What a bot is given: the legal actions, and the view on demand. */
export interface BotContext {
  readonly legal: readonly Action[];
  view(): PlayerView;
}

/** Chooses an index into `ctx.legal`. */
export type Bot = (ctx: BotContext) => number;

function publicCard(b: Brain, s: GameState, iid: number): PublicCard {
  const def = (s.inst[iid] as GameState['inst'][number]).def;
  return { id: b.content.ids[def] as string, type: typeOf(b, def) };
}

/** Element id to table index, built once per Brain. */
const ELEMENT_INDEX = new WeakMap<Brain, ReadonlyMap<string, number>>();
function elementIndex(b: Brain): ReadonlyMap<string, number> {
  let m = ELEMENT_INDEX.get(b);
  if (m === undefined) {
    m = new Map(b.content.elementIds.map((id, i) => [id, i] as const));
    ELEMENT_INDEX.set(b, m);
  }
  return m;
}

function appraisalTargetOf(b: Brain, s: GameState, board: readonly (OwnMonster | null)[]): OwnMonster | null {
  const g = b.globals;
  const round = roundOf(s);
  if (activeSide(s) !== 0 || !g.FLAGS.APPRAISAL || !g.APPRAISAL_ROUNDS.includes(round)) return null;
  let best: OwnMonster | null = null;
  for (const m of board) {
    if (m === null || m.faceDown || s.turn + 1 < m.shroudUntil || m.power < g.APPRAISAL_MIN_POWER) continue;
    if (best === null || m.power > best.power) best = m;
  }
  return best;
}

/** Memoises a thunk: the card records of a view are built only when a bot reads them (look-ahead chains rarely do). */
function once<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

export function playerView(b: Brain, s: GameState): PlayerView {
  const mine = s.sides[PLAYER];
  const foe = s.sides[COLLECTOR];
  const legal = b.engine.getLegalActions(s);
  const ahead = lookAhead(b, s, PLAYER);
  const hand = once(() => mine.hand.map((iid) => ownCard(b, s, iid)));
  const board = once(() => mine.board.map((m, slot) => (m === null ? null : ownMonster(b, s, m, slot))));
  const traps = once(() => mine.traps.map((t) => (t === null ? null : ownCard(b, s, t.iid))));
  const discard = once(() => mine.discard.map((iid) => ownCard(b, s, iid)));
  const foeBoard = once(() => foe.board.map((m, slot) => (m === null ? null : foeMonster(b, s, m, slot))));
  const foeDiscard = once(() => foe.discard.map((iid) => publicCard(b, s, iid)));
  const foeVault = once(() => foe.vault.map((iid) => publicCard(b, s, iid)));
  const appraisalTarget = once(() => appraisalTargetOf(b, s, board()));
  let seen: GameState | null = null;
  const redacted = (): GameState => (seen ??= redactState(s, PLAYER));
  return {
    turn: s.turn,
    round: roundOf(s),
    mood: s.collector.mood,
    intent: s.collector.intent,
    myLife: mine.life,
    foeLife: foe.life,
    get hand() {
      return hand();
    },
    get board() {
      return board();
    },
    get traps() {
      return traps();
    },
    get discard() {
      return discard();
    },
    deckCount: mine.deck.length,
    foeHandCount: foe.hand.length,
    foeDeckCount: foe.deck.length,
    get foeBoard() {
      return foeBoard();
    },
    foeTrapCount: foe.traps.filter((t) => t !== null).length,
    get foeDiscard() {
      return foeDiscard();
    },
    get foeVault() {
      return foeVault();
    },
    pendingGraft: s.pending !== null,
    winner: s.result === null ? null : s.result.winner,
    get appraisalTarget() {
      return appraisalTarget();
    },
    legal,
    after(index) {
      const a = legal[index];
      if (a === undefined) return null;
      const next = ahead.after(a);
      return next === null ? null : playerView(b, next);
    },
    previewCombat: (attacker, target) => b.engine.previewCombat(redacted(), attacker, target),
    previewGraft: () => b.engine.previewGraft(s),
    beats(attacker, defender) {
      if (attacker === null || defender === null) return false;
      const idx = elementIndex(b);
      const a = idx.get(attacker);
      const d = idx.get(defender);
      return a !== undefined && d !== undefined && b.content.beats[a * b.content.nElements + d] === 1;
    },
  };
}

/** A context for `state`: legal actions now, the view only when asked. */
export function botContext(b: Brain, s: GameState): BotContext {
  const legal = b.engine.getLegalActions(s);
  let cached: PlayerView | null = null;
  return {
    legal,
    view: () => (cached ??= playerView(b, s)),
  };
}

/** The action a bot takes in `state`. */
export function botAction(bot: Bot, b: Brain, s: GameState): Action {
  const ctx = botContext(b, s);
  const i = bot(ctx);
  const a = ctx.legal[i];
  if (a === undefined) throw new Error(`bot chose index ${i} of ${ctx.legal.length} legal actions`);
  return a;
}
