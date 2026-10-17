// The element wheel (D-271), drawn from the compiled content's element list and `beats` matrix (view/wheel.ts), never
// hard-coded. `full` is the orrery ring of How to play: every advantage as a gold arrow with a tracer, and the bonus in
// the middle. `compass` is the small in-duel version (D-272): the selected card's element lit, a gold tracer arrow to
// each element it beats labelled with the bonus, and a dashed red arrow from each element that beats it. Every node is
// an element color plus its icon. Tracers are CSS animations timed in beats, so they stop with the animations flag and
// under reduced motion (both set --beat to 0).
import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { edgePath, nodePoints, outwardBend, wheelLayout, wheelSummary } from '../view/wheel';
import type { WheelLayout } from '../view/wheel';
import { elementColorVar, elementInkVar, elementStyle } from '../visual/elements';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';

const GAP = 4;

function Defs({ uid }: { readonly uid: string }) {
  const head = (id: string, color: string) => (
    <marker id={`${uid}-${id}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 L3 5 Z" style={{ fill: color }} />
    </marker>
  );
  return (
    <defs>
      {head('g', 'var(--gold-hi)')}
      {head('r', 'var(--flaw)')}
      {head('d', 'var(--iron-hi)')}
    </defs>
  );
}

function Node({ x, y, r, id, icon, name, label, state, outward }: { readonly x: number; readonly y: number; readonly r: number; readonly id: string; readonly icon: string; readonly name: string; readonly label: boolean; readonly state: 'plain' | 'lit' | 'dim' | 'foe'; readonly outward: { readonly x: number; readonly y: number } }) {
  const size = Math.round(r * 0.95);
  const ux = outward.x;
  const uy = outward.y;
  const anchor = ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
  const lx = ux * (r + 8);
  const ly = uy * (r + 8) + (uy > 0.3 ? 12 : uy < -0.3 ? -4 : 5);
  return (
    <g className="wheel-node" data-state={state} transform={`translate(${x} ${y})`}>
      <circle r={r} style={{ fill: elementColorVar(id) }} />
      <g transform={`translate(${-size / 2} ${-size / 2})`} style={{ color: elementInkVar(id) }}>
        <Glyph id={icon} size={size} />
      </g>
      {label && (
        <text x={lx} y={ly} textAnchor={anchor}>
          {name}
        </text>
      )}
    </g>
  );
}

export function ElementWheel({ variant = 'full', focus = null }: { readonly variant?: 'full' | 'compass'; readonly focus?: string | null }) {
  const ctx = useGame((s) => s.ctx);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const elements = useMemo(() => (ctx === null ? [] : [...ctx.elements.values()]), [ctx]);
  const layout: WheelLayout = useMemo(() => wheelLayout(elements), [elements]);
  if (ctx === null || elements.length < 2) return null;
  const compass = variant === 'compass';
  const focusIdx = compass && focus !== null ? layout.order.findIndex((e) => e.id === focus) : -1;
  if (compass && focusIdx < 0) return null;
  const n = layout.order.length;
  const R = compass ? 46 : 150;
  const nodeR = compass ? 13 : 27;
  const pts = nodePoints(n, R, focusIdx < 0 ? 0 : focusIdx);
  const bonus = ctx.render('+{ELEMENT_BONUS}');
  const arrow = (a: number, b: number, bend = 0, dr = 0) => edgePath(pts, a, b, a === focusIdx || b === focusIdx ? nodeR + 3 : nodeR, GAP, R + dr, bend);

  let body;
  if (compass) {
    const me = layout.order[focusIdx] as (typeof layout.order)[number];
    const out = layout.order.flatMap((e, i) => (me.beats.includes(e.id) && i !== focusIdx ? [i] : []));
    const into = layout.order.flatMap((e, i) => (e.beats.includes(me.id) && i !== focusIdx ? [i] : []));
    const touching = new Set([...out, ...into]);
    const bend = (i: number, sign: number): number => (out.includes(i) && into.includes(i) ? 9 * sign : 0);
    body = (
      <>
        {layout.edges
          .filter((e) => e.from !== focusIdx && e.to !== focusIdx)
          .map((e) => (
            <path key={`d${e.from}-${e.to}`} className="wheel-arrow dim" d={arrow(e.from, e.to).d} markerEnd={`url(#${uid}-d)`} markerStart={e.twoWay ? `url(#${uid}-d)` : undefined} />
          ))}
        {into.map((i) => (
          <path key={`r${i}`} className="wheel-arrow foe" d={arrow(i, focusIdx, bend(i, -1), bend(i, 1) === 0 ? 0 : -5).d} markerEnd={`url(#${uid}-r)`} />
        ))}
        {out.map((i, k) => {
          const p = arrow(focusIdx, i, bend(i, 1), bend(i, 1) === 0 ? 0 : 5);
          return (
            <g key={`g${i}`}>
              <path className="wheel-arrow gold" d={p.d} markerEnd={`url(#${uid}-g)`} />
              <path className="wheel-tracer" pathLength={1} d={p.d} style={{ '--k': k / Math.max(1, out.length) } as CSSProperties} />
              <text className="wheel-bonus" x={p.mid.x} y={p.mid.y - 3} textAnchor="middle">
                {bonus}
              </text>
            </g>
          );
        })}
        {layout.order.map((e, i) => {
          const p = pts[i] as (typeof pts)[number];
          const state = i === focusIdx ? 'lit' : into.includes(i) ? 'foe' : touching.has(i) ? 'plain' : 'dim';
          return <Node key={e.id} x={p.x} y={p.y} r={i === focusIdx ? nodeR + 3 : nodeR} id={e.id} icon={e.icon} name={e.name} label={false} state={state} outward={{ x: 0, y: 0 }} />;
        })}
      </>
    );
  } else {
    body = (
      <>
        <circle className="wheel-orbit" r={R} />
        <circle className="wheel-hub" r={R * 0.58} />
        {layout.edges.map((e, k) => {
          const p = arrow(e.from, e.to, outwardBend(pts, e.from, e.to, 80));
          const from = layout.order[e.from] as (typeof layout.order)[number];
          return (
            <g key={`${e.from}-${e.to}`}>
              <path className="wheel-arrow gold" d={p.d} markerEnd={`url(#${uid}-g)`} markerStart={e.twoWay ? `url(#${uid}-g)` : undefined} />
              <path className="wheel-tracer tint" pathLength={1} d={p.d} style={{ ...elementStyle(from.id), '--k': k / Math.max(1, layout.edges.length) } as CSSProperties} />
            </g>
          );
        })}
        <text className="wheel-cap" y={-R * 0.2} textAnchor="middle">
          Advantage
        </text>
        <text className="wheel-big" y={R * 0.16} textAnchor="middle">
          {bonus}
        </text>
        <text className="wheel-cap" y={R * 0.36} textAnchor="middle">
          Power
        </text>
        {layout.order.map((e, i) => {
          const p = pts[i] as (typeof pts)[number];
          return <Node key={e.id} x={p.x} y={p.y} r={nodeR} id={e.id} icon={e.icon} name={e.name} label state="plain" outward={{ x: p.x / R, y: p.y / R }} />;
        })}
      </>
    );
  }
  const summary = wheelSummary(layout);
  return (
    <svg
      className={compass ? 'wheel compass' : 'wheel'}
      viewBox={compass ? '-68 -68 136 136' : '-232 -214 464 428'}
      role="img"
      aria-label={compass ? `${(layout.order[focusIdx] as (typeof layout.order)[number]).name}: ${summary}` : `Element wheel: ${summary}`}
      data-cycle={layout.cycle ? '' : undefined}
    >
      <Defs uid={uid} />
      {body}
    </svg>
  );
}
