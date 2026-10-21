// Naive bot (M-09, D-367): the scripted "casual player" that stands in for the novice's 20-30% target. It sees what a
// player sees (player-view), chooses only from the engine's legal list, and has no search and no randomness:
//   keep the opening hand; summon the highest-Power monster in hand face-up in attack (first legal lane); Graft only when
//   the result has at least GRAFT_MIN_POWER Power; attack with each monster whose Power is at least the displayed stat of
//   its target (Power if that monster attacks, Guard if it guards; never a face-down one); otherwise end the turn.
// It ignores spells, traps, Covetous summons, repositioning, lane moves and Appraisal timing.
import type { Action } from '@vault-duel/engine';
import type { Bot, PlayerView } from './player-view';

/** M-09's "grafts only for >= 8 Power". */
export const NAIVE_GRAFT_MIN_POWER = 8;

/** More than the longest Graft (begin, 3 materials, ascend, keywords, position) has steps; only guards a loop. */
const MAX_GRAFT_STEPS = 12;

function powerOf(v: PlayerView, iid: number): number {
  for (const c of v.hand) if (c.iid === iid) return c.power;
  for (const m of v.board) if (m !== null && m.card.iid === iid) return m.power;
  return 0;
}

/** The index of the step the naive player takes inside a Graft (-1 = none), or the cancel. */
function graftStep(v: PlayerView): number {
  let first = -1;
  let pick = -1;
  let pickPower = Number.NEGATIVE_INFINITY;
  let cancel = -1;
  for (let i = 0; i < v.legal.length; i++) {
    const a = v.legal[i] as Action;
    switch (a.t) {
      case 'graftPick': {
        const p = powerOf(v, a.m);
        if (p > pickPower) {
          pick = i;
          pickPower = p;
        }
        break;
      }
      case 'graftSkipAscend':
        return i;
      case 'graftPosition':
        if (a.pos === 0 && first < 0) first = i; // attack position, first legal lane
        break;
      case 'graftKeywords':
        if (first < 0) first = i;
        break;
      case 'graftCancel':
        cancel = i;
        break;
      default:
        break;
    }
  }
  if (pick >= 0) return pick;
  const pos = v.legal.findIndex((a) => a.t === 'graftPosition');
  if (pos >= 0) {
    const p = v.previewGraft();
    if (p === null || p.power < NAIVE_GRAFT_MIN_POWER) return cancel >= 0 ? cancel : first;
    return first >= 0 ? first : pos;
  }
  return first >= 0 ? first : cancel;
}

/** Would the naive Graft starting at `index` end with at least NAIVE_GRAFT_MIN_POWER Power? (a preview, not a search) */
function graftPays(v: PlayerView, index: number): boolean {
  let cur = v.after(index);
  for (let n = 0; n < MAX_GRAFT_STEPS && cur !== null && cur.pendingGraft; n++) {
    if (cur.legal.some((a) => a.t === 'graftPosition')) {
      const p = cur.previewGraft();
      return p !== null && p.power >= NAIVE_GRAFT_MIN_POWER;
    }
    const step = graftStep(cur);
    if (step < 0) return false;
    cur = cur.after(step);
  }
  return false;
}

export function createNaive(): Bot {
  return (ctx) => {
    const legal = ctx.legal;
    const keep = legal.findIndex((a) => a.t === 'keep');
    if (keep >= 0) return keep;
    const endTurn = legal.findIndex((a) => a.t === 'endTurn');
    const view = ctx.view();
    if (view.pendingGraft) {
      const step = graftStep(view);
      return step >= 0 ? step : 0;
    }
    // Summon: highest Power in hand, face-up attack; the first legal lane on a tie
    let best = -1;
    let bestPower = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < legal.length; i++) {
      const a = legal[i] as Action;
      if (a.t !== 'summon' || a.mode !== 'atk') continue;
      const p = powerOf(view, a.c);
      if (p > bestPower) {
        best = i;
        bestPower = p;
      }
    }
    if (best >= 0) return best;
    const graft = legal.findIndex((a) => a.t === 'graftBegin');
    if (graft >= 0 && graftPays(view, graft)) return graft;
    // Attack: the first legal attack whose attacker's Power reaches the target's displayed stat
    const mine = new Map<number, number>();
    for (const m of view.board) if (m !== null) mine.set(m.card.iid, m.power);
    for (let i = 0; i < legal.length; i++) {
      const a = legal[i] as Action;
      if (a.t !== 'attack') continue;
      const power = mine.get(a.a) ?? 0;
      if (a.target < 0) return i;
      const foe = view.foeBoard.find((m) => m !== null && !m.faceDown && m.iid === a.target);
      if (foe === undefined || foe === null || foe.faceDown) continue;
      if (power >= (foe.pos === 'atk' ? foe.power : foe.guard)) return i;
    }
    return endTurn >= 0 ? endTurn : 0;
  };
}
