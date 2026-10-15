// Content files and parsing, pure and browser-safe (ARCHITECTURE.md §10.1, §10.3, D-176). It names every data file,
// parses already-read values with their zod schemas and renders errors in the §10.3 format. Reading from disk is
// in load.ts ("./node"); the static JSON for the web is in data.ts.
import { z } from 'zod';
import { Element } from './schemas/element';
import { Kind } from './schemas/kind';
import { Recipe } from './schemas/recipe';
import { PlayerMonster, Relic, Spell, Trap } from './schemas/card';
import { Collector } from './schemas/collector';
import { Objective } from './schemas/objective';
import { Twist } from './schemas/twist';
import { ArtBriefs } from './schemas/art-brief';

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

/** Parsed output per file, typed from its schema. Undefined when that file has errors or could not be read. */
export type ContentData = {
  -readonly [K in ContentKey]: z.output<(typeof CONTENT_FILES)[K]['schema']> | undefined;
};

/** One §10.3 record. `field` is '' when the whole entry is the problem. */
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

/** The field part of a record. '' when the whole entry is the problem, so formatError omits it (D-165, D-206). */
function fieldName(rest: readonly PropertyKey[]): string {
  if (rest.length === 0) return '';
  return rest.map((key) => (typeof key === 'number' ? `[${key}]` : String(key))).join('.');
}

/** True when the issue's path ends at a key that the object holding it does not have (D-207). */
function isAbsentKey(raw: unknown, path: readonly PropertyKey[]): boolean {
  const key = path[path.length - 1];
  if (key === undefined) return false;
  const parent = valueAt(raw, path.slice(0, -1));
  return isRecord(parent) && !Object.hasOwn(parent, String(key));
}

/** The `params.fix` a refinement sets (D-207), or undefined. */
function paramFix(issue: z.core.$ZodIssue): string | undefined {
  const params: unknown = 'params' in issue ? issue.params : undefined;
  return isRecord(params) && typeof params['fix'] === 'string' ? params['fix'] : undefined;
}

/**
 * Renders one zod issue as a §10.3 problem and fix (D-146, D-207). `file` is the content file path, so the few
 * mistakes a non-engineer makes most get plain wording. Every other problem keeps zod's wording with a fix that
 * names what to write.
 */
function describeIssue(issue: z.core.$ZodIssue, raw: unknown, file: string): { problem: string; fix: string } {
  const received = JSON.stringify(valueAt(raw, issue.path)) ?? 'undefined';
  const generic = 'fix the value so it matches packages/content/src/schemas';
  const key = issue.path[issue.path.length - 1];
  if (key !== undefined && isAbsentKey(raw, issue.path)) {
    // D-207: a missing field. A Relic's missing Flaw says why (D-202: exactly one Flaw).
    if (file === CONTENT_FILES.relics.path && key === 'flaw') {
      return { problem: 'missing, a Relic needs exactly 1 Flaw', fix: 'add "flaw": "<flaw id>"' };
    }
    return { problem: 'missing', fix: `add "${String(key)}"` };
  }
  if (
    issue.code === 'unrecognized_keys' &&
    file === CONTENT_FILES.playerMonsters.path &&
    issue.keys.length === 1 &&
    issue.keys[0] === 'flaw'
  ) {
    // D-207: a Flaw on a base monster. Flaws belong only on Relics.
    return { problem: 'Flaws appear only on Relics', fix: 'remove "flaw"' };
  }
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
      // D-207: a refinement with params.fix (custom issues) says what to write; anything else keeps the generic fix.
      return { problem: issue.message, fix: paramFix(issue) ?? generic };
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
    const { problem, fix } = describeIssue(issue, raw, path);
    return { file: path, id, field: fieldName(rest), problem, fix };
  });
  return { errors };
}

function countOf(data: unknown): number | undefined {
  if (Array.isArray(data)) return data.length;
  if (isRecord(data)) return Object.keys(data).length;
  return undefined;
}

/**
 * Parses every content file from already-read values (D-176). A key whose value is undefined is not parsed and gets
 * no errors here: its data is undefined, and the caller reports why it could not be read. All problems are collected.
 */
export function parseContent(raw: Readonly<Partial<Record<ContentKey, unknown>>>): ContentLoad {
  const errors: ContentError[] = [];
  const data: Record<string, unknown> = {};
  const counts: Record<string, number | undefined> = {};
  for (const key of Object.keys(CONTENT_FILES) as ContentKey[]) {
    const spec: ContentFile = CONTENT_FILES[key];
    const value = raw[key];
    if (value === undefined) {
      data[key] = undefined;
      counts[key] = undefined;
      continue;
    }
    const parsed = parseFile(spec.path, spec.schema, value);
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
