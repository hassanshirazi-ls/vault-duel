// Bonus objectives for the result screen (D-102). The predicate is data: a metric, a threshold (a number or a "$GLOBAL"
// reference) and lte/gte from objectives.json. Presentation only; the 1-star-each scoring lives with stats (W2).
import type { GameState, Globals } from '@vault-duel/engine';
import type { ObjectiveInfo } from '../content/load';

function threshold(v: number | string, g: Globals): number {
  if (typeof v === 'number') return v;
  const ref = v.replace(/^[-]?\$/, '');
  const value = (g as unknown as Record<string, unknown>)[ref];
  return typeof value === 'number' ? (v.startsWith('-') ? -value : value) : Number.NaN;
}

export function objectiveMet(o: ObjectiveInfo, s: GameState, g: Globals): boolean {
  const result = s.result;
  if (result === null || result.winner !== 0) return false; // every launch objective requires a win
  const value = { grafts: s.track.grafts, playerLife: s.sides[0].life, round: result.round, appraisedLost: s.track.appraisedLost }[o.metric];
  if (o.lte !== undefined) return value <= threshold(o.lte, g);
  if (o.gte !== undefined) return value >= threshold(o.gte, g);
  return false;
}
