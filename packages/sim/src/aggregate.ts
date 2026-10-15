// Aggregates (ARCHITECTURE.md §15): nested records of integer counts, sums and fixed-bin histograms. Merging is
// element-wise addition, which is commutative and associative on integers, so the merged result is the same for any
// worker count, batch order or scheduling. Medians and percentiles are read from the histograms.

/** A tree whose leaves are integers; arrays are histograms (index = bin). */
export type Aggregate = { [key: string]: number | readonly number[] | Aggregate };

function isTree(value: unknown): value is Aggregate {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `target += source`, in place. Keys missing from the target are copied; histograms must have the same length. */
export function mergeInto(target: Aggregate, source: Aggregate): void {
  for (const key of Object.keys(source)) {
    const incoming = source[key] as number | readonly number[] | Aggregate;
    const current = target[key];
    if (typeof incoming === 'number') {
      target[key] = (typeof current === 'number' ? current : 0) + incoming;
    } else if (Array.isArray(incoming)) {
      const bins = incoming as readonly number[];
      const into = Array.isArray(current) ? (current as number[]) : new Array<number>(bins.length).fill(0);
      if (into.length !== bins.length) throw new Error(`histogram "${key}": ${into.length} bins against ${bins.length}`);
      for (let i = 0; i < bins.length; i++) into[i] = (into[i] as number) + (bins[i] as number);
      target[key] = into;
    } else if (isTree(incoming)) {
      const child: Aggregate = isTree(current) ? current : {};
      mergeInto(child, incoming);
      target[key] = child;
    }
  }
}

/** A new tree that is the sum of `parts`. */
export function mergeAll(parts: readonly Aggregate[]): Aggregate {
  const total: Aggregate = {};
  for (const part of parts) mergeInto(total, part);
  return total;
}

export function emptyHistogram(bins: number): number[] {
  return new Array<number>(bins).fill(0);
}

/** `tree[key]` as a child tree, created on first use. */
export function child(tree: Aggregate, key: string): Aggregate {
  const existing = tree[key];
  if (isTree(existing)) return existing;
  const made: Aggregate = {};
  tree[key] = made;
  return made;
}

/** `tree[key] += by`. */
export function bump(tree: Aggregate, key: string, by = 1): void {
  const current = tree[key];
  tree[key] = (typeof current === 'number' ? current : 0) + by;
}

/** `tree[key][bin] += by`, creating the histogram with `bins` bins on first use. */
export function bumpBin(tree: Aggregate, key: string, bins: number, bin: number, by = 1): void {
  const current = tree[key];
  const hist = Array.isArray(current) ? (current as number[]) : emptyHistogram(bins);
  hist[bin] = (hist[bin] as number) + by;
  tree[key] = hist;
}

export function num(tree: Aggregate | undefined, key: string): number {
  const v = tree?.[key];
  return typeof v === 'number' ? v : 0;
}

export function hist(tree: Aggregate | undefined, key: string): readonly number[] {
  const v = tree?.[key];
  return Array.isArray(v) ? (v as readonly number[]) : [];
}

export function sub(tree: Aggregate | undefined, key: string): Aggregate {
  const v = tree?.[key];
  return isTree(v) ? v : {};
}

export function sum(bins: readonly number[]): number {
  let total = 0;
  for (const b of bins) total += b;
  return total;
}

/** The p-quantile (0 < p ≤ 1) by nearest rank: the smallest bin whose cumulative count reaches ceil(p × n). NaN when empty. */
export function percentile(bins: readonly number[], p: number): number {
  const n = sum(bins);
  if (n === 0) return Number.NaN;
  const rank = Math.max(1, Math.ceil(p * n));
  let seen = 0;
  for (let i = 0; i < bins.length; i++) {
    seen += bins[i] as number;
    if (seen >= rank) return i;
  }
  return bins.length - 1;
}

/** The value at 1-based rank `rank` in the sorted sample the histogram stands for. */
function valueAtRank(bins: readonly number[], rank: number): number {
  let seen = 0;
  for (let i = 0; i < bins.length; i++) {
    seen += bins[i] as number;
    if (seen >= rank) return i;
  }
  return bins.length - 1;
}

/** The median: the middle value, or the mean of the two middle values for an even count. NaN when empty. */
export function median(bins: readonly number[]): number {
  const n = sum(bins);
  if (n === 0) return Number.NaN;
  if (n % 2 === 1) return valueAtRank(bins, (n + 1) / 2);
  return (valueAtRank(bins, n / 2) + valueAtRank(bins, n / 2 + 1)) / 2;
}

/** Mean of the histogram's bin indexes. NaN when empty. */
export function mean(bins: readonly number[]): number {
  const n = sum(bins);
  if (n === 0) return Number.NaN;
  let total = 0;
  for (let i = 0; i < bins.length; i++) total += i * (bins[i] as number);
  return total / n;
}

/** Stable JSON: keys sorted, 2-space indent. Used for report files and for comparing runs byte for byte. */
export function stableJson(value: unknown, indent = 2): string {
  const sorted = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sorted);
    if (typeof v === 'object' && v !== null) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v).sort()) out[key] = sorted((v as Record<string, unknown>)[key]);
      return out;
    }
    if (typeof v === 'number' && !Number.isFinite(v)) return null;
    return v;
  };
  return JSON.stringify(sorted(value), null, indent);
}
