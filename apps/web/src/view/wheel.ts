// The element wheel (D-271): pure layout for the ring that explains element advantage. It reads the compiled element
// list and its `beats` matrix and nothing else, so a tuned matrix redraws the wheel with no UI change.
//
// Ordering: when every element beats exactly one other and following those arrows visits every element once (a single
// cycle, the clean five-element ring), the nodes sit in that order and every arrow goes to the clockwise neighbor.
// Any other matrix falls back to the content order, with straight (slightly bowed) chords; a pair that beat each
// other is one double-headed arrow.
import type { ElementInfo } from '../content/load';

export interface WheelEdge {
  /** indexes into `order`; `from` beats `to` */
  readonly from: number;
  readonly to: number;
  /** `to` also beats `from`: drawn as one double-headed arrow */
  readonly twoWay: boolean;
}

export interface WheelLayout {
  readonly order: readonly ElementInfo[];
  /** the matrix is a single cycle: nodes are in cycle order and each arrow goes to the clockwise neighbor */
  readonly cycle: boolean;
  readonly edges: readonly WheelEdge[];
}

/** The ids an element beats, limited to known elements and never itself. */
function beatsOf(e: ElementInfo, known: ReadonlySet<string>): string[] {
  return e.beats.filter((id) => id !== e.id && known.has(id));
}

/** The cycle order starting at the first element, or null when the matrix is not a single cycle. */
export function cycleOrder(elements: readonly ElementInfo[]): ElementInfo[] | null {
  const n = elements.length;
  if (n < 3) return null;
  const byId = new Map(elements.map((e) => [e.id, e]));
  const known = new Set(byId.keys());
  const out: ElementInfo[] = [];
  const seen = new Set<string>();
  let cur: ElementInfo | undefined = elements[0];
  while (cur !== undefined && !seen.has(cur.id)) {
    const next = beatsOf(cur, known);
    if (next.length !== 1) return null;
    seen.add(cur.id);
    out.push(cur);
    cur = byId.get(next[0] as string);
  }
  return out.length === n && cur === elements[0] ? out : null;
}

export function wheelLayout(elements: readonly ElementInfo[]): WheelLayout {
  const ring = cycleOrder(elements);
  const order = ring ?? [...elements];
  const index = new Map(order.map((e, i) => [e.id, i]));
  const known = new Set(index.keys());
  const edges: WheelEdge[] = [];
  order.forEach((e, from) => {
    for (const id of beatsOf(e, known)) {
      const to = index.get(id) as number;
      const back = (order[to] as ElementInfo).beats.includes(e.id);
      if (back && to < from) continue; // the two-way pair is drawn once, from its lower index
      edges.push({ from, to, twoWay: back });
    }
  });
  return { order, cycle: ring !== null, edges };
}

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** Node centers: the first node at the top (or `top` rotated there), clockwise, on a circle of radius `r` around 0,0. */
export function nodePoints(count: number, r: number, top = 0): Pt[] {
  return Array.from({ length: count }, (_, k) => {
    const a = ((k - top) / count) * Math.PI * 2 - Math.PI / 2;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
}

const f = (n: number): string => String(Math.round(n * 10) / 10);

/**
 * The SVG path of an arrow from node `a` to node `b`, trimmed so it starts and ends outside the nodes (`gap` px from each
 * edge). Neighbors on the ring follow it as an arc (clockwise when `b` is next after `a`, else counter-clockwise);
 * every other pair is a chord bowed by `bend` px (the control point moves that far to the left of the direction of travel).
 */
export function edgePath(points: readonly Pt[], a: number, b: number, nodeR: number, gap: number, ringR: number, bend = 0): { d: string; mid: Pt } {
  const p = points[a] as Pt;
  const q = points[b] as Pt;
  const n = points.length;
  const cw = (a + 1) % n === b;
  if (cw || (b + 1) % n === a) {
    const trim = (nodeR + gap) / ringR;
    const sign = cw ? 1 : -1;
    const a0 = Math.atan2(p.y, p.x) + sign * trim;
    let a1 = Math.atan2(q.y, q.x) - sign * trim;
    while (sign * (a1 - a0) < 0) a1 += sign * Math.PI * 2;
    const at = (t: number): Pt => ({ x: ringR * Math.cos(t), y: ringR * Math.sin(t) });
    const s = at(a0);
    const e = at(a1);
    return { d: `M${f(s.x)} ${f(s.y)}A${f(ringR)} ${f(ringR)} 0 0 ${cw ? 1 : 0} ${f(e.x)} ${f(e.y)}`, mid: at((a0 + a1) / 2) };
  }
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const t = nodeR + gap;
  const s = { x: p.x + ux * t, y: p.y + uy * t };
  const e = { x: q.x - ux * t, y: q.y - uy * t };
  const c = { x: (p.x + q.x) / 2 - uy * bend, y: (p.y + q.y) / 2 + ux * bend };
  const mid = { x: (s.x + 2 * c.x + e.x) / 4, y: (s.y + 2 * c.y + e.y) / 4 };
  return { d: bend === 0 ? `M${f(s.x)} ${f(s.y)}L${f(e.x)} ${f(e.y)}` : `M${f(s.x)} ${f(s.y)}Q${f(c.x)} ${f(c.y)} ${f(e.x)} ${f(e.y)}`, mid };
}

/** The bend that pushes a chord from `a` to `b` away from the center (so it clears the hub), `amount` px. */
export function outwardBend(points: readonly Pt[], a: number, b: number, amount: number): number {
  const p = points[a] as Pt;
  const q = points[b] as Pt;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const side = ((p.x + q.x) / 2) * (-dy / len) + ((p.y + q.y) / 2) * (dx / len);
  return side >= 0 ? amount : -amount;
}

/** "Ember beats Gale, Gale beats Tide" for the wheel's accessible name. */
export function wheelSummary(layout: WheelLayout): string {
  return layout.edges
    .map((e) => {
      const a = (layout.order[e.from] as ElementInfo).name;
      const b = (layout.order[e.to] as ElementInfo).name;
      return e.twoWay ? `${a} and ${b} beat each other` : `${a} beats ${b}`;
    })
    .join(', ');
}
