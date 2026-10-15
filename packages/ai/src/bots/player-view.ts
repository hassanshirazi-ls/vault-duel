// The player's view (ARCHITECTURE.md §14): his own hand, board and traps, the Collector's public information, the
// number of cards in the Collector's hand, how many traps he has set, the mood and the intent. It has no field for the
// Collector's hand contents, deck order, or set-trap identities. A bot receives a `BotContext`; the view is built only
// when the bot asks, so a bot that needs no information (novice) costs nothing.
import type { Action, GameState, Intent, Mood, Side } from '@vault-duel/engine';
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
  /** the engine's legal actions for the side to move, in engine order */
  readonly legal: readonly Action[];
  /**
   * The view after taking `legal[i]`, looked ahead on `redactState(s, 0)`: the Collector's hand, deck and traps removed and
   * the player's own deck removed too (what he does not know cannot influence the answer). Hand and deck counts in the
   * returned view are therefore not real. Null if the action is refused (it targets a face-down Collector monster, D-209).
   */
  after(index: number): PlayerView | null;
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

export function playerView(b: Brain, s: GameState): PlayerView {
  const mine = s.sides[PLAYER];
  const foe = s.sides[COLLECTOR];
  const legal = b.engine.getLegalActions(s);
  const ahead = lookAhead(b, s, PLAYER);
  return {
    turn: s.turn,
    round: (s.turn >> 1) + 1,
    mood: s.collector.mood,
    intent: s.collector.intent,
    myLife: mine.life,
    foeLife: foe.life,
    hand: mine.hand.map((iid) => ownCard(b, s, iid)),
    board: mine.board.map((m, slot) => (m === null ? null : ownMonster(b, s, m, slot))),
    traps: mine.traps.map((t) => (t === null ? null : ownCard(b, s, t.iid))),
    discard: mine.discard.map((iid) => ownCard(b, s, iid)),
    deckCount: mine.deck.length,
    foeHandCount: foe.hand.length,
    foeDeckCount: foe.deck.length,
    foeBoard: foe.board.map((m, slot) => (m === null ? null : foeMonster(b, s, m, slot))),
    foeTrapCount: foe.traps.filter((t) => t !== null).length,
    foeDiscard: foe.discard.map((iid) => publicCard(b, s, iid)),
    foeVault: foe.vault.map((iid) => publicCard(b, s, iid)),
    pendingGraft: s.pending !== null,
    winner: s.result === null ? null : s.result.winner,
    legal,
    after(index) {
      const a = legal[index];
      if (a === undefined) return null;
      const next = ahead.after(a);
      return next === null ? null : playerView(b, next);
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
