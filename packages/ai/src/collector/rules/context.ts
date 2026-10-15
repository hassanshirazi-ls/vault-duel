// What a rule receives, and the ordering helpers every rule shares (D-090).
import type { Globals } from '@vault-duel/engine';
import type { EffectiveAi } from '../moods';
import type { TieKey } from '../config';
import type { ChoiceOf, CollectorView, ViewChoice } from '../view';

export interface RuleCtx {
  readonly view: CollectorView;
  /** the base block with the current mood merged over it */
  readonly ai: EffectiveAi;
  readonly globals: Globals;
  /** card id of his ace (`collector.json › ace`) */
  readonly aceId: string;
}

/** A play rule picks one play, or none. */
export type PlayRule = (ctx: RuleCtx) => ViewChoice | null;
/** An attack rule lists the attacks it would make, best first; the policy takes the first. */
export type AttackRule = (ctx: RuleCtx) => readonly ChoiceOf<'attack'>[];

/** What breaks a tie (D-090): a board slot (-1 when the thing has none), a card id and an instance id. */
export interface TieKeyed {
  readonly slot: number;
  readonly id: string;
  readonly iid: number;
}

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** One comparator per `tieBreak` value of the schema (D-145). */
export const TIE_KEYS: Readonly<Record<TieKey, (a: TieKeyed, b: TieKeyed) => number>> = {
  leftmostSlot: (a, b) => a.slot - b.slot,
  cardId: (a, b) => cmpStr(a.id, b.id),
  instanceId: (a, b) => a.iid - b.iid,
};

/** Comparator following `collector.json › ai.tieBreak` (leftmost slot, then card id, then instance id, by default). */
export function tieCompare(order: readonly TieKey[], a: TieKeyed, b: TieKeyed): number {
  for (const key of order) {
    const d = TIE_KEYS[key](a, b);
    if (d !== 0) return d;
  }
  return 0;
}

/** A hand card has no slot. */
export const handKey = (c: { readonly id: string; readonly iid: number }): TieKeyed => ({ slot: -1, id: c.id, iid: c.iid });
