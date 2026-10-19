// An Archimedean spiral as an SVG path (D-351): the Monarch's eyes and the slow turning backdrop behind his header.
// Pure geometry, no state. `turns` whole turns out to radius `r` around (cx, cy), 28 segments a turn.
export function spiralPath(cx: number, cy: number, turns: number, r: number): string {
  const steps = Math.max(1, Math.round(turns * 28));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * t * r).toFixed(2)} ${(cy + Math.sin(a) * t * r).toFixed(2)}`;
  }
  return d;
}
