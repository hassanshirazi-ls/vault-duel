// The "best option" hint for the bond preview (D-313, D-320). `engine.bondOptions(state)` returns facts about every legal bond
// action (Graft, Split, Symbiosis); this scores each option with the bots' evaluation terms (bond.weights.json, D-312) and
// names the main reason in a few words. Pure, deterministic and cheap (arithmetic over the preview, no look-ahead), so the UI
// can call it on every render. It is a hint, not a rule: the UI decides how to show it.
//
//   const preview = engine.bondOptions(state);
//   const ranking = rankBondOptions(preview, bondRankContext(engine, content, state));
//   ranking.best                    // index into preview.options of the suggested option, or -1 (none beats waiting)
//   ranking.scores[i].reason        // e.g. "dodges Appraisal", "fills a lane", "+2 Guard and Ward"
//
// The preview alone has no hand size, no keyword names and no Unstable timers of the board before the option, so the optional
// `BondRankContext` carries them. Without a field, the terms that need it are skipped, never guessed.
import type { BondKind, BondOption, BondPreview, Engine, GameState, Iid } from '@vault-duel/engine';
import type { GameContent } from '@vault-duel/content';
import { EXPERT_BOND_WEIGHTS } from './expert';
import type { ExpertWeights } from './expert';

/** What the preview does not say about the position before the option (all optional). */
export interface BondRankContext {
  /** the player's hand size now; the card cost of an option is `handCards - option.handCardsAfter` */
  readonly handCards?: number;
  /** turn index now, to tell an Unstable Chimera's last turn (`unstableUntil <= turn`) */
  readonly turn?: number;
  /** own face-up board monsters now: active keyword mask and Unstable timer, by iid */
  readonly board?: ReadonlyMap<Iid, { readonly kw: number; readonly unstableUntil: number }>;
  /** printed Power and Guard of the hand cards, by iid (what a symbiote keeps in reserve) */
  readonly hand?: ReadonlyMap<Iid, { readonly power: number; readonly guard: number }>;
  /** keyword id by bit index, to name a gained keyword in a reason */
  readonly keywordIds?: readonly string[];
}

/** One option's score and reason, aligned with `preview.options[index]`. */
export interface BondScore {
  /** index into `preview.options` */
  readonly index: number;
  readonly id: string;
  readonly kind: BondKind;
  /** value against doing nothing (0): above 0 helps, below 0 hurts. Arbitrary units; compare, do not display. */
  readonly score: number;
  /** a few words for the biggest effect, e.g. "dodges Appraisal", "fills a lane", "+2 Guard and Ward", "walks into Appraisal" */
  readonly reason: string;
}

export interface BondRanking {
  /** index of the suggested option, or -1 when none is worth more than doing nothing */
  readonly best: number;
  /** one per option, in `preview.options` order */
  readonly scores: readonly BondScore[];
  /** option indexes, best first (ties: lower index first, so the Graft, Split, Symbiosis order of the preview) */
  readonly order: readonly number[];
}

/** An option must be worth more than this (in score units) to be suggested over doing nothing. */
const MIN_WORTH = 0.5;

const capital = (s: string): string => (s.length === 0 ? s : s[0]?.toUpperCase() + s.slice(1));

/** Builds the optional context from a state and the compiled content; the preview's engine answers the keyword query. */
export function bondRankContext(engine: Engine, content: GameContent, s: GameState): BondRankContext {
  const board = new Map<Iid, { kw: number; unstableUntil: number }>();
  for (const m of s.sides[0].board) if (m !== null && !m.faceDown) board.set(m.iid, { kw: engine.activeKeywords(s, m.iid), unstableUntil: m.unstableUntil });
  const hand = new Map<Iid, { power: number; guard: number }>();
  for (const iid of s.sides[0].hand) {
    const def = (s.inst[iid] as GameState['inst'][number]).def;
    hand.set(iid, { power: content.power[def] ?? 0, guard: content.guard[def] ?? 0 });
  }
  return { handCards: s.sides[0].hand.length, turn: s.turn, board, hand, keywordIds: content.keywords.map((k) => k.id) };
}

interface Part {
  readonly value: number;
  readonly text: string;
}

/** How hard the Appraisal bites: its worth for the board `e` describes, fading with the rounds before it fires. */
function exposureCost(e: BondPreview['baseline']['exposure'], w: ExpertWeights): number {
  if (e.target < 0 || e.nextRound < 0) return 0;
  const urgency = 1 / (1 + e.turnsAway);
  const power = (w.appraisal + (w.bondAppraisalPower ?? 0)) * e.targetPower;
  return urgency * (power + w.appraisalFlat + (w.bondAppraisalCard ?? 0) * e.cardsLost);
}

function gainedKeywords(option: BondOption, ctx: BondRankContext): string[] {
  const out: string[] = [];
  if (ctx.board === undefined || ctx.keywordIds === undefined) return out;
  for (const r of option.result) {
    const before = ctx.board.get(r.iid);
    if (before === undefined) continue;
    const gained = r.kw & ~before.kw;
    for (let bit = 0; bit < ctx.keywordIds.length; bit++) if ((gained & (1 << bit)) !== 0) out.push(capital(ctx.keywordIds[bit] as string));
  }
  return out;
}

function scoreOne(preview: BondPreview, option: BondOption, ctx: BondRankContext, w: ExpertWeights): { score: number; reason: string } {
  const parts: Part[] = [];
  const base = preview.baseline;
  const put = (value: number, text: string): void => {
    if (value !== 0) parts.push({ value, text });
  };

  // Board strength and width.
  const board = w.power * option.boardPowerDelta + w.guard * option.boardGuardDelta + (w.boardWidth ?? 0) * option.bodiesDelta;
  const gained = gainedKeywords(option, ctx);
  const kwValue = (w.bondedKeyword ?? 0) * gained.length;
  const gd = option.boardGuardDelta;
  if (option.kind === 'symbiosis') {
    const host = option.result[0];
    const symbiote = host === undefined ? undefined : ctx.hand?.get(host.symbiote);
    const reserve = symbiote === undefined ? 0 : (w.symbioteReserve ?? 0) * (w.power * symbiote.power + w.guard * symbiote.guard);
    const bits = [gd !== 0 ? `${gd > 0 ? '+' : ''}${gd} Guard` : '', ...gained].filter((x) => x !== '');
    put(board + kwValue + reserve, bits.length === 0 ? 'a body in reserve' : bits.join(' and '));
  } else if (option.kind === 'split') {
    const n = option.bodiesDelta;
    put(board, n > 0 ? (n === 1 ? 'fills a lane' : `fills ${n} lanes`) : 'redeals its parts');
  } else {
    const g = option.result[0];
    put(board + kwValue, g === undefined ? 'a new Chimera' : `a ${g.power}/${g.guard} Chimera`);
  }

  // Cards spent (a Graft's hand materials, a symbiote). Absent hand size: not counted.
  if (ctx.handCards !== undefined) put(-w.handCard * (ctx.handCards - option.handCardsAfter), 'spends cards');

  // Appraisal: what the option does to the next one.
  const saved = exposureCost(base.exposure, w) - exposureCost(option.exposure, w);
  if (saved !== 0) {
    const dodged = option.exposure.target < 0 && base.exposure.target >= 0;
    const worse = saved < 0;
    put(saved, dodged ? 'dodges Appraisal' : worse ? (option.exposure.cardsLost > base.exposure.cardsLost ? 'puts 2 cards under Appraisal' : 'walks into Appraisal') : 'lowers Appraisal loss');
  }

  // Unstable timers: a Split ends one, a Graft may start one.
  if (option.kind === 'split') {
    const iid = Number(option.id.slice('split:'.length));
    const was = ctx.board?.get(iid);
    if (was !== undefined && was.unstableUntil >= 0) {
      const last = ctx.turn !== undefined && was.unstableUntil <= ctx.turn;
      put(w.unstable + (last ? (w.unstableLast ?? 0) * 8 : 0), last ? 'escapes Unstable expiry' : 'escapes Unstable timer');
    }
  } else {
    for (const r of option.result) if (r.unstableUntil >= 0) put(-w.unstable, 'Unstable');
  }

  let score = 0;
  for (const p of parts) score += p.value;
  // The reason is the biggest effect, positive if the option helps overall and negative if it hurts.
  let main: Part | undefined;
  for (const p of parts) if (main === undefined || (score >= 0 ? p.value > main.value : p.value < main.value)) main = p;
  return { score, reason: main === undefined ? 'no change' : main.text };
}

/**
 * Scores every option of `preview` against doing nothing and picks the best. `weights` are the bot weights (default: the
 * expert's, bond.weights.json); a UI that wants a different taste can pass its own.
 */
export function rankBondOptions(preview: BondPreview, ctx: BondRankContext = {}, weights: ExpertWeights = EXPERT_BOND_WEIGHTS): BondRanking {
  const scores: BondScore[] = preview.options.map((option, index) => {
    const r = scoreOne(preview, option, ctx, weights);
    return { index, id: option.id, kind: option.kind, score: r.score, reason: r.reason };
  });
  const order = scores.map((s) => s.index).sort((a, b) => (scores[b] as BondScore).score - (scores[a] as BondScore).score || a - b);
  const top = order[0];
  const best = top !== undefined && (scores[top] as BondScore).score > MIN_WORTH ? top : -1;
  return { best, scores, order };
}
