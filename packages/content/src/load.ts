// Reads every content JSON file and parses it with its zod schema (ARCHITECTURE.md §3, §10.1).
// Errors are returned as structured records and rendered in the §10.3 format:
//   <file> › <entry id> › <field>: <problem> › <how to fix>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Element } from './schemas/element';
import { Kind } from './schemas/kind';
import { Recipe } from './schemas/recipe';
import { PlayerMonster, Relic, Spell, Trap } from './schemas/card';
import { Collector } from './schemas/collector';
import { Objective } from './schemas/objective';
import { Twist } from './schemas/twist';
import { ArtBriefs } from './schemas/art-brief';

/** The packages/content directory, where the JSON data files live. */
export const CONTENT_ROOT: string = fileURLToPath(new URL('..', import.meta.url));

export interface ContentFile<S extends z.ZodType = z.ZodType> {
  readonly path: string;
  readonly schema: S;
}

function file<S extends z.ZodType>(path: string, schema: S): ContentFile<S> {
  return { path, schema };
}

/** Every data file of §10.1, keyed by a short name. The keyword folder is handled separately. */
export const CONTENT_FILES = {
  elements: file('elements.json', z.array(Element)),
  kinds: file('kinds.json', z.array(Kind)),
  recipes: file('recipes.json', z.array(Recipe)),
  playerMonsters: file('cards/player-monsters.json', z.array(PlayerMonster)),
  playerSpells: file('cards/player-spells.json', z.array(Spell)),
  playerTraps: file('cards/player-traps.json', z.array(Trap)),
  relics: file('cards/relics.json', z.array(Relic)),
  collectorSpells: file('cards/collector-spells.json', z.array(Spell)),
  collectorTraps: file('cards/collector-traps.json', z.array(Trap)),
  collector: file('collector.json', Collector),
  objectives: file('objectives.json', z.array(Objective)),
  twists: file('twists.json', z.array(Twist)),
  artBriefs: file('art-briefs.json', ArtBriefs),
} as const;

export type ContentKey = keyof typeof CONTENT_FILES;

/** Parsed output per file, typed from its schema. Undefined when that file has errors. */
export type ContentData = {
  -readonly [K in ContentKey]: z.output<(typeof CONTENT_FILES)[K]['schema']> | undefined;
};

export interface ContentError {
  readonly file: string;
  readonly id: string;
  /** Dotted path inside the entry, or '' when the whole entry is the problem. */
  readonly field: string;
  readonly problem: string;
  readonly fix: string;
}

export interface ContentLoad {
  readonly data: ContentData;
  readonly errors: readonly ContentError[];
  /** Top-level entries per file: array length, record key count, or 1 for collector.json. */
  readonly counts: Readonly<Record<ContentKey, number | undefined>>;
}

/** Renders one error as a §10.3 line. An empty field (a whole-entry problem, as in the §10.3 examples) has no "field:" part. */
export function formatError(error: ContentError): string {
  const problem = error.field === '' ? error.problem : `${error.field}: ${error.problem}`;
  return `${error.file} › ${error.id} › ${problem} › ${error.fix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === 'number') current = current[key];
    else if (isRecord(current)) current = current[String(key)];
    else return undefined;
  }
  return current;
}

/** Works out which entry an issue belongs to: array index → its `id`, record key, or the file. */
function locate(raw: unknown, path: readonly PropertyKey[]): { id: string; rest: readonly PropertyKey[] } {
  const [head, ...rest] = path;
  if (Array.isArray(raw) && typeof head === 'number') {
    const entry: unknown = raw[head];
    const id = isRecord(entry) && typeof entry['id'] === 'string' ? entry['id'] : `[${head}]`;
    return { id, rest };
  }
  if (isRecord(raw) && typeof raw['id'] === 'string') return { id: raw['id'], rest: path };
  if (isRecord(raw) && head !== undefined) return { id: String(head), rest };
  return { id: '(file)', rest: path };
}

function fieldName(rest: readonly PropertyKey[]): string {
  if (rest.length === 0) return '(entry)';
  return rest.map((key) => (typeof key === 'number' ? `[${key}]` : String(key))).join('.');
}

function describeIssue(issue: z.core.$ZodIssue, raw: unknown): { problem: string; fix: string } {
  const received = JSON.stringify(valueAt(raw, issue.path)) ?? 'undefined';
  const generic = 'fix the value so it matches packages/content/src/schemas';
  switch (issue.code) {
    case 'invalid_type': {
      const expected = String(issue.expected);
      const fix = expected === 'number' || expected === 'int' ? 'write numbers without quotes' : `write a ${expected} value`;
      return { problem: `expected ${expected}, got ${received}`, fix };
    }
    case 'invalid_value':
      return { problem: `got ${received}`, fix: `use one of: ${issue.values.map(String).join(', ')}` };
    case 'invalid_format':
      return { problem: `${received} does not match the format`, fix: `change it to match ${String(issue.format)}` };
    case 'too_small':
      return { problem: `${received} is below the minimum ${String(issue.minimum)}`, fix: `use ${String(issue.minimum)} or more` };
    case 'too_big':
      return { problem: `${received} is above the maximum ${String(issue.maximum)}`, fix: `use ${String(issue.maximum)} or less` };
    case 'unrecognized_keys':
      return { problem: `unknown key(s) ${issue.keys.join(', ')}`, fix: `remove ${issue.keys.join(', ')}` };
    case 'invalid_union':
      return { problem: `${received} matches none of the allowed forms`, fix: generic };
    default:
      return { problem: issue.message, fix: generic };
  }
}

/** Parses one already-read value and returns its data, or the §10.3 error records. */
export function parseFile<S extends z.ZodType>(
  path: string,
  schema: S,
  raw: unknown,
): { data: z.output<S> } | { errors: ContentError[] } {
  const result = schema.safeParse(raw);
  if (result.success) return { data: result.data };
  const errors = result.error.issues.map((issue): ContentError => {
    const { id, rest } = locate(raw, issue.path);
    const { problem, fix } = describeIssue(issue, raw);
    return { file: path, id, field: fieldName(rest), problem, fix };
  });
  return { errors };
}

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
        field: '(file)',
        problem: missing ? 'file is missing' : `invalid JSON (${detail})`,
        fix: missing ? `create ${path}` : 'fix the JSON syntax',
      },
    };
  }
}

function countOf(data: unknown): number | undefined {
  if (Array.isArray(data)) return data.length;
  if (isRecord(data)) return Object.keys(data).length;
  return undefined;
}

/** Reads and parses every content file. All problems are collected; nothing is thrown. */
export function loadContent(root: string = CONTENT_ROOT): ContentLoad {
  const errors: ContentError[] = [];
  const data: Record<string, unknown> = {};
  const counts: Record<string, number | undefined> = {};
  for (const key of Object.keys(CONTENT_FILES) as ContentKey[]) {
    const spec: ContentFile = CONTENT_FILES[key];
    const read = readJson(root, spec.path);
    if ('error' in read) {
      errors.push(read.error);
      data[key] = undefined;
      counts[key] = undefined;
      continue;
    }
    const parsed = parseFile(spec.path, spec.schema, read.raw);
    if ('errors' in parsed) {
      errors.push(...parsed.errors);
      data[key] = undefined;
      counts[key] = undefined;
    } else {
      data[key] = parsed.data;
      counts[key] = key === 'collector' ? 1 : countOf(parsed.data);
    }
  }
  return { data: data as ContentData, errors, counts: counts as ContentLoad['counts'] };
}
