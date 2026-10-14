// One resolver for the names a "$NAME" ref, a keyword's num('NAME') and a text placeholder "{NAME}" may use (D-171,
// D-172): a numeric core global, or an entry of CONTENT_NUMBERS. The validator, the keyword-file scan and the
// placeholder rules all call it, so their rules and "did you mean" suggestions cannot drift apart. Browser-safe, pure.
import type { Globals } from '@vault-duel/engine';

export interface NameProblem {
  readonly problem: string;
  readonly fix: string;
}

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      next[j] = Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, substitution);
    }
    row = next;
  }
  return row[b.length] ?? Number.POSITIVE_INFINITY;
}

/** The closest name in either namespace, within two edits, or undefined. */
export function closestGlobalName(name: string, globals: Globals): string | undefined {
  const candidates = [...Object.keys(globals), ...Object.keys(globals.CONTENT_NUMBERS)];
  let suggestion: string | undefined;
  let bestDistance = 3; // suggest only names within two edits
  for (const candidate of candidates) {
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) {
      suggestion = candidate;
      bestDistance = distance;
    }
  }
  return suggestion;
}

/**
 * Undefined when `name` (without "$" or "-$") resolves to a number, else the §10.3 problem and fix.
 * `shown` is how the caller writes the ref in messages, e.g. `"$FOO"` or `num('FOO')`.
 */
export function globalNameProblem(name: string, globals: Globals, shown: string, sign = ''): NameProblem | undefined {
  const core = globals as unknown as Readonly<Record<string, unknown>>;
  if (Object.hasOwn(core, name)) {
    return typeof core[name] === 'number' ? undefined : { problem: `${shown} is not a number in globals.ts`, fix: 'use a numeric global from globals.ts' };
  }
  if (Object.hasOwn(globals.CONTENT_NUMBERS, name)) return undefined;
  const suggestion = closestGlobalName(name, globals);
  return {
    problem: `${shown} not in globals.ts`,
    fix: suggestion === undefined ? 'use a name from globals.ts or CONTENT_NUMBERS' : `did you mean ${sign}$${suggestion}?`,
  };
}

/** The same resolver for a text placeholder "{NAME}" (D-172 rules 2 and 3). Undefined when it resolves to a number. */
export function placeholderProblem(name: string, globals: Globals): NameProblem | undefined {
  const core = globals as unknown as Readonly<Record<string, unknown>>;
  if (Object.hasOwn(core, name)) {
    return typeof core[name] === 'number'
      ? undefined
      : { problem: `{${name}} is not a number in globals.ts`, fix: 'use a numeric global' };
  }
  if (Object.hasOwn(globals.CONTENT_NUMBERS, name)) return undefined;
  const suggestion = closestGlobalName(name, globals);
  return {
    problem: `unknown placeholder {${name}}`,
    fix: suggestion === undefined ? 'use a numeric name from globals.ts' : `did you mean {${suggestion}}?`,
  };
}
