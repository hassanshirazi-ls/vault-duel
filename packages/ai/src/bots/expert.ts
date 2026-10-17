// Expert bot (ARCHITECTURE.md §14, D-094, D-222). Once per turn (and again when its plan stops matching the legal actions)
// it enumerates turn plans = {reposition subsets} x {play options, Graft variants included} x a greedy attack ordering,
// scores each plan's end-of-turn position with evaluate() (life, board, Appraisal exposure next Collector turn, Unstable
// timers, traps, element matchups, Collector Sentinels), and plays the best plan action by action through the legal list.
//
// It sees only a PlayerView, so the Collector's hand is unknown to it by construction. Everything it asks the engine goes
// through the view: `after(i)` (a redacted look-ahead copy), `previewCombat` and `previewGraft`; no engine clones.
// Look-ahead refuses an attack on a face-down Collector monster, so a plan's attack sequence stops there: the attack is its
// last action, and the bot plans again from the real state once it has been played.
//
// Bounds: a node is one reposition subset; each node keeps at most floor(maxPlans / nodes) plays, so the plans of a turn never
// exceed `maxPlans`. Only the best `finalists` by their post-play score get an attack ordering. All of these numbers, and the
// weights, are in expert.weights.json (tuning data, never pinned by a test).
import type { Action } from '@vault-duel/engine';
import { createGreedy } from './greedy';
import { evaluate, GREEDY_WEIGHTS, monsterValue } from './evaluate';
import type { EvalWeights, ExpertTerms } from './evaluate';
import type { Noise } from './noise';
import type { PublicMonster } from '../shared/cards';
import type { Bot, PlayerView } from './player-view';
import weights from './expert.weights.json';
import bond from './bond.weights.json';

/** Everything in expert.weights.json: the evaluation terms, the attack and Graft heuristics, and the search bounds. */
export interface ExpertWeights extends EvalWeights, ExpertTerms {
  /** an attack is made when its score exceeds this ... */
  readonly attackMargin: number;
  /** ... plus this per trap the Collector has set */
  readonly trapCaution: number;
  /** attack on a face-down Collector monster: score per Power above `unknownStat` */
  readonly unknownAttack: number;
  /** the stat assumed for a face-down Collector monster */
  readonly unknownStat: number;
  /** bonus for casting a spell that only draws (the look-ahead copy has no deck to draw from) */
  readonly drawSpell: number;
  /** share of a hand monster's stats counted as lost when it is a Graft material (to rank material pairs) */
  readonly graftMaterialShare: number;
  /** the most plans enumerated in one turn */
  readonly maxPlans: number;
  /** plans that get an attack ordering */
  readonly finalists: number;
  /** material pairs expanded per Graft */
  readonly graftPairs: number;
  /** complete Graft variants kept per turn */
  readonly graftVariants: number;
  /** D-312 bond settings, in bond.weights.json (absent: the defaults below): bond options kept per node (by their own score) */
  readonly maxBondOptions?: number;
  /** a Split is a candidate on a Chimera that is not exposed or Unstable only when the board has at most this many bodies */
  readonly splitThinBoard?: number;
  /** the best this many plays are combined with the bond options (both orders) when bonds use their own slot */
  readonly bondCombos?: number;
  /** hand cards tried under each host (the others are ranked out by a cheap worth before any look-ahead) */
  readonly symbiotesPerHost?: number;
  /** material pairs expanded and complete variants kept per Graft when Graft is a bond (BOND_ACTION); absent: the plain numbers */
  readonly bondGraftPairs?: number;
  readonly bondGraftVariants?: number;
  /** Graft materials tried per pick when more are legal (hand materials under BOND_ACTION) */
  readonly graftMaterials?: number;
}

/** expert.weights.json exactly: its hash is the seed check's cache key (D-222), so the bond settings are kept out of it. */
export const EXPERT_WEIGHTS: ExpertWeights = weights;

/** The expert's defaults with the bond terms and settings (bond.weights.json); the hash covers them only when a bond switch is on. */
export const EXPERT_BOND_WEIGHTS: ExpertWeights = { ...weights, ...bond.expert };

export interface ExpertStats {
  /** turns planned, plans enumerated in the last and in the largest planning, and in total */
  planned: number;
  lastPlans: number;
  maxPlans: number;
  totalPlans: number;
}

export interface ExpertOptions {
  readonly weights?: ExpertWeights;
  /** the difficulty check's decision noise (D-094); absent means none */
  readonly noise?: Noise;
}

export interface ExpertBot extends Bot {
  readonly stats: ExpertStats;
}

/** Structural equality of two actions (the engine's own is not exported). */
function sameAction(a: Action, b: Action): boolean {
  switch (a.t) {
    case 'reposition':
      return b.t === 'reposition' && a.m === b.m;
    case 'moveLane':
      return b.t === 'moveLane' && a.m === b.m && a.to === b.to;
    case 'summon':
      return b.t === 'summon' && a.c === b.c && a.mode === b.mode && a.lane === b.lane;
    case 'summonCovetous':
      return b.t === 'summonCovetous' && a.c === b.c && a.sac === b.sac && a.mode === b.mode && a.lane === b.lane;
    case 'cast':
      return b.t === 'cast' && a.c === b.c && a.target === b.target;
    case 'setTrap':
      return b.t === 'setTrap' && a.c === b.c;
    case 'split':
      return b.t === 'split' && a.m === b.m;
    case 'symbiose':
      return b.t === 'symbiose' && a.c === b.c && a.host === b.host;
    case 'graftPick':
      return b.t === 'graftPick' && a.m === b.m;
    case 'graftKeywords':
      return b.t === 'graftKeywords' && a.kw === b.kw;
    case 'graftPosition':
      return b.t === 'graftPosition' && a.pos === b.pos && a.lane === b.lane;
    case 'attack':
      return b.t === 'attack' && a.a === b.a && a.target === b.target;
    default:
      return a.t === b.t;
  }
}

/** Takes `a` in `v`; null if it is not legal there or the look-ahead refuses it. */
function step(v: PlayerView, a: Action): PlayerView | null {
  const i = v.legal.findIndex((x) => sameAction(x, a));
  return i < 0 ? null : v.after(i);
}

/** A way to reach a position from the turn's start: the actions taken, the position, and a bonus the evaluation lacks. */
interface Line {
  readonly actions: readonly Action[];
  readonly view: PlayerView;
  readonly bonus: number;
}

const isPlay = (a: Action): boolean =>
  a.t === 'summon' || a.t === 'summonCovetous' || a.t === 'cast' || a.t === 'setTrap';

export function createExpert(options: ExpertOptions = {}): ExpertBot {
  const w = options.weights ?? EXPERT_BOND_WEIGHTS;
  const maxBond = w.maxBondOptions ?? 4;
  const thinBoard = w.splitThinBoard ?? 2;
  const combos = w.bondCombos ?? 2;
  const noise = options.noise;
  const fallback = createGreedy(GREEDY_WEIGHTS);
  const stats: ExpertStats = { planned: 0, lastPlans: 0, maxPlans: 0, totalPlans: 0 };
  const queue: Action[] = [];

  const value = (power: number, guard: number, atk: boolean): number => monsterValue(w, power, guard, atk);

  // ---- Graft -----------------------------------------------------------------------------------------------------

  /** Complete Graft variants beginning with `legal[beginIndex]`: the best material pairs, every Ascend/keyword/position finish. */
  function graftLines(v: PlayerView, beginIndex: number): Line[] {
    const begin = v.legal[beginIndex];
    const p1 = v.after(beginIndex);
    if (begin === undefined || p1 === null) return [];
    const lost = (iid: number): number => {
      const onBoard = v.board.find((m) => m !== null && m.card.iid === iid);
      if (onBoard !== undefined && onBoard !== null) return value(onBoard.power, onBoard.guard, onBoard.pos === 'atk');
      const card = v.hand.find((c) => c.iid === iid);
      return card === undefined ? 0 : w.handCard + w.graftMaterialShare * (w.power * card.power + w.guard * card.guard);
    };
    const pairs: { actions: Action[]; view: PlayerView; h: number }[] = [];
    // With hand materials (BOND_ACTION, D-306) up to eight cards can be picked: only the `graftMaterials` strongest are tried
    // (by printed or board stats, a cheap proxy for the Chimera they make). With few candidates nothing is dropped.
    const worth = (iid: number): number => {
      const onBoard = v.board.find((m) => m !== null && m.card.iid === iid);
      if (onBoard !== undefined && onBoard !== null) return value(onBoard.power, onBoard.guard, true);
      const card = v.hand.find((c) => c.iid === iid);
      return card === undefined ? 0 : value(card.power, card.guard, true);
    };
    const picks = (pv: PlayerView): number[] => {
      const all: number[] = [];
      for (let i = 0; i < pv.legal.length; i++) if (pv.legal[i]?.t === 'graftPick') all.push(i);
      const cap = w.graftMaterials ?? 5;
      if (all.length <= cap) return all;
      const rankedIdx = [...all].sort((x, y) => worth((pv.legal[y] as { m: number }).m) - worth((pv.legal[x] as { m: number }).m) || x - y);
      return rankedIdx.slice(0, cap).sort((x, y) => x - y);
    };
    for (const i of picks(p1)) {
      const a1 = p1.legal[i];
      if (a1 === undefined || a1.t !== 'graftPick') continue;
      const p2 = p1.after(i);
      if (p2 === null) continue;
      for (const j of picks(p2)) {
        const a2 = p2.legal[j];
        if (a2 === undefined || a2.t !== 'graftPick') continue;
        const p3 = p2.after(j);
        const pre = p3?.previewGraft() ?? null;
        if (p3 === null || pre === null) continue;
        const h = value(pre.power, pre.guard, true) - (pre.unstable ? w.unstable : 0) - lost(a1.m) - lost(a2.m);
        pairs.push({ actions: [begin, a1, a2], view: p3, h });
      }
    }
    pairs.sort((x, y) => y.h - x.h);
    const out: Line[] = [];
    const finish = (view: PlayerView, actions: readonly Action[]): void => {
      if (!view.pendingGraft) {
        out.push({ actions, view, bonus: 0 });
        return;
      }
      for (let i = 0; i < view.legal.length; i++) {
        const a = view.legal[i];
        if (a === undefined || a.t === 'graftCancel') continue;
        const next = view.after(i);
        if (next !== null) finish(next, [...actions, a]);
      }
    };
    // Graft in the bond slot is searched on every turn, so it gets a smaller search (D-312)
    const slot = v.bondAction;
    for (const pair of pairs.slice(0, slot ? (w.bondGraftPairs ?? w.graftPairs) : w.graftPairs)) finish(pair.view, pair.actions);
    return rank(out).slice(0, slot ? (w.bondGraftVariants ?? w.graftVariants) : w.graftVariants);
  }

  const score = (l: Line): number => evaluate(l.view, w) + l.bonus;

  /** Best first; equals keep their order, so the enumeration order is the tie-break. */
  function rank(lines: readonly Line[]): Line[] {
    return lines
      .map((l, i) => ({ l, s: score(l), i }))
      .sort((x, y) => y.s - x.s || x.i - y.i)
      .map((x) => x.l);
  }

  // ---- plays -----------------------------------------------------------------------------------------------------

  /** End-of-turn identity of a position: two orders of the same plays reach the same key. */
  function viewKey(v: PlayerView): string {
    let k = '';
    for (const m of v.board) k += m === null ? '-;' : `${m.card.iid}.${m.slot}.${m.pos}.${m.faceDown ? 1 : 0}.${m.sym === null ? '' : m.sym.id}.${m.power}.${m.guard};`;
    k += '|';
    const hand = v.hand.map((c) => c.iid).sort((x, y) => x - y);
    return k + hand.join(',');
  }

  /** Is the Split/Symbiosis `a` worth considering at all (D-312 heuristics)? */
  function bondCandidate(v: PlayerView, a: Action): boolean {
    const target = v.appraisalTarget;
    if (a.t === 'split') {
      const m = v.board.find((x) => x !== null && x.card.iid === a.m);
      if (m === undefined || m === null) return false;
      if (target !== null && target.card.iid === a.m) return true; // the next Appraisal would take it
      if (m.unstableUntil >= 0) return true; // escape the timer
      return v.board.reduce((n, x) => n + (x === null ? 0 : 1), 0) <= thinBoard; // width back on a thin board
    }
    if (a.t === 'symbiose') return target === null || target.card.iid !== a.host; // never under the Appraisal target (two cards)
    return true;
  }

  /** Cheap worth of attaching hand card `c` under `host`: the keyword it adds and the body it keeps in reserve. */
  function symbioteWorth(v: PlayerView, c: number, host: number): number {
    const card = v.hand.find((x) => x.iid === c);
    const h = v.board.find((x) => x !== null && x.card.iid === host);
    if (card === undefined || h === undefined || h === null) return Number.NEGATIVE_INFINITY;
    const gained = card.keywords.filter((k) => !h.card.keywords.includes(k)).length;
    return (w.bondedKeyword ?? 0) * gained + (w.symbioteReserve ?? 0) * monsterValue(w, card.power, card.guard, true);
  }

  /** The (card, host) pairs worth a look-ahead: per host only its `symbiotesPerHost` best cards (leftmost on a tie). */
  function symbiosePairs(v: PlayerView): Set<number> {
    const keep = new Set<number>();
    const byHost = new Map<number, { i: number; worth: number }[]>();
    for (let i = 0; i < v.legal.length; i++) {
      const a = v.legal[i];
      if (a === undefined || a.t !== 'symbiose' || !bondCandidate(v, a)) continue;
      const list = byHost.get(a.host) ?? [];
      list.push({ i, worth: symbioteWorth(v, a.c, a.host) });
      byHost.set(a.host, list);
    }
    for (const list of byHost.values()) {
      list.sort((x, y) => y.worth - x.worth || x.i - y.i);
      for (const e of list.slice(0, w.symbiotesPerHost ?? 1)) keep.add(e.i);
    }
    return keep;
  }

  /** Split and Symbiosis lines from `node`'s position: the candidates of D-312, the best `limit` by their own score. */
  function lightBonds(node: Line, limit: number): Line[] {
    const v = node.view;
    const symb = symbiosePairs(v);
    const out: Line[] = [];
    for (let i = 0; i < v.legal.length; i++) {
      const a = v.legal[i];
      if (a === undefined || (a.t !== 'split' && a.t !== 'symbiose')) continue;
      if (a.t === 'split' ? !bondCandidate(v, a) : !symb.has(i)) continue;
      const next = v.after(i);
      if (next !== null) out.push({ actions: [...node.actions, a], view: next, bonus: node.bonus });
    }
    return rank(out).slice(0, limit);
  }

  /** The Graft lines from `node`'s position (a Graft is a bond when BOND_ACTION is on, a play otherwise). */
  function graftsAt(node: Line): Line[] {
    const v = node.view;
    const out: Line[] = [];
    for (let i = 0; i < v.legal.length; i++) {
      if (v.legal[i]?.t !== 'graftBegin') continue;
      for (const g of graftLines(v, i)) out.push({ actions: [...node.actions, ...g.actions], view: g.view, bonus: node.bonus });
    }
    return out;
  }

  /** Replays `tail` from `from` through the legal lists; null if an action stops being legal or the look-ahead refuses it. */
  function replay(from: PlayerView, tail: readonly Action[]): PlayerView | null {
    let cur: PlayerView | null = from;
    for (const a of tail) cur = cur === null ? null : step(cur, a);
    return cur;
  }

  /**
   * The play options at `node` (no play included), each as a Line starting from node's position. `plain` are the options a
   * node can replay (the plays); `combos` are the bonds and the play + bond pairs, tried only where they are made (they are
   * the costly ones, and a reposition rarely changes which is best).
   *
   * With the bond in its own slot (BOND_ACTION, D-306) a turn can hold a play and a bond. The bond is searched on the position
   * after each of the best `bondCombos` plays, so a Symbiosis can go under the monster just summoned; a Graft is searched
   * once (it is the costly one) and combined with the plays in both orders, since it can free the board slot a summon needs.
   * Pairs reaching the same position are kept once.
   */
  function playLines(node: Line): { plain: Line[]; combos: Line[] } {
    const v = node.view;
    const out: Line[] = [{ actions: node.actions, view: v, bonus: node.bonus }];
    const slot = v.bondAction;
    for (let i = 0; i < v.legal.length; i++) {
      const a = v.legal[i];
      if (a === undefined) continue;
      if (a.t === 'graftBegin') {
        if (!slot) for (const g of graftLines(v, i)) out.push({ actions: [...node.actions, ...g.actions], view: g.view, bonus: node.bonus });
        continue;
      }
      if (!isPlay(a)) continue;
      const next = v.after(i);
      if (next === null) continue;
      const drawn = a.t === 'cast' && v.hand.some((c) => c.iid === a.c && c.drawOnly);
      out.push({ actions: [...node.actions, a], view: next, bonus: node.bonus + (drawn ? w.drawSpell : 0) });
    }
    if (!slot) {
      return { plain: out, combos: lightBonds(node, maxBond) }; // bond-as-play: the best few compete with the plays
    }
    const grafts = rank(graftsAt(node)).slice(0, maxBond);
    const singles = [...grafts, ...lightBonds(node, maxBond)];
    const plain = out;
    const combined: Line[] = rank(singles).slice(0, maxBond);
    const seen = new Set<string>([...plain, ...combined].map((l) => viewKey(l.view)));
    const add = (actions: readonly Action[], view: PlayerView, bonus: number): void => {
      const key = viewKey(view);
      if (seen.has(key)) return;
      seen.add(key);
      combined.push({ actions, view, bonus });
    };
    const skip = node.actions.length;
    const comboGrafts = grafts.slice(0, 1);
    let firstPlay = true;
    for (const p of rank(out.slice(1)).slice(0, combos)) {
      for (const b of lightBonds(p, maxBond)) add(b.actions, b.view, p.bonus); // the bond after the play
      const pTail = p.actions.slice(skip);
      for (const g of comboGrafts) {
        const gTail = g.actions.slice(skip);
        const after = replay(p.view, gTail);
        if (after !== null) add([...p.actions, ...gTail], after, p.bonus);
        if (!firstPlay) continue;
        const first = replay(g.view, pTail);
        if (first !== null) add([...g.actions, ...pTail], first, p.bonus);
      }
      firstPlay = false;
    }
    return { plain, combos: combined };
  }

  // ---- attacks ---------------------------------------------------------------------------------------------------

  /** The worth of one attack from the engine's preview; face-down targets are guessed (look-ahead cannot apply them). */
  function attackScore(v: PlayerView, a: Extract<Action, { t: 'attack' }>): { score: number; unknown: boolean } {
    const me = v.board.find((m) => m !== null && m.card.iid === a.a);
    if (me === undefined || me === null) return { score: Number.NEGATIVE_INFINITY, unknown: false };
    let foe: PublicMonster | null = null;
    for (const f of v.foeBoard) if (f !== null && !f.faceDown && f.iid === a.target) foe = f;
    if (a.target >= 0 && foe === null) {
      return { score: w.unknownAttack * (me.power - w.unknownStat), unknown: true };
    }
    const p = v.previewCombat(a.a, a.target);
    if (!p.known) return { score: w.unknownAttack * (me.power - w.unknownStat), unknown: true };
    const o = p.outcome;
    let s = w.damage * o.dmgToDefender - w.myLife * o.dmgToAttacker;
    if (foe !== null && o.destroyDefender && !p.defenderWarded) s += value(foe.power, foe.guard, foe.pos === 'atk');
    if (o.destroyAttacker && !p.attackerWarded) s -= value(me.power, me.guard, me.pos === 'atk');
    return { score: s, unknown: false };
  }

  /** Greedy attack ordering from `line`; ends with endTurn when it is legal, or with an attack the look-ahead cannot apply. */
  function attackLine(line: Line): Line {
    let v = line.view;
    const actions = [...line.actions];
    let bonus = line.bonus;
    for (let guard = 0; guard < 32; guard++) {
      const canEnd = v.legal.some((a) => a.t === 'endTurn');
      const margin = w.attackMargin + w.trapCaution * v.foeTrapCount;
      let bestI = -1;
      let best = Number.NEGATIVE_INFINITY;
      let bestUnknown = false;
      for (let i = 0; i < v.legal.length; i++) {
        const a = v.legal[i];
        if (a === undefined || a.t !== 'attack') continue;
        const r = attackScore(v, a);
        if (r.score > best) {
          best = r.score;
          bestI = i;
          bestUnknown = r.unknown;
        }
      }
      if (bestI < 0 || (canEnd && best <= margin)) {
        if (canEnd) actions.push({ t: 'endTurn' });
        break;
      }
      const chosen = v.legal[bestI] as Action;
      actions.push(chosen);
      const next = bestUnknown ? null : v.after(bestI);
      if (next === null) {
        bonus += best;
        break;
      }
      v = next;
    }
    return { actions, view: v, bonus };
  }

  // ---- the turn ---------------------------------------------------------------------------------------------------

  /** The finalist plans of the turn from `v0`, best first. */
  function rankedPlans(v0: PlayerView): Line[] {

    // Reposition subsets: one node per subset, each built from the subset without its lowest member.
    const repos = v0.legal.filter((a) => a.t === 'reposition');
    const nodes: (Line | null)[] = [{ actions: [], view: v0, bonus: 0 }];
    for (let mask = 1; mask < 1 << repos.length; mask++) {
      const low = Math.log2(mask & -mask);
      const prev = nodes[mask & (mask - 1)];
      const view = prev === null || prev === undefined ? null : step(prev.view, repos[low] as Action);
      nodes.push(prev === null || prev === undefined || view === null ? null : { actions: [...prev.actions, repos[low] as Action], view, bonus: 0 });
    }
    const live = nodes.filter((n): n is Line => n !== null).slice(0, Math.max(1, w.maxPlans));

    // Lane moves (FLAGS.LANES, D-282): one extra node per single move from the turn's start. A move can free a lane for the
    // play, so each such node ranks its own plays. A swap is listed once (by its leftmost monster).
    const moveNodes: Line[] = [];
    for (const a of v0.legal) {
      if (a.t !== 'moveLane') continue;
      const from = v0.board.findIndex((m) => m !== null && m.card.iid === a.m);
      const partner = v0.board[a.to];
      if (partner !== null && partner !== undefined && partner.slot < from) continue;
      const view = step(v0, a);
      if (view !== null) moveNodes.push({ actions: [a], view, bonus: 0 });
    }

    // Plays: ranked at the first node, the best (maxPlans / nodes) of them are tried at every node.
    const perNode = Math.max(1, Math.floor(w.maxPlans / (live.length + moveNodes.length)));
    const first = playLines(live[0] as Line);
    const base = rank(first.plain).slice(0, perNode);
    const plans: Line[] = [...base];
    for (let n = 1; n < live.length; n++) {
      const node = live[n] as Line;
      for (const p of base) {
        const tail = p.actions.slice((live[0] as Line).actions.length);
        let view: PlayerView | null = node.view;
        for (const a of tail) view = view === null ? null : step(view, a);
        if (view !== null) plans.push({ actions: [...node.actions, ...tail], view, bonus: p.bonus });
      }
    }
    for (const node of moveNodes) plans.push(...rank(playLines(node).plain).slice(0, Math.min(perNode, Math.max(0, w.maxPlans - plans.length)))); // within the plan bound
    plans.push(...first.combos.slice(0, Math.max(0, w.maxPlans - plans.length))); // bond lines, within the plan bound
    stats.planned++;
    stats.lastPlans = plans.length;
    stats.totalPlans += plans.length;
    if (plans.length > stats.maxPlans) stats.maxPlans = plans.length;

    return rank(rank(plans).slice(0, w.finalists).map(attackLine));
  }

  const bot: Bot = (ctx) => {
    const keep = ctx.legal.findIndex((a) => a.t === 'keep');
    if (keep >= 0) {
      queue.length = 0;
      return keep;
    }
    // D-094: at each decision, with probability epsilon, the second-best option replaces the best. The options are the
    // first actions of the ranked plans, so the second best is the best plan that starts with a different action.
    const swerve = noise !== undefined && noise.swerve();
    if (swerve) queue.length = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      while (queue.length > 0) {
        const next = queue[0] as Action;
        const i = ctx.legal.findIndex((a) => sameAction(a, next));
        if (i >= 0) {
          queue.shift();
          // A spell can change what the redacted look-ahead could not see (a draw), so plan again after it.
          if (next.t === 'cast') queue.length = 0;
          return i;
        }
        queue.length = 0; // the plan no longer fits (a hidden trap, say): plan again
      }
      const v = ctx.view();
      if (v.pendingGraft) break;
      const ranked = rankedPlans(v);
      const first = ranked[0]?.actions[0];
      const other = swerve && attempt === 0 && first !== undefined ? ranked.find((l) => l.actions[0] !== undefined && !sameAction(l.actions[0], first)) : undefined;
      const chosen = other ?? ranked[0];
      if (chosen !== undefined) queue.push(...chosen.actions);
    }
    queue.length = 0;
    return fallback(ctx);
  };
  return Object.assign(bot, { stats });
}
