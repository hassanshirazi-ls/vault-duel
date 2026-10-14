// `pnpm content:check`: parses every content file with its zod schema and prints errors in the
// ARCHITECTURE.md §10.3 format. Exits 1 on any error.
import { CONTENT_FILES, formatError, loadContent } from '../src/load';

const result = loadContent();

// TODO(content milestone 2): plug the cross-file validator here (src/validate.ts, ARCHITECTURE.md §10.3):
// unknown references, duplicate ids across files, stat budget, Relic flaws, Covetous-ace, art briefs.
// TODO(content milestone 2): then compile (src/compile.ts, §3) and the deckgen feasibility check (§12.3).
// Both run only when every file parses, so they can assume typed data.

if (result.errors.length > 0) {
  for (const error of result.errors) console.error(formatError(error));
  const files = new Set(result.errors.map((error) => error.file)).size;
  console.error(`content:check FAILED: ${result.errors.length} error(s) in ${files} file(s)`);
  process.exit(1);
}

const lines = (Object.keys(CONTENT_FILES) as (keyof typeof CONTENT_FILES)[]).map(
  (key) => `  ${CONTENT_FILES[key].path.padEnd(32)} ${String(result.counts[key] ?? 0).padStart(3)}`,
);
console.log(`content:check OK: ${Object.keys(CONTENT_FILES).length} files parsed`);
console.log(lines.join('\n'));
