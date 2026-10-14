// Keyword and Flaw files (ARCHITECTURE.md §8.4, §20 CP-3, D-111, D-123). One file per keyword or Flaw in
// keywords/. scripts/gen-keyword-index.ts writes the barrel keywords/index.gen.ts from them, and
// scripts/content-check.ts checks the files and that the barrel is current. Pure helpers, shared by both.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Globals, KeywordDef } from '@vault-duel/engine';
import { DEFAULT_GLOBALS } from './globals';
import { globalNameProblem } from './global-names';
import type { ContentError } from './files';
import { CONTENT_ROOT } from './load';

export const KEYWORD_DIR = 'keywords';
/** Generated barrel path, relative to packages/content. */
export const BARREL_FILE = 'keywords/index.gen.ts';
const BARREL_NAME = 'index.gen.ts';
/** KwMask is a 32-bit field (ARCHITECTURE.md §3, §8.4). */
export const MAX_KEYWORDS = 32;

const KIND_RANK: Readonly<Record<KeywordDef['kind'], number>> = { keyword: 0, flaw: 1 };
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** One loaded keyword file. `stem` is the file name without ".ts", which must equal `def.id`. */
export interface KeywordSource {
  readonly file: string;
  readonly stem: string;
  readonly def: KeywordDef;
}

export interface KeywordLoad {
  readonly sources: readonly KeywordSource[];
  readonly errors: readonly ContentError[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKeywordDef(value: unknown): value is KeywordDef {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    (value['kind'] === 'keyword' || value['kind'] === 'flaw') &&
    typeof value['icon'] === 'string' &&
    typeof value['visual'] === 'string' &&
    typeof value['text'] === 'string' &&
    isRecord(value['hooks'])
  );
}

/** File names in keywords/ (sorted), without the generated barrel. */
export function keywordFileNames(root: string = CONTENT_ROOT): string[] {
  return readdirSync(join(root, KEYWORD_DIR))
    .filter((name) => name.endsWith('.ts') && name !== BARREL_NAME)
    .sort();
}

/** Imports every keyword file and reads its default export. Import failures are reported, not thrown. */
export async function loadKeywordFiles(root: string = CONTENT_ROOT): Promise<KeywordLoad> {
  const sources: KeywordSource[] = [];
  const errors: ContentError[] = [];
  for (const name of keywordFileNames(root)) {
    const stem = name.slice(0, -'.ts'.length);
    const file = `${KEYWORD_DIR}/${name}`;
    let mod: unknown;
    try {
      mod = await import(pathToFileURL(join(root, KEYWORD_DIR, name)).href);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      errors.push({ file, id: stem, field: '', problem: `failed to load (${detail})`, fix: 'fix the TypeScript in this file' });
      continue;
    }
    const def: unknown = isRecord(mod) ? mod['default'] : undefined;
    if (!isKeywordDef(def)) {
      errors.push({
        file,
        id: stem,
        field: '',
        problem: 'no default export from defineKeyword({ id, name, kind, icon, visual, text, hooks })',
        fix: 'export default defineKeyword({...})',
      });
      continue;
    }
    sources.push({ file, stem, def });
  }
  return { sources, errors };
}

function problem(file: string, id: string, text: string, fix: string): ContentError {
  return { file, id, field: '', problem: text, fix };
}

/**
 * File-level rules (§10.3, "keyword file problems"): id equals the file name, ids are unique and kebab-case,
 * display strings are set, and at most MAX_KEYWORDS entries exist. The text rules (sentences on the rendered text,
 * placeholders) run in validateContent over the registry (D-172, D-198), so they are not repeated here.
 */
export function checkKeywordSources(sources: readonly KeywordSource[]): ContentError[] {
  const errors: ContentError[] = [];
  const firstFile = new Map<string, string>();
  for (const { file, stem, def } of sources) {
    if (def.id !== stem) errors.push(problem(file, stem, `id "${def.id}" ≠ file name`, 'rename the file or the id'));
    if (!KEBAB.test(def.id)) errors.push(problem(file, def.id, 'id is not kebab-case', 'use lowercase words joined by "-"'));
    const first = firstFile.get(def.id);
    if (first === undefined) firstFile.set(def.id, file);
    else errors.push(problem(file, def.id, `duplicate id (also in ${first})`, 'rename one of them'));
    for (const field of ['name', 'icon', 'visual'] as const) {
      if (def[field].trim() === '') errors.push(problem(file, def.id, `${field} is empty`, `set ${field} to a non-empty string`));
    }
  }
  if (sources.length > MAX_KEYWORDS) {
    errors.push(problem(`${KEYWORD_DIR}/`, '(all)', `${sources.length} keywords and Flaws, the bit mask holds ${MAX_KEYWORDS}`, 'remove one'));
  }
  return errors;
}

/**
 * D-169: a keyword file with no board-DSL example is a warning, not an error. DESIGN promises tests generated from the
 * examples, so a missing example is visible in content:check output without failing the run.
 */
export function checkKeywordExamples(sources: readonly KeywordSource[]): ContentError[] {
  return sources
    .filter(({ def }) => (def.examples ?? []).length === 0)
    .map(({ file, stem }) => ({
      file,
      id: stem,
      field: '',
      problem: 'no examples',
      fix: 'add one board-DSL example with declared cards (D-169)',
    }));
}

// D-171: a keyword source names a global either as a '$NAME' / '-$NAME' string (an effect value) or as num('NAME')
// (a query hook). Every such literal must resolve in either namespace. Reads the source text, so it is run on disk.
const REF_LITERAL = /['"](-?)\$([A-Za-z0-9_]+)['"]/g;
const NUM_LITERAL = /\bnum\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g;

export function checkKeywordGlobalRefs(
  sources: readonly KeywordSource[],
  globals: Globals = DEFAULT_GLOBALS,
  root: string = CONTENT_ROOT,
): ContentError[] {
  const errors: ContentError[] = [];
  for (const { file, stem } of sources) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const match of text.matchAll(REF_LITERAL)) {
      const [, sign = '', name = ''] = match;
      const issue = globalNameProblem(name, globals, `"${match[0].slice(1, -1)}"`, sign);
      if (issue) errors.push(problem(file, stem, issue.problem, issue.fix));
    }
    for (const match of text.matchAll(NUM_LITERAL)) {
      const name = match[1] ?? '';
      const issue = globalNameProblem(name, globals, `num('${name}')`);
      if (issue) errors.push(problem(file, stem, issue.problem, issue.fix));
    }
  }
  return errors;
}

/** Bit order (§8.4): keywords sorted by id, then Flaws sorted by id. */
export function sortKeywords(sources: readonly KeywordSource[]): KeywordSource[] {
  return [...sources].sort((a, b) => {
    const rank = KIND_RANK[a.def.kind] - KIND_RANK[b.def.kind];
    if (rank !== 0) return rank;
    if (a.def.id === b.def.id) return 0;
    return a.def.id < b.def.id ? -1 : 1;
  });
}

const binding = (id: string): string => `kw_${id.replace(/-/g, '_')}`;

/** The text of keywords/index.gen.ts. Identical input gives identical output, so a stale barrel is detectable. */
export function renderKeywordBarrel(sources: readonly KeywordSource[]): string {
  const sorted = sortKeywords(sources);
  const header = [
    '// GENERATED by packages/content/scripts/gen-keyword-index.ts from keywords/*.ts. Do not edit; run pnpm content:gen.',
    '// Order is the keyword bit order (ARCHITECTURE.md §8.4, D-111): keywords by id, then Flaws by id.',
    "import type { KeywordDef } from '@vault-duel/engine';",
    ...sorted.map((source) => `import ${binding(source.def.id)} from './${source.stem}';`),
    '',
  ];
  const array =
    sorted.length === 0
      ? ['export const KEYWORDS: readonly KeywordDef[] = [];']
      : ['export const KEYWORDS: readonly KeywordDef[] = [', ...sorted.map((source) => `  ${binding(source.def.id)},`), '];'];
  return [...header, ...array, ''].join('\n');
}

/** Compares the barrel on disk with what the current keyword files would generate. */
export function checkKeywordBarrel(sources: readonly KeywordSource[], root: string = CONTENT_ROOT): ContentError[] {
  let current: string;
  try {
    current = readFileSync(join(root, BARREL_FILE), 'utf8');
  } catch {
    return [problem(BARREL_FILE, '(file)', 'missing', 'run pnpm content:gen')];
  }
  if (current !== renderKeywordBarrel(sources)) {
    return [problem(BARREL_FILE, '(file)', 'stale, does not match keywords/*.ts', 'run pnpm content:gen')];
  }
  return [];
}
