// `pnpm content:check`: parses every content file with its zod schema, then runs the cross-file validator
// (ARCHITECTURE.md §10.3). Problems print in the §10.3 format. Exits 1 on any error; warnings never fail.
import { CONTENT_FILES, formatError, loadContent } from '../src/load';
import { DEFERRED_RULES, validateContent } from '../src/validate';

const result = loadContent();
const validation = validateContent(result.data);
const errors = [...result.errors, ...validation.errors];

// TODO(content milestone 2): compile (src/compile.ts, §3). It runs only when `errors` is empty, so it can
// assume typed, cross-checked data. The deckgen feasibility check (§12.3) is listed in DEFERRED_RULES.

for (const warning of validation.warnings) console.warn(`warning: ${formatError(warning)}`);

if (errors.length > 0) {
  for (const error of errors) console.error(formatError(error));
  const files = new Set(errors.map((error) => error.file)).size;
  console.error(`content:check FAILED: ${errors.length} error(s) in ${files} file(s)`);
  process.exit(1);
}

const lines = (Object.keys(CONTENT_FILES) as (keyof typeof CONTENT_FILES)[]).map(
  (key) => `  ${CONTENT_FILES[key].path.padEnd(32)} ${String(result.counts[key] ?? 0).padStart(3)}`,
);
console.log(`content:check OK: ${Object.keys(CONTENT_FILES).length} files parsed`);
console.log(lines.join('\n'));
for (const rule of DEFERRED_RULES) console.log(`not yet checked (TODO, §10.3): ${rule}`);
