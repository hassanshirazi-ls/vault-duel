// `pnpm content:check`: parses every content file with its zod schema, checks the keyword files and their barrel,
// then runs the cross-file validator (ARCHITECTURE.md §10.3). Problems print in the §10.3 format. Exits 1 on any
// error; warnings never fail. When there are no errors it also compiles the content (§3) as a smoke test.
import { compileContent } from '../src/compile';
import { DEFAULT_GLOBALS } from '../src/globals';
import { CONTENT_FILES, formatError } from '../src/files';
import {
  checkKeywordBarrel,
  checkKeywordGlobalRefs,
  checkKeywordSources,
  loadContent,
  loadKeywordFiles,
  sortKeywords,
} from '../src/node';
import { DEFERRED_RULES, validateContent } from '../src/validate';

const result = loadContent();
const keywordLoad = await loadKeywordFiles();
const keywordErrors = [
  ...keywordLoad.errors,
  ...checkKeywordSources(keywordLoad.sources),
  ...checkKeywordGlobalRefs(keywordLoad.sources, DEFAULT_GLOBALS),
  ...checkKeywordBarrel(keywordLoad.sources),
];
const keywordDefs = sortKeywords(keywordLoad.sources).map((source) => source.def);
const validation = validateContent(result.data, DEFAULT_GLOBALS, keywordDefs);
const errors = [...result.errors, ...keywordErrors, ...validation.errors];

for (const warning of validation.warnings) console.warn(`warning: ${formatError(warning)}`);

if (errors.length > 0) {
  for (const error of errors) console.error(formatError(error));
  const files = new Set(errors.map((error) => error.file)).size;
  console.error(`content:check FAILED: ${errors.length} error(s) in ${files} file(s)`);
  process.exit(1);
}

const compiled = compileContent(result.data, keywordDefs, DEFAULT_GLOBALS);
const lines = (Object.keys(CONTENT_FILES) as (keyof typeof CONTENT_FILES)[]).map(
  (key) => `  ${CONTENT_FILES[key].path.padEnd(32)} ${String(result.counts[key] ?? 0).padStart(3)}`,
);
const flaws = keywordDefs.filter((keyword) => keyword.kind === 'flaw').length;
console.log(`content:check OK: ${Object.keys(CONTENT_FILES).length} files parsed`);
console.log(lines.join('\n'));
console.log(`  keywords/                        ${keywordDefs.length - flaws} keywords, ${flaws} Flaws`);
console.log(`  compiled: ${compiled.ids.length} definitions, hash ${compiled.hash}`);
for (const rule of DEFERRED_RULES) console.log(`not yet checked (TODO, §10.3): ${rule}`);
