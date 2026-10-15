// Node only ("./node" export, D-176): reads every content JSON file from a root directory, then parses it with
// parseContent (files.ts). Tests use it on temp copies; content:check uses it on the real files.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_FILES, parseContent, type ContentError, type ContentKey, type ContentLoad } from './files';

/** The packages/content directory, where the JSON data files live. */
export const CONTENT_ROOT: string = fileURLToPath(new URL('..', import.meta.url));

function readJson(root: string, path: string): { raw: unknown } | { error: ContentError } {
  try {
    return { raw: JSON.parse(readFileSync(join(root, path), 'utf8')) as unknown };
  } catch (cause) {
    const missing = cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
      error: {
        file: path,
        id: '(file)',
        field: '', // D-206: a whole-file problem has no field part; the (file) stand-in is the entry
        problem: missing ? 'file is missing' : `invalid JSON (${detail})`,
        fix: missing ? `create ${path}` : 'fix the JSON syntax',
      },
    };
  }
}

/** Reads and parses every content file under `root`. All problems are collected; nothing is thrown. */
export function loadContent(root: string = CONTENT_ROOT): ContentLoad {
  const readErrors: ContentError[] = [];
  const raw: Partial<Record<ContentKey, unknown>> = {};
  for (const key of Object.keys(CONTENT_FILES) as ContentKey[]) {
    const read = readJson(root, CONTENT_FILES[key].path);
    if ('error' in read) readErrors.push(read.error);
    else raw[key] = read.raw;
  }
  const parsed = parseContent(raw);
  return { ...parsed, errors: [...readErrors, ...parsed.errors] };
}
