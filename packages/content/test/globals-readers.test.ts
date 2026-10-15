// The reader tripwire (ARCHITECTURE.md §11, D-205). Every core global and every flag is in exactly one state: read by
// non-test code or by the content JSON, pinned by GlobalsSchema, or planned in src/planned-globals.ts. A Node test:
// it reads the source tree, so it runs under vitest only (never in the browser build).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBALS as G } from '../src/globals';
import { CONTENT_FILES } from '../src/files';
import { PLANNED_GLOBALS } from '../src/planned-globals';
import { GlobalsSchema } from '../src/schemas/globals';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const CONTENT = join(REPO, 'packages', 'content');

/** Directories that are scanned: every package's src, the keyword folder and every app's src (D-205). */
function scanRoots(): string[] {
  const roots: string[] = [];
  for (const dir of ['packages', 'apps']) {
    const base = join(REPO, dir);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort()) {
      const src = join(base, name, 'src');
      if (existsSync(src)) roots.push(src);
    }
  }
  roots.push(join(CONTENT, 'keywords'));
  return roots;
}

/** Folders that are never scanned (D-205): tests, test fixtures and build output. */
const SKIPPED_DIRS: ReadonlySet<string> = new Set(['test-utils', 'dist', 'node_modules']);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED_DIRS.has(name)) found.push(...sourceFiles(path));
      continue;
    }
    if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) found.push(path);
  }
  return found;
}

/**
 * The four files that define the keys, so they name every key by definition (D-205). Any other excluded file needs a
 * comment here saying why.
 */
const DEFINING_FILES: ReadonlySet<string> = new Set([
  'packages/engine/src/types/globals.ts',
  'packages/content/src/globals.ts',
  'packages/content/src/schemas/globals.ts',
  'packages/content/src/planned-globals.ts',
]);

/** Strings are kept and comments removed, so a key named only in a comment is not a read (D-205). */
const STRING_OR_COMMENT = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

function stripComments(text: string): string {
  return text.replace(STRING_OR_COMMENT, (match: string, literal: string | undefined) => (literal !== undefined ? literal : ' '));
}

/** The names a file reads: its whole words after comments are removed (a key is read when its name is a whole word). */
function wordsOf(text: string): Set<string> {
  return new Set(stripComments(text).match(/\w+/g) ?? []);
}

/** Names read as "$NAME" in the content JSON (D-205). */
function contentRefsOf(text: string): Set<string> {
  return new Set([...text.matchAll(/"-?\$(\w+)"/g)].map((match) => match[1] ?? ''));
}

interface Key {
  /** How the key is written in planned-globals.ts and in messages: NAME, or FLAGS.NAME for a flag. */
  readonly label: string;
  /** The word that the source uses: NAME for both kinds. */
  readonly word: string;
  readonly value: unknown;
  /** The path GlobalsSchema reports for this key. */
  readonly path: readonly string[];
}

function keysOf(): Key[] {
  const core = Object.entries(G)
    .filter(([name]) => name !== 'FLAGS' && name !== 'CONTENT_NUMBERS')
    .map(([name, value]) => ({ label: name, word: name, value, path: [name] }));
  const flags = Object.entries(G.FLAGS).map(([name, value]) => ({
    label: `FLAGS.${name}`,
    word: name,
    value,
    path: ['FLAGS', name],
  }));
  return [...core, ...flags];
}

/** A key is pinned when GlobalsSchema refuses a changed value with the D-199 pin message (D-205). */
const PIN_MESSAGE = 'until the engine supports other values';

function isPinned(key: Key): boolean {
  const changed: unknown =
    typeof key.value === 'number' ? key.value + 1 : typeof key.value === 'boolean' ? !key.value : undefined;
  if (changed === undefined) return false;
  const over = key.path[0] === 'FLAGS'
    ? { ...G, FLAGS: { ...G.FLAGS, [key.word]: changed } }
    : { ...G, [key.word]: changed };
  const result = GlobalsSchema.safeParse(over);
  if (result.success) return false;
  return result.error.issues.some(
    (issue) => issue.message.includes(PIN_MESSAGE) && key.path.every((part, index) => issue.path[index] === part),
  );
}

/** Repository-relative path with forward slashes, as the messages print it. */
function repoPath(path: string): string {
  return relative(REPO, path).split(sep).join('/');
}

/** The first file (in scan order) that reads each word, with the content JSON after the source files. */
function readersOf(): { readers: Map<string, string>; scanned: number } {
  const readers = new Map<string, string>();
  const note = (word: string, file: string): void => {
    if (!readers.has(word)) readers.set(word, file);
  };
  let scanned = 0;
  for (const root of scanRoots()) {
    for (const path of sourceFiles(root)) {
      const file = repoPath(path);
      if (DEFINING_FILES.has(file)) continue;
      scanned++;
      for (const word of wordsOf(readFileSync(path, 'utf8'))) note(word, file);
    }
  }
  for (const entry of Object.values(CONTENT_FILES)) {
    const file = `packages/content/${entry.path}`;
    for (const word of contentRefsOf(readFileSync(join(CONTENT, entry.path), 'utf8'))) note(word, file);
  }
  return { readers, scanned };
}

describe('reader tripwire (D-205)', () => {
  const keys = keysOf();
  const { readers, scanned } = readersOf();
  const pinned = new Set(keys.filter(isPinned).map((key) => key.label));

  it('scans the source tree', () => {
    expect(scanned).toBeGreaterThan(0);
  });

  it('keeps every global in exactly one state: read, pinned or planned', () => {
    const problems: string[] = [];
    for (const key of keys) {
      const reader = readers.get(key.word);
      const planned = Object.hasOwn(PLANNED_GLOBALS, key.label);
      if (planned && reader !== undefined) {
        problems.push(`${key.label} is in planned-globals.ts but ${reader} reads it › delete its line from planned-globals.ts`);
      }
      if (reader === undefined && !planned && !pinned.has(key.label)) {
        problems.push(`${key.label} is read by no code › wire it, pin it in schemas/globals.ts, or add it to planned-globals.ts`);
      }
      if (planned && pinned.has(key.label)) {
        problems.push(`${key.label} is both pinned and planned › keep one`);
      }
    }
    expect(problems).toEqual([]);
  });
});
