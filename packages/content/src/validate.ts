// Cross-file validator (ARCHITECTURE.md §10.3, D-109, D-145). It runs after the zod pass, on whatever parsed:
// a rule whose input file failed to parse is skipped, because that file already has zod errors, so every
// problem is reported in one run. Messages follow the §10.3 examples. Pool-size checks are warnings and never fail.
import type { Cond, Effect, Globals, KeywordDef, TrapTrigger } from '@vault-duel/engine';
import { KEYWORDS } from '../keywords/index.gen';
import { DEFAULT_GLOBALS } from './globals';
import { CONTENT_FILES, type ContentData, type ContentError, type ContentKey } from './load';
import { GlobalsSchema, globalsProblems } from './schemas/globals';

export interface ValidationResult {
  readonly errors: readonly ContentError[];
  readonly warnings: readonly ContentError[];
}

/**
 * §10.3 rules that are not implemented yet. content:check prints each one, so a green run never hides them.
 * Remove an entry when its rule is implemented here.
 */
export const DEFERRED_RULES: readonly string[] = [
  // TODO(content milestone 3, needs setup/deckgen.ts from the engine, §12.3, not written yet): the generator has to
  // run on 1,000 test dates. Stays deferred until packages/engine/src/setup/deckgen.ts exists.
  'deckgen feasibility: DECK constraints satisfiable on 1,000 test dates',
];

// Covered by the zod pass in src/schemas, so not repeated here: a base card with more than one keyword
// (keywords .max(1)), a Relic without exactly one Flaw (flaw is a required string), a Flaw on a player card
// (strict object rejects "flaw"), an unknown objective metric (enum), a missing or malformed element color or
// icon, and quoted numbers.

const COVETOUS = 'covetous'; // the Flaw that is ace-only (§8.5, D-054)
const GLOBAL_REF = /^-?\$[A-Z0-9_]+$/; // same shape as GlobalRef in schemas/common.ts

/** Which refs a trap may use, per trigger (§9.1 semantics: event refs come from the triggering event). */
const TRAP_REFS: Record<TrapTrigger, readonly string[]> = {
  enemyAttack: ['attacker', 'defender'],
  enemyDirectAttack: ['attacker'],
  allyDestroyed: ['destroyed', 'destroyer'],
  enemyGraft: ['grafted'],
};

/** Triggers whose trap runs inside onAttackDeclared, the only hook where cancelAttack is valid (D-163). */
const ATTACK_TRIGGERS: readonly TrapTrigger[] = ['enemyAttack', 'enemyDirectAttack'];

const CANCEL_ATTACK_PROBLEM = '"cancelAttack" only works in a trap with trigger enemyAttack or enemyDirectAttack';
const CANCEL_ATTACK_FIX = 'remove it or change the trigger';

type Spells = NonNullable<ContentData['playerSpells']>;
type Traps = NonNullable<ContentData['playerTraps']>;

interface Sink {
  readonly errors: ContentError[];
  readonly warnings: ContentError[];
}

interface Where {
  readonly file: string;
  readonly id: string;
}

interface Ctx {
  readonly data: ContentData;
  readonly globals: Globals;
  readonly sink: Sink;
  readonly elements: readonly string[] | undefined;
  readonly kinds: readonly string[] | undefined;
  readonly keywords: ReadonlyMap<string, KeywordDef>;
}

const fileOf = (key: ContentKey): string => CONTENT_FILES[key].path;

function fail(sink: Sink, where: Where, problem: string, fix: string, field = ''): void {
  sink.errors.push({ file: where.file, id: where.id, field, problem, fix });
}

function warn(sink: Sink, where: Where, problem: string, fix: string): void {
  sink.warnings.push({ file: where.file, id: where.id, field: '', problem, fix });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Ref of an effect, when the op takes one (only the ops that have a `target` field). */
function refOf(effect: Effect): string | undefined {
  return 'target' in effect ? effect.target : undefined;
}

/**
 * Runs every implemented §10.3 rule. Never throws: problems come back as records.
 * `keywords` is the registry the keyword rules check against (the generated barrel by default, D-111).
 */
export function validateContent(
  data: ContentData,
  globals: Globals = DEFAULT_GLOBALS,
  keywords: readonly KeywordDef[] = KEYWORDS,
): ValidationResult {
  const sink: Sink = { errors: [], warnings: [] };
  const ctx: Ctx = {
    data,
    globals,
    sink,
    elements: data.elements?.map((element) => element.id),
    kinds: data.kinds?.map((kind) => kind.id),
    keywords: new Map(keywords.map((keyword) => [keyword.id, keyword] as const)),
  };
  checkGlobalsSanity(ctx);
  checkDuplicateIds(ctx);
  checkElementBeats(ctx);
  checkMonsterVocabulary(ctx);
  checkKeywordFields(ctx);
  checkStatBudget(ctx);
  checkRecipes(ctx);
  checkCollector(ctx);
  checkSpellList(ctx, 'playerSpells', data.playerSpells);
  checkSpellList(ctx, 'collectorSpells', data.collectorSpells);
  checkTrapList(ctx, 'playerTraps', data.playerTraps);
  checkTrapList(ctx, 'collectorTraps', data.collectorTraps);
  checkTwistConditions(ctx);
  checkCardText(ctx);
  checkGlobalRefs(ctx);
  checkArtBriefs(ctx);
  checkPoolSizes(ctx);
  return { errors: sink.errors, warnings: sink.warnings };
}

// Duplicate ids across every card and Chimera family (one engine index, §3). Elements, kinds, objectives and
// twists have their own namespaces and are not compared.
function checkDuplicateIds(ctx: Ctx): void {
  const { data, sink } = ctx;
  const sources: readonly [ContentKey, readonly { readonly id: string }[] | undefined][] = [
    ['playerMonsters', data.playerMonsters],
    ['playerSpells', data.playerSpells],
    ['playerTraps', data.playerTraps],
    ['relics', data.relics],
    ['collectorSpells', data.collectorSpells],
    ['collectorTraps', data.collectorTraps],
    ['recipes', data.recipes],
  ];
  const firstFile = new Map<string, string>();
  for (const [key, entries] of sources) {
    if (!entries) continue;
    const file = fileOf(key);
    for (const entry of entries) {
      const first = firstFile.get(entry.id);
      if (first === undefined) firstFile.set(entry.id, file);
      else fail(sink, { file, id: entry.id }, `duplicate id (also in ${first})`, 'rename one of them');
    }
  }
}

// elements.json: every `beats` entry must be an element id.
function checkElementBeats(ctx: Ctx): void {
  const { data, sink, elements } = ctx;
  if (!data.elements || !elements) return;
  for (const element of data.elements) {
    for (const beaten of element.beats) {
      if (!elements.includes(beaten)) {
        fail(sink, { file: fileOf('elements'), id: element.id }, `beats unknown element "${beaten}"`, 'use an id from elements.json');
      }
    }
  }
}

// Element and kind of every base monster and Relic, and the two kinds of every recipe.
function checkMonsterVocabulary(ctx: Ctx): void {
  const { data } = ctx;
  checkVocabulary(ctx, fileOf('playerMonsters'), data.playerMonsters);
  checkVocabulary(ctx, fileOf('relics'), data.relics);
  if (data.recipes) {
    for (const recipe of data.recipes) {
      for (const kind of recipe.kinds) checkKind(ctx, { file: fileOf('recipes'), id: recipe.id }, kind);
    }
  }
}

function checkVocabulary(
  ctx: Ctx,
  file: string,
  entries: readonly { readonly id: string; readonly element: string; readonly kind: string }[] | undefined,
): void {
  if (!entries) return;
  for (const entry of entries) {
    checkElement(ctx, { file, id: entry.id }, entry.element);
    checkKind(ctx, { file, id: entry.id }, entry.kind);
  }
}

function checkElement(ctx: Ctx, where: Where, value: string): void {
  if (ctx.elements && !ctx.elements.includes(value)) {
    fail(ctx.sink, where, `unknown element "${value}"`, `use one of: ${ctx.elements.join(', ')}, or add it to elements.json`);
  }
}

function checkKind(ctx: Ctx, where: Where, value: string): void {
  if (ctx.kinds && !ctx.kinds.includes(value)) {
    fail(ctx.sink, where, `unknown kind "${value}"`, `use one of: ${ctx.kinds.join(', ')}, or add it to kinds.json`);
  }
}

// Conditions reference elements and kinds by id (D-129). Checked wherever a Cond appears.
function checkCond(ctx: Ctx, where: Where, cond: Cond): void {
  if ('element' in cond) checkElement(ctx, where, cond.element);
  else if ('kind' in cond) checkKind(ctx, where, cond.kind);
  else if ('keyword' in cond) checkKeywordRef(ctx, where, cond.keyword, 'any');
  else if ('all' in cond) for (const inner of cond.all) checkCond(ctx, where, inner);
  else if ('any' in cond) for (const inner of cond.any) checkCond(ctx, where, inner);
  else if ('not' in cond) checkCond(ctx, where, cond.not);
}

function checkEffectConditions(ctx: Ctx, where: Where, effects: readonly Effect[]): void {
  for (const effect of effects) if (effect.if) checkCond(ctx, where, effect.if);
}

// D-109: Power + Guard + KEYWORD_COST × keywords must lie in [STAT_BUDGET_MIN, STAT_BUDGET_MAX].
// Base player monsters only: Relics and Chimeras are exempt.
function checkStatBudget(ctx: Ctx): void {
  const { data, globals, sink } = ctx;
  if (!data.playerMonsters) return;
  const min = globals.STAT_BUDGET_MIN;
  const max = globals.STAT_BUDGET_MAX;
  for (const monster of data.playerMonsters) {
    const cost = globals.KEYWORD_COST * monster.keywords.length;
    const total = monster.power + monster.guard + cost;
    if (total >= min && total <= max) continue;
    const keywordPart = cost > 0 ? `+${cost}kw` : '';
    const problem = `budget ${total} (P${monster.power}+G${monster.guard}${keywordPart}) outside ${min}–${max}`;
    const fix = total > max ? `lower Power or Guard by ${total - max}` : `raise Power or Guard by ${min - total}`;
    fail(sink, { file: fileOf('playerMonsters'), id: monster.id }, problem, fix);
  }
}

// recipes.json: one Chimera recipe per unordered kind pair, including the pairs of one kind with itself (§10.1).
function checkRecipes(ctx: Ctx): void {
  const { data, sink, kinds } = ctx;
  if (!data.recipes || !kinds) return;
  const file = fileOf('recipes');
  const firstRecipe = new Map<string, string>();
  for (const recipe of data.recipes) {
    const [a, b] = recipe.kinds;
    if (!kinds.includes(a) || !kinds.includes(b)) continue; // reported by checkMonsterVocabulary
    const key = [a, b].sort().join('+');
    const first = firstRecipe.get(key);
    if (first === undefined) firstRecipe.set(key, recipe.id);
    else fail(sink, { file, id: recipe.id }, `pair (${a}, ${b}) already defined by ${first}`, 'delete one');
  }
  kinds.forEach((a, i) => {
    for (const b of kinds.slice(i)) {
      if (!firstRecipe.has([a, b].sort().join('+'))) {
        fail(sink, { file, id: `(${a}, ${b})` }, 'no Chimera recipe for this kind pair', `add {"kinds":["${a}","${b}"], …}`);
      }
    }
  });
}

// Everything the Collector block refers to: deck size and pools, the Covetous ace rule, and the AI card refs (D-145).
function checkCollector(ctx: Ctx): void {
  const { data, globals, sink } = ctx;
  const collector = data.collector;
  if (!collector) return;
  const collectorFile = fileOf('collector');
  const deckSize = globals.COLLECTOR_DECK_SIZE;
  const deck = collector.deck;
  if (deck.length !== deckSize) {
    const delta = deckSize - deck.length;
    const fix = delta > 0 ? `add ${plural(delta, 'card id')}` : `remove ${plural(-delta, 'card id')}`;
    fail(sink, { file: collectorFile, id: 'deck' }, `has ${deck.length} cards, needs COLLECTOR_DECK_SIZE=${deckSize}`, fix);
  }

  // Deck entries must be Collector-pool cards. Only checked when every pool file parsed, so a missing
  // file can't turn into a false "no longer exists".
  const pools = poolIndex(data);
  if (pools) {
    deck.forEach((id, index) => {
      const where: Where = { file: collectorFile, id: `deck[${index}]` };
      const pool = pools.get(id);
      if (pool === 'collector') return;
      if (pool === 'player') fail(sink, where, `"${id}" is a player card`, 'use a card from relics.json or collector-*.json');
      else fail(sink, where, `"${id}" no longer exists`, 'remove the reference');
    });
  }

  if (data.relics) {
    for (const relic of data.relics) {
      if (relic.flaw === COVETOUS && relic.id !== collector.ace) {
        fail(sink, { file: fileOf('relics'), id: relic.id }, 'Covetous is ace-only', 'change flaw or set collector.json ace');
      }
    }
  }

  // D-145: trapPreference ids and castHighValueSpell keys must be Collector cards that are in the deck.
  const deckSet = new Set(deck);
  const collectorTraps = data.collectorTraps;
  if (collectorTraps) {
    collector.ai.trapPreference.forEach((id, index) => {
      if (!deckSet.has(id) || !collectorTraps.some((trap) => trap.id === id)) {
        fail(sink, { file: collectorFile, id: 'ai' }, `"${id}" is not a Collector trap in the deck`, 'use a trap id from collector.json › deck', `trapPreference.[${index}]`);
      }
    });
  }
  const collectorSpells = data.collectorSpells;
  const checkCast = (path: string, cast: Readonly<Record<string, unknown>> | undefined): void => {
    if (!cast || !collectorSpells) return;
    for (const key of Object.keys(cast)) {
      if (!deckSet.has(key) || !collectorSpells.some((spell) => spell.id === key)) {
        fail(sink, { file: collectorFile, id: 'ai' }, `"${key}" is not a Collector spell in the deck`, 'use a spell id from collector.json › deck', `${path}.${key}`);
      }
    }
  };
  checkCast('castHighValueSpell', collector.ai.params.castHighValueSpell);
  for (const mood of ['composed', 'agitated', 'desperate'] as const) {
    checkCast(`moods.${mood}.params.castHighValueSpell`, collector.ai.moods[mood].params?.castHighValueSpell);
  }
}

/** Pool of every card id, or undefined when a pool file failed to parse. */
function poolIndex(data: ContentData): Map<string, 'player' | 'collector'> | undefined {
  const player = [data.playerMonsters, data.playerSpells, data.playerTraps];
  const collector = [data.relics, data.collectorSpells, data.collectorTraps];
  if ([...player, ...collector].some((list) => list === undefined)) return undefined;
  const index = new Map<string, 'player' | 'collector'>();
  for (const list of player) for (const card of list ?? []) index.set(card.id, 'player');
  for (const list of collector) for (const card of list ?? []) index.set(card.id, 'collector');
  return index;
}

// Spells: the only ref a spell may use is "chosen" (its target), and a target spec and "chosen" must agree.
function checkSpellList(ctx: Ctx, key: ContentKey, spells: Spells | undefined): void {
  if (!spells) return;
  const file = fileOf(key);
  for (const spell of spells) {
    const where: Where = { file, id: spell.id };
    if (spell.target?.where) checkCond(ctx, where, spell.target.where);
    checkEffectConditions(ctx, where, spell.effects);
    let usesChosen = false;
    if (spell.effects.some((effect) => effect.op === 'cancelAttack')) {
      fail(ctx.sink, where, CANCEL_ATTACK_PROBLEM, CANCEL_ATTACK_FIX);
    }
    for (const effect of spell.effects) {
      const ref = refOf(effect);
      if (ref === undefined) continue;
      if (ref === 'chosen') usesChosen = true;
      else fail(ctx.sink, where, `ref "${ref}" is not available for spells`, 'use "chosen" with a target spec');
    }
    if (usesChosen && !spell.target) {
      fail(ctx.sink, where, 'effect uses target "chosen" but card has no "target"', 'add a target spec');
    }
    if (spell.target && !usesChosen) {
      fail(ctx.sink, where, 'has a "target" but no effect uses "chosen"', 'remove "target" or use "chosen" in an effect');
    }
  }
}

// Traps: each ref must be one the trigger makes available (TRAP_REFS).
function checkTrapList(ctx: Ctx, key: ContentKey, traps: Traps | undefined): void {
  if (!traps) return;
  const file = fileOf(key);
  for (const trap of traps) {
    const where: Where = { file, id: trap.id };
    if (trap.when) checkCond(ctx, where, trap.when);
    checkEffectConditions(ctx, where, trap.effects);
    const allowed = TRAP_REFS[trap.trigger];
    if (!ATTACK_TRIGGERS.includes(trap.trigger) && trap.effects.some((effect) => effect.op === 'cancelAttack')) {
      fail(ctx.sink, where, CANCEL_ATTACK_PROBLEM, CANCEL_ATTACK_FIX);
    }
    for (const effect of trap.effects) {
      const ref = refOf(effect);
      if (ref !== undefined && !allowed.includes(ref)) {
        fail(ctx.sink, where, `ref "${ref}" is not available for trigger "${trap.trigger}"`, `use ${allowed.join(' or ')}`);
      }
    }
  }
}

function checkTwistConditions(ctx: Ctx): void {
  const { data } = ctx;
  if (!data.twists) return;
  for (const twist of data.twists) {
    for (const modifier of twist.modifiers) checkCond(ctx, { file: fileOf('twists'), id: twist.id }, modifier.where);
  }
}

// §10.3: a card's text is one sentence (MAX_TEXT_SENTENCES). Sentences end at . ! or ? followed by a space.
function checkCardText(ctx: Ctx): void {
  const { data } = ctx;
  const texts: [string, readonly { readonly id: string; readonly text?: string | undefined }[] | undefined][] = [
    [fileOf('playerMonsters'), data.playerMonsters],
    [fileOf('relics'), data.relics],
    [fileOf('playerSpells'), data.playerSpells],
    [fileOf('playerTraps'), data.playerTraps],
    [fileOf('collectorSpells'), data.collectorSpells],
    [fileOf('collectorTraps'), data.collectorTraps],
  ];
  for (const [file, entries] of texts) {
    for (const entry of entries ?? []) {
      if (entry.text === undefined) continue;
      const sentences = entry.text.trim().split(/(?<=[.!?])\s+/).length;
      if (sentences > ctx.globals.MAX_TEXT_SENTENCES) {
        fail(ctx.sink, { file, id: entry.id }, `text has ${sentences} sentences`, 'shorten to one sentence');
      }
    }
  }
}

// Every "$NAME" / "-$NAME" string in the data must name a numeric entry of DEFAULT_GLOBALS (D-074).
// Scans every data file, so effects, Conds, objectives and AI params are all covered.
function checkGlobalRefs(ctx: Ctx): void {
  const keys: readonly ContentKey[] = [
    'elements', 'kinds', 'recipes', 'playerMonsters', 'playerSpells', 'playerTraps', 'relics',
    'collectorSpells', 'collectorTraps', 'collector', 'objectives', 'twists',
  ];
  for (const key of keys) {
    const value: unknown = ctx.data[key];
    const file = fileOf(key);
    if (Array.isArray(value)) {
      value.forEach((entry: unknown, index: number) => {
        scanGlobalRefs(ctx, { file, id: entryId(entry, index) }, entry);
      });
    } else if (isRecord(value)) {
      for (const [name, inner] of Object.entries(value)) scanGlobalRefs(ctx, { file, id: name }, inner);
    }
  }
}

function entryId(entry: unknown, index: number): string {
  return isRecord(entry) && typeof entry['id'] === 'string' ? entry['id'] : `[${index}]`;
}

function scanGlobalRefs(ctx: Ctx, where: Where, value: unknown): void {
  if (typeof value === 'string') {
    if (GLOBAL_REF.test(value)) checkGlobalRef(ctx, where, value);
  } else if (Array.isArray(value)) {
    for (const item of value) scanGlobalRefs(ctx, where, item);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) scanGlobalRefs(ctx, where, item);
  }
}

function checkGlobalRef(ctx: Ctx, where: Where, ref: string): void {
  const name = ref.replace(/^-?\$/, '');
  const values = ctx.globals as unknown as Readonly<Record<string, unknown>>;
  if (Object.hasOwn(values, name)) {
    if (typeof values[name] !== 'number') {
      fail(ctx.sink, where, `"${ref}" is not a number in globals.ts`, 'use a numeric global from globals.ts');
    }
    return;
  }
  let suggestion: string | undefined;
  let bestDistance = 3; // suggest only names within two edits
  for (const candidate of Object.keys(values)) {
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) {
      suggestion = candidate;
      bestDistance = distance;
    }
  }
  const sign = ref.startsWith('-') ? '-' : '';
  const fix = suggestion === undefined ? 'use a name from globals.ts' : `did you mean ${sign}$${suggestion}?`;
  fail(ctx.sink, where, `"${ref}" not in globals.ts`, fix);
}

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      next[j] = Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, substitution);
    }
    row = next;
  }
  return row[b.length] ?? Number.POSITIVE_INFINITY;
}

// art-briefs.json: one brief per card and Chimera family, and no briefs for ids that don't exist (D-110).
// Runs only when every card file parsed, so a missing file can't produce false "missing" errors.
function checkArtBriefs(ctx: Ctx): void {
  const { data, sink } = ctx;
  const briefs = data.artBriefs;
  const lists = [data.playerMonsters, data.playerSpells, data.playerTraps, data.relics,
    data.collectorSpells, data.collectorTraps, data.recipes];
  if (!briefs || lists.some((list) => list === undefined)) return;
  const file = fileOf('artBriefs');
  const ids = new Set(lists.flatMap((list) => (list ?? []).map((entry) => entry.id)));
  for (const id of ids) {
    if (!Object.hasOwn(briefs, id)) {
      fail(sink, { file, id }, 'missing art brief', 'add a one-line "mood · pose · palette"');
    }
  }
  for (const id of Object.keys(briefs)) {
    if (!ids.has(id)) fail(sink, { file, id }, 'orphan brief, no card or Chimera family has this id', 'delete the entry');
  }
}

/**
 * A keyword or Flaw id must be registered (keywords/<id>.ts, D-111), and of the right kind: base monsters and the
 * keyword slot of a Relic take keywords; a Relic's flaw takes a Flaw (D-114). `want: 'any'` is for Cond { keyword }.
 */
function checkKeywordRef(ctx: Ctx, where: Where, id: string, want: 'keyword' | 'flaw' | 'any'): void {
  const found = ctx.keywords.get(id);
  const listed = [...ctx.keywords.values()]
    .filter((keyword) => want === 'any' || keyword.kind === want)
    .map((keyword) => keyword.id)
    .sort();
  const noun = want === 'flaw' ? 'Flaw' : 'keyword';
  if (found === undefined) {
    fail(
      ctx.sink,
      where,
      `${noun} "${id}" is not registered`,
      `use one of: ${listed.join(', ')}, or add packages/content/keywords/${id}.ts`,
    );
    return;
  }
  if (want === 'any' || found.kind === want) return;
  const other = found.kind === 'flaw' ? 'a Flaw' : 'a keyword';
  fail(ctx.sink, where, `"${id}" is ${other}, not a ${noun}`, `use one of: ${listed.join(', ')}`);
}

// keywords[] of base monsters and Relics are keywords; a Relic's flaw is a Flaw (§10.3, D-114).
function checkKeywordFields(ctx: Ctx): void {
  const { data } = ctx;
  for (const monster of data.playerMonsters ?? []) {
    for (const id of monster.keywords) checkKeywordRef(ctx, { file: fileOf('playerMonsters'), id: monster.id }, id, 'keyword');
  }
  for (const relic of data.relics ?? []) {
    const where: Where = { file: fileOf('relics'), id: relic.id };
    for (const id of relic.keywords) checkKeywordRef(ctx, where, id, 'keyword');
    checkKeywordRef(ctx, where, relic.flaw, 'flaw');
  }
}

/**
 * globals.ts sanity (§10.3, D-147): the GlobalsSchema refinements (Range min ≤ max, APPRAISAL_ROUNDS in
 * 1…MAX_ROUNDS, WARD_CHARGES = 1). Every key of the schema is checked too, so a missing or extra key shows here.
 */
function checkGlobalsSanity(ctx: Ctx): void {
  const result = GlobalsSchema.safeParse(ctx.globals);
  if (result.success) return;
  for (const problem of globalsProblems(result.error)) {
    fail(ctx.sink, { file: 'globals.ts', id: problem.key }, problem.problem, problem.fix, problem.field);
  }
}

// Pool-size expectations (§10.3): warnings only, so content can grow.
function checkPoolSizes(ctx: Ctx): void {
  const { data, globals, sink } = ctx;
  const pools: readonly [ContentKey, readonly unknown[] | undefined, number, string, string][] = [
    ['playerMonsters', data.playerMonsters, globals.POOL_MONSTERS, 'POOL_MONSTERS', 'monsters'],
    ['playerSpells', data.playerSpells, globals.POOL_SPELLS, 'POOL_SPELLS', 'spells'],
    ['playerTraps', data.playerTraps, globals.POOL_TRAPS, 'POOL_TRAPS', 'traps'],
  ];
  for (const [key, entries, expected, name, label] of pools) {
    if (!entries || entries.length === expected) continue;
    warn(
      sink,
      { file: fileOf(key), id: 'pool' },
      `has ${entries.length} ${label}, expects ${name}=${expected}`,
      `add or remove ${label}, or change ${name} in globals.ts`,
    );
  }
}
