// Small derived displays: levy countdown, Monarch mood and intent, Graft preview model.
import type { Engine, GameState, Globals, Intent } from '@vault-duel/engine';
import { MOOD_NAMES } from '@vault-duel/ai';
import type { ElementInfo, GameCtx } from '../content/load';
import { roundOfState } from '../duel/turn';
import type { KeywordView } from './cards';
import { keywordViews } from './cards';

/** The levy (engine: Appraisal) happens on the Monarch's turn of each round in APPRAISAL_ROUNDS (D-075, D-350). */
export function appraisalCountdown(g: Globals, s: GameState): { readonly round: number; readonly roundsAway: number } | null {
  if (!g.FLAGS.APPRAISAL) return null;
  const now = roundOfState(s);
  const next = g.APPRAISAL_ROUNDS.filter((r) => r >= now).sort((a, b) => a - b)[0];
  return next === undefined ? null : { round: next, roundsAway: next - now };
}

export const INTENT_LABEL: Readonly<Record<Intent, { icon: string; label: string }>> = {
  attack: { icon: 'sword', label: 'He will attack' },
  appraise: { icon: 'scales', label: 'He will levy' },
  guard: { icon: 'shield', label: 'He will guard' },
  scheme: { icon: 'scroll', label: 'He is scheming' },
};

export function moodName(g: Globals, s: GameState): string | null {
  return g.FLAGS.MOODS ? (MOOD_NAMES[s.collector.mood] ?? null) : null;
}

export interface GraftPreviewView {
  readonly name: string;
  readonly element: ElementInfo | null;
  readonly power: number;
  readonly guard: number;
  readonly ascended: boolean;
  readonly unstable: boolean;
  /** the keywords it would have; empty until picked when a choice is needed */
  readonly keywords: readonly KeywordView[];
  readonly keywordChoice: boolean;
  readonly available: readonly KeywordView[];
}

export function graftPreviewView(ctx: GameCtx, engine: Engine, s: GameState): GraftPreviewView | null {
  const p = engine.previewGraft(s);
  if (p === null) return null;
  const id = ctx.content.ids[p.family] as string;
  const elementId = ctx.content.elementIds[p.element];
  return {
    name: ctx.cards.get(id)?.name ?? id,
    element: elementId === undefined ? null : (ctx.elements.get(elementId) ?? null),
    power: p.power,
    guard: p.guard,
    ascended: p.ascended,
    unstable: p.unstable,
    keywords: keywordViews(ctx, p.kw),
    keywordChoice: p.keywordOptions.length > 0,
    available: keywordViews(ctx, p.keywordsAvailable),
  };
}
