// Canonical JSON (D-191): object keys sorted by code unit, `undefined` members dropped, so the output
// does not depend on how an object was built. The second allowed key iteration in the engine, after
// deepFreeze (D-147); eslint.config.js lifts the key-iteration bans for this file only.

/** JSON text of a plain value with every object's keys in code-unit order. Throws on non-finite numbers, functions and symbols. */
export function canonicalJson(v: unknown): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return JSON.stringify(v);
    case 'number':
      if (!Number.isFinite(v)) throw new TypeError('canonicalJson: non-finite number');
      return JSON.stringify(v);
    case 'object': {
      if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalJson(x))).join(',')}]`;
      const o = v as Readonly<Record<string, unknown>>;
      const parts: string[] = [];
      for (const k of Object.keys(o).sort()) {
        const x = o[k];
        if (x !== undefined) parts.push(`${JSON.stringify(k)}:${canonicalJson(x)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof v}`);
  }
}
