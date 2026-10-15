// Dev-build overrides from the query string (D-176): `?set=NAME=VALUE` (repeatable) goes to withOverrides, and
// `?debug` is a shortcut for `?set=FLAGS.DEBUG_OVERLAY=true`. Production builds ignore both (main.tsx passes []).
export function parseOverrides(search: string): string[] {
  const q = new URLSearchParams(search);
  const sets = q.getAll('set').filter((s) => s.includes('='));
  if (q.has('debug') && !sets.some((s) => s.startsWith('FLAGS.DEBUG_OVERLAY='))) sets.push('FLAGS.DEBUG_OVERLAY=true');
  return sets;
}
