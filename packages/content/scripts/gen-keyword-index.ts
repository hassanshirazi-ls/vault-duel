// `pnpm content:gen`: writes keywords/index.gen.ts from keywords/*.ts (ARCHITECTURE.md §2, §8.4, D-111).
// Refuses to write when a keyword file is broken, so the barrel never encodes an invalid registry.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT_ROOT, formatError } from '../src/load';
import { BARREL_FILE, checkKeywordSources, loadKeywordFiles, renderKeywordBarrel, sortKeywords } from '../src/keyword-files';

async function main(): Promise<void> {
  const loaded = await loadKeywordFiles();
  const errors = [...loaded.errors, ...checkKeywordSources(loaded.sources)];
  if (errors.length > 0) {
    for (const error of errors) console.error(formatError(error));
    console.error(`content:gen FAILED: ${errors.length} problem(s), ${BARREL_FILE} not written`);
    process.exit(1);
  }
  writeFileSync(join(CONTENT_ROOT, BARREL_FILE), renderKeywordBarrel(loaded.sources));
  const sorted = sortKeywords(loaded.sources);
  const flaws = sorted.filter((source) => source.def.kind === 'flaw').length;
  console.log(`content:gen wrote ${BARREL_FILE}: ${sorted.length - flaws} keywords, ${flaws} Flaws`);
}

await main();
