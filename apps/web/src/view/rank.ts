// The "Best" hint for the Bond options sheet. The scoring lives in packages/ai (`rankBondOptions`, D-313): it scores each
// option with the bots' evaluation terms and names the main reason. This adapter is the only place the web app calls it,
// and turns its index-based answer into one keyed by option id. A hint, not a rule: the sheet still lists every option.
import { bondRankContext, rankBondOptions } from '@vault-duel/ai';
import type { BondPreview, Engine, GameState } from '@vault-duel/engine';
import type { GameCtx } from '../content/load';

export interface BondRank {
  /** value against doing nothing; used to order, never shown */
  readonly score: number;
  /** a few words for the biggest effect, e.g. "dodges Appraisal" */
  readonly reason: string;
}

export interface BondRanking {
  /** option id -> score and reason */
  readonly scores: ReadonlyMap<string, BondRank>;
  /** the suggested option, or null when none is worth more than doing nothing */
  readonly bestId: string | null;
}

export const NO_RANKING: BondRanking = { scores: new Map(), bestId: null };

export function bondRanking(ctx: GameCtx, engine: Engine, state: GameState, preview: BondPreview): BondRanking {
  if (preview.options.length === 0) return NO_RANKING;
  const r = rankBondOptions(preview, bondRankContext(engine, ctx.content, state));
  const scores = new Map(r.scores.map((s) => [s.id, { score: s.score, reason: s.reason }] as const));
  const best = r.best >= 0 ? preview.options[r.best] : undefined;
  return { scores, bestId: best === undefined ? null : best.id };
}
