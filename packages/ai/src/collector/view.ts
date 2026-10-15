// The Collector's redacted view (ARCHITECTURE.md §13.1, D-086). The policy and every rule see only this type.
//
// It has no field for the player's hand contents, a face-down monster's identity, a set trap's identity, or any
// deck order: those values are never read into it. Enemy cards are named by board slot, a face-down enemy monster
// is `{ faceDown: true, slot }`, and decisions are the engine's legal actions translated one to one (`choices`).
// The few methods (previewAttack, previewSummon, after, winning...) compute answers from public information and his
// own cards on the AI side; they hand out numbers and views, never a state.
import type { Action, GameState, Iid, Monster, Mood, Side } from '@vault-duel/engine';
import { scrub } from '../shared/brain';
import type { Brain } from '../shared/brain';
import { foeMonster, ownCard, ownMonster, typeOf } from '../shared/cards';
import type { CardType, FoeMonster, OwnCard, OwnMonster, PublicCard, PublicMonster } from '../shared/cards';
import { estimateOf, UNKNOWN_ESTIMATE } from './combat-estimate';
import type { CombatEstimate } from './combat-estimate';
import { attackPotential, winningAttacks, winsAfter } from './win-search';

const PLAYER: Side = 0;
const ME: Side = 1;

export type { CardType, FoeMonster, OwnCard, OwnMonster, PublicCard, PublicMonster };

export type ChoiceTarget =
  | { readonly kind: 'none' }
  | { readonly kind: 'ownMonster'; readonly slot: number }
  | { readonly kind: 'foeMonster'; readonly slot: number; readonly faceDown: boolean }
  | { readonly kind: 'ownDiscard'; readonly card: OwnCard }
  | { readonly kind: 'foeDiscard'; readonly card: PublicCard }
  | { readonly kind: 'other' };

export type Sacrifice =
  | { readonly zone: 'board'; readonly slot: number }
  | { readonly zone: 'vault'; readonly card: OwnCard }
  | { readonly zone: 'other' };

export type SummonMode = 'atk' | 'grd' | 'down';

/** A legal action in view form. `index` is its position in `CollectorView.choices` (and in the engine's list). */
export type ViewChoice =
  | { readonly t: 'reposition'; readonly index: number; readonly slot: number }
  | { readonly t: 'summon'; readonly index: number; readonly card: OwnCard; readonly mode: SummonMode }
  | {
      readonly t: 'summonCovetous';
      readonly index: number;
      readonly card: OwnCard;
      readonly sac: Sacrifice;
      readonly mode: 'atk' | 'grd';
    }
  | { readonly t: 'cast'; readonly index: number; readonly card: OwnCard; readonly target: ChoiceTarget }
  | { readonly t: 'setTrap'; readonly index: number; readonly card: OwnCard }
  | { readonly t: 'attack'; readonly index: number; readonly slot: number; readonly target: number | 'direct' }
  | { readonly t: 'endTurn'; readonly index: number }
  /** a legal action the Collector never takes (Graft, mulligan) */
  | { readonly t: 'other'; readonly index: number };

export type ChoiceOf<T extends ViewChoice['t']> = Extract<ViewChoice, { t: T }>;

export interface SummonPreview {
  /** effective Power and Guard right after the summon */
  readonly power: number;
  readonly guard: number;
  /** a keyword holds it back from attacking on its entry turn beyond summoning sickness (Slow) */
  readonly slow: boolean;
  /** if it attacked the foe monster at `foeSlot` from attack position */
  asAttacker(foeSlot: number): CombatEstimate;
  /** if the foe monster at `foeSlot` attacked it in attack position */
  asDefender(foeSlot: number): CombatEstimate;
}

export interface CollectorView {
  readonly turn: number;
  readonly round: number;
  readonly mood: Mood;
  readonly myLife: number;
  readonly foeLife: number;
  /** Appraisal rounds not yet over, this round included */
  readonly appraisalRoundsLeft: readonly number[];
  readonly hand: readonly OwnCard[];
  readonly board: readonly (OwnMonster | null)[];
  readonly traps: readonly (OwnCard | null)[];
  readonly vault: readonly OwnCard[];
  readonly discard: readonly OwnCard[];
  readonly deckCount: number;
  readonly foeHandCount: number;
  readonly foeDeckCount: number;
  readonly foeDiscard: readonly PublicCard[];
  readonly foeBoard: readonly (FoeMonster | null)[];
  readonly foeTrapSlots: readonly boolean[];
  /** the engine's legal actions, one to one */
  readonly choices: readonly ViewChoice[];
  /** What attacking would do, from public information. `powerDelta` adds Power to the attacker (a buff spell). */
  previewAttack(attackerSlot: number, foe: number | 'direct', powerDelta?: number): CombatEstimate;
  /** A hand monster as it would be right after a summon into a free slot (Tethered, twist counted). */
  previewSummon(card: OwnCard): SummonPreview | null;
  /** The view after taking `choice` (on a copy without hidden information). Null if it cannot be applied. */
  after(choice: ViewChoice): CollectorView | null;
  /** His attacks that start a sequence he can finish with the opponent's life at 0, strongest attacker first. */
  winningAttacks(): readonly ChoiceOf<'attack'>[];
  /** After `choice` (a play), can he still finish with attacks? */
  winsAfter(choice: ViewChoice): boolean;
  /** An upper bound on the life his attackers can take this turn. */
  attackPotential(): number;
}

// ---- building ---------------------------------------------------------------------------------

/**
 * Builds the view of side 1 (the Collector) to move in `s`. This is the only function that reads the full state on
 * the AI side; what it returns holds nothing the Collector is not allowed to know.
 */
export function collectorView(b: Brain, s: GameState): CollectorView {
  return buildView(b, s).view;
}

/** The view and the engine actions its `choices` stand for, index for index. The actions never leave the AI package. */
export function buildView(b: Brain, s: GameState): { readonly view: CollectorView; readonly actions: readonly Action[] } {
  const mine = s.sides[ME];
  const foe = s.sides[PLAYER];
  const round = (s.turn >> 1) + 1;

  const hand = mine.hand.map((iid) => ownCard(b, s, iid));
  const board = mine.board.map((m, slot) => (m === null ? null : ownMonster(b, s, m, slot)));
  const traps = mine.traps.map((t) => (t === null ? null : ownCard(b, s, t.iid)));
  const vault = mine.vault.map((iid) => ownCard(b, s, iid));
  const discard = mine.discard.map((iid) => ownCard(b, s, iid));
  const foeBoard = foe.board.map((m, slot) => (m === null ? null : foeMonster(b, s, m, slot)));
  const foeDiscard: PublicCard[] = foe.discard.map((iid) => {
    const def = (s.inst[iid] as GameState['inst'][number]).def;
    return { id: b.content.ids[def] as string, type: typeOf(b, def) };
  });

  const handBy = new Map<Iid, OwnCard>();
  for (const c of hand) handBy.set(c.iid, c);
  const vaultBy = new Map<Iid, OwnCard>();
  for (const c of vault) vaultBy.set(c.iid, c);
  const discardBy = new Map<Iid, OwnCard>();
  for (const c of discard) discardBy.set(c.iid, c);
  const slotOfMine = (iid: Iid): number => mine.board.findIndex((m) => m?.iid === iid);
  const slotOfFoe = (iid: Iid): number => foe.board.findIndex((m) => m?.iid === iid);

  const targetOf = (iid: Iid): ChoiceTarget => {
    if (iid < 0) return { kind: 'none' };
    const own = slotOfMine(iid);
    if (own >= 0) return { kind: 'ownMonster', slot: own };
    const fs = slotOfFoe(iid);
    if (fs >= 0) return { kind: 'foeMonster', slot: fs, faceDown: foe.board[fs]?.faceDown === true };
    const od = discardBy.get(iid);
    if (od !== undefined) return { kind: 'ownDiscard', card: od };
    const fi = foe.discard.indexOf(iid);
    if (fi >= 0) return { kind: 'foeDiscard', card: foeDiscard[fi] as PublicCard };
    return { kind: 'other' };
  };

  const actions = b.engine.getLegalActions(s);
  const choices: ViewChoice[] = actions.map((a, index): ViewChoice => {
    switch (a.t) {
      case 'reposition':
        return { t: 'reposition', index, slot: slotOfMine(a.m) };
      case 'summon':
        return { t: 'summon', index, card: handBy.get(a.c) as OwnCard, mode: a.mode };
      case 'summonCovetous': {
        const bs = slotOfMine(a.sac);
        const vc = vaultBy.get(a.sac);
        const sac: Sacrifice = bs >= 0 ? { zone: 'board', slot: bs } : vc !== undefined ? { zone: 'vault', card: vc } : { zone: 'other' };
        return { t: 'summonCovetous', index, card: handBy.get(a.c) as OwnCard, sac, mode: a.mode };
      }
      case 'cast':
        return { t: 'cast', index, card: handBy.get(a.c) as OwnCard, target: targetOf(a.target) };
      case 'setTrap':
        return { t: 'setTrap', index, card: handBy.get(a.c) as OwnCard };
      case 'attack':
        return { t: 'attack', index, slot: slotOfMine(a.a), target: a.target < 0 ? 'direct' : slotOfFoe(a.target) };
      case 'endTurn':
        return { t: 'endTurn', index };
      default:
        return { t: 'other', index };
    }
  });

  const actionOf = (c: ViewChoice): Action => actions[c.index] as Action;

  const view: CollectorView = {
    turn: s.turn,
    round,
    mood: s.collector.mood,
    myLife: mine.life,
    foeLife: foe.life,
    appraisalRoundsLeft: b.globals.FLAGS.APPRAISAL ? b.globals.APPRAISAL_ROUNDS.filter((r) => r >= round) : [],
    hand,
    board,
    traps,
    vault,
    discard,
    deckCount: mine.deck.length,
    foeHandCount: foe.hand.length,
    foeDeckCount: foe.deck.length,
    foeDiscard,
    foeBoard,
    foeTrapSlots: foe.traps.map((t) => t !== null),
    choices,

    previewAttack(attackerSlot, foeRef, powerDelta = 0) {
      const a = mine.board[attackerSlot];
      if (a === null || a === undefined) return UNKNOWN_ESTIMATE;
      if (foeRef === 'direct') return estimateOf(b.mirror.preview(s, a.iid, -1, powerDelta));
      const t = foe.board[foeRef];
      if (t === null || t === undefined || t.faceDown) return UNKNOWN_ESTIMATE;
      return estimateOf(b.mirror.preview(s, a.iid, t.iid, powerDelta));
    },

    previewSummon(card) {
      const free = mine.board.findIndex((m) => m === null);
      if (free < 0) return null;
      const placed: Monster = {
        iid: card.iid, pos: 0, faceDown: false, entered: s.turn, repositioned: -1, attacked: -1, wardUsed: false,
        permP: 0, permG: 0, timed: [], unstableUntil: -1, shroudUntil: -1, appraised: false,
      };
      const board = mine.board.slice();
      board[free] = placed;
      const hyp: GameState = {
        ...s,
        sides: [foe, { ...mine, board, hand: mine.hand.filter((i) => i !== card.iid) }],
      };
      return {
        power: b.mirror.power(hyp, card.iid),
        guard: b.mirror.guard(hyp, card.iid),
        slow: b.mirror.restrictedOnEntry(hyp, card.iid),
        asAttacker(foeSlot) {
          const t = foe.board[foeSlot];
          if (t === null || t === undefined || t.faceDown) return UNKNOWN_ESTIMATE;
          return estimateOf(b.mirror.preview(hyp, card.iid, t.iid));
        },
        asDefender(foeSlot) {
          const t = foe.board[foeSlot];
          if (t === null || t === undefined || t.faceDown) return UNKNOWN_ESTIMATE;
          return estimateOf(b.mirror.preview(hyp, t.iid, card.iid));
        },
      };
    },

    after(choice) {
      const next = b.engine.applyAction(scrub(s, ME), actionOf(choice)).state;
      return collectorView(b, next);
    },

    winningAttacks() {
      const wins = winningAttacks(b, scrub(s, ME));
      return choices.filter(
        (c): c is ChoiceOf<'attack'> =>
          c.t === 'attack' &&
          wins.some((w) => {
            const a = actionOf(c);
            return a.t === 'attack' && a.a === w.a && a.target === w.target;
          }),
      );
    },

    winsAfter(choice) {
      return winsAfter(b, scrub(s, ME), actionOf(choice));
    },

    attackPotential() {
      return attackPotential(b, scrub(s, ME));
    },
  };
  return { view, actions };
}
