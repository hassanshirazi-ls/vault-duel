// Cross-file validator (ARCHITECTURE.md §10.3, D-109, D-145, D-172, D-185, D-198). It runs after the zod pass, on
// whatever parsed: a rule whose input file failed to parse is skipped, because that file already has zod errors, so
// every problem is reported in one run. Messages follow the §10.3 examples. Stat-budget, art-brief and placeholder
// problems that don't break play are warnings (D-167, D-172, D-174); the pool capacity is an error (D-170).
// Browser-safe: it imports nothing from node:*.
import { resolveNum } from '@vault-duel/engine';
import type { Cond, Effect, Globals, KeywordDef, TrapTrigger } from '@vault-duel/engine';
import { KEYWORDS } from '../keywords/index.gen';
import { DEFAULT_GLOBALS } from './globals';
import { CONTENT_FILES, type ContentData, type ContentError, type ContentKey } from './files';
import { globalNameProblem, placeholderProblem } from './global-names';
import { parseTemplate, plainText, renderText, type ParsedTemplate } from './text';
import { GlobalsSchema, globalsProblems } from './schemas/globals';

export interface ValidationResult {
  readonly errors: readonly ContentError[];
  readonly warnings: readonly ContentError[];
}

/**
 * §10.3 rules that are not implemented yet. content:check prints each one, so a green run never hides them.
 * Remove an entry when its rule is implemented here. Deck-generation feasibility is implemented in feasibility.ts
 * (D-200), so no rule is deferred now.
 */
export const DEFERRED_RULES: readonly string[] = [];

// Covered by the zod pass in src/schemas, so not repeated here: a Relic without exactly one Flaw (flaw is a required
// string), a Flaw on a player card (strict object rejects "flaw"), an unknown objective metric (enum), a missing or
// malformed element color or icon, and quoted numbers.

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
type Trap = Traps[number];

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
  /** The registry in the order it was given, for the keyword text rules. */
  readonly keywordList: readonly KeywordDef[];
}

const fileOf = (key: ContentKey): string => CONTENT_FILES[key].path;

function fail(sink: Sink, where: Where, problem: string, fix: string, field = ''): void {
  sink.errors.push({ file: where.file, id: where.id, field, problem, fix });
}

function warn(sink: Sink, where: Where, problem: string, fix: string, field = ''): void {
  sink.warnings.push({ file: where.file, id: where.id, field, problem, fix });
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
 * `keywordRefs` are the global names the keyword sources name ('$NAME' and num('NAME'), D-171). The unused
 * CONTENT_NUMBERS warning (D-205) runs only when they are given: content:check gives them, the browser build does not.
 */
export function validateContent(
  data: ContentData,
  globals: Globals = DEFAULT_GLOBALS,
  keywords: readonly KeywordDef[] = KEYWORDS,
  keywordRefs?: readonly string[],
): ValidationResult {
  const sink: Sink = { errors: [], warnings: [] };
  const ctx: Ctx = {
    data,
    globals,
    sink,
    elements: data.elements?.map((element) => element.id),
    kinds: data.kinds?.map((kind) => kind.id),
    keywords: new Map(keywords.map((keyword) => [keyword.id, keyword] as const)),
    keywordList: keywords,
  };
  checkGlobalsSanity(ctx);
  checkDuplicateIds(ctx);
  checkElementBeats(ctx);
  checkMonsterVocabulary(ctx);
  checkKeywordFields(ctx);
  checkKeywordCount(ctx);
  checkStatBudget(ctx);
  checkRecipes(ctx);
  checkCollector(ctx);
  checkSpellList(ctx, 'playerSpells', data.playerSpells);
  checkSpellList(ctx, 'collectorSpells', data.collectorSpells);
  checkTrapList(ctx, 'playerTraps', data.playerTraps);
  checkTrapList(ctx, 'collectorTraps', data.collectorTraps);
  checkTwistConditions(ctx);
  checkTexts(ctx);
  checkGlobalRefs(ctx);
  checkArtBriefs(ctx);
  checkPoolCapacity(ctx);
  if (keywordRefs !== undefined) checkUnusedContentNumbers(ctx, keywordRefs);
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

// D-109, D-167: Power + Guard + KEYWORD_COST × keywords must lie in [STAT_BUDGET_MIN, STAT_BUDGET_MAX].
// Base player monsters only: Relics and Chimeras are exempt. A miss is a warning, never an error (D-167).
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
    warn(sink, { file: fileOf('playerMonsters'), id: monster.id }, problem, `${fix} if this is not intended`);
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

const MOODS = ['composed', 'agitated', 'desperate'] as const;

/** The castHighValueSpell map of one params block (base or mood), keyed by Collector spell id (D-204). */
type CastMap = Readonly<Record<string, { readonly pick?: string | undefined; readonly when?: string | undefined }>>;

/**
 * D-204, D-219: "contestedAttack" reads the Power the spell gives "chosen", so the spell must give some: a resolved
 * Power above 0. A "$NAME" resolves with the validated globals. An unknown name is skipped here, because the
 * unknown-reference rule reports it. An effect with an "if" counts, because it can apply.
 */
function givesPowerToChosen(spell: Spells[number], globals: Globals): boolean {
  return spell.effects.some((effect) => {
    if (effect.op !== 'modifyStats' || effect.target !== 'chosen' || effect.power === undefined) return false;
    const power = effect.power;
    if (typeof power === 'number') return power > 0;
    const name = power.slice(power.startsWith('-') ? 2 : 1);
    if (globalNameProblem(name, globals, `"${power}"`) !== undefined) return true;
    return resolveNum(globals, power) > 0;
  });
}

/** D-177: a spell whose every effect is "draw self" needs no castHighValueSpell entry (D-085). */
function drawOnly(spell: Spells[number]): boolean {
  return spell.effects.every((effect) => effect.op === 'draw' && effect.who === 'self');
}

// Everything the Collector block refers to: deck size and pools, the ace (D-203), the Covetous ace rule, the AI card
// refs (D-145, D-204) and the Collector AI warnings (D-177).
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

  // D-203: the ace is a Relic, and it is in his deck. Run only when relics.json and every pool file parsed; the deck
  // rule runs only after the Relic rule passes.
  if (pools && data.relics) {
    const ace = collector.ace;
    const aceWhere: Where = { file: collectorFile, id: 'ace' };
    if (!data.relics.some((relic) => relic.id === ace)) {
      fail(sink, aceWhere, `"${ace}" is not a Relic`, 'use a Relic id from cards/relics.json');
    } else if (!deck.includes(ace)) {
      fail(sink, aceWhere, `"${ace}" is not in the deck`, 'add it to the deck list in collector.json');
    }
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
  const checkCast = (path: string, cast: CastMap | undefined): void => {
    if (!cast || !collectorSpells) return;
    for (const [id, entry] of Object.entries(cast)) {
      const spell = collectorSpells.find((candidate) => candidate.id === id);
      const field = `${path}.${id}`;
      if (!deckSet.has(id) || spell === undefined) {
        fail(sink, { file: collectorFile, id: 'ai' }, `"${id}" is not a Collector spell in the deck`, 'use a spell id from collector.json › deck', field);
      } else if (entry.when === 'contestedAttack' && !givesPowerToChosen(spell, globals)) {
        fail(sink, { file: collectorFile, id: 'ai' }, '"contestedAttack" needs a spell that gives Power to "chosen"', 'use "pick": "highestPower" instead', field);
      }
    }
  };
  checkCast('params.castHighValueSpell', collector.ai.params.castHighValueSpell);
  for (const mood of MOODS) {
    checkCast(`moods.${mood}.params.castHighValueSpell`, collector.ai.moods[mood].params?.castHighValueSpell);
  }

  // D-177 (warnings): a deck spell that no AI rule casts, and a deck trap that is not in trapPreference. The AI entries
  // are checked against the base and every mood, since a mood may name a spell.
  const castIds = new Set<string>([
    ...Object.keys(collector.ai.params.castHighValueSpell ?? {}),
    ...MOODS.flatMap((mood) => Object.keys(collector.ai.moods[mood].params?.castHighValueSpell ?? {})),
  ]);
  deck.forEach((id, index) => {
    const where: Where = { file: collectorFile, id: `deck[${index}]` };
    const spell = collectorSpells?.find((candidate) => candidate.id === id);
    if (spell !== undefined && !castIds.has(id) && !drawOnly(spell)) {
      warn(sink, where, `Collector spell "${id}" has no AI rule that casts it`, `add "${id}" to ai.params.castHighValueSpell with a pick, or make it draw-only`);
    }
    const trap = collectorTraps?.find((candidate) => candidate.id === id);
    if (trap !== undefined && !collector.ai.trapPreference.includes(id)) {
      warn(sink, where, `Collector trap "${id}" is not in ai.trapPreference`, 'add it, or AI rule 4 never sets it');
    }
  });
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
    checkDestroyedConditions(ctx, where, trap);
  }
}

// D-185: a trap's `when` on an allyDestroyed trigger, and an `if` on an effect that acts on "destroyed", are evaluated
// after the monster has left the board. Only the leaves that don't read the zone may be used.
const DESTROYED_LEAVES: readonly string[] = ['type', 'relic', 'chimera', 'element', 'kind', 'graftedThisTurn'];
const DESTROYED_FIX = 'use type, relic, chimera, element, kind or graftedThisTurn';

/** The leaf keys of a condition that are not in DESTROYED_LEAVES. all/any/not are walked, not reported. */
function zoneLeaves(cond: Cond): string[] {
  if ('all' in cond) return cond.all.flatMap(zoneLeaves);
  if ('any' in cond) return cond.any.flatMap(zoneLeaves);
  if ('not' in cond) return zoneLeaves(cond.not);
  const leaf = Object.keys(cond)[0] ?? '';
  return DESTROYED_LEAVES.includes(leaf) ? [] : [leaf];
}

function checkDestroyedConditions(ctx: Ctx, where: Where, trap: Trap): void {
  const conditions: Cond[] = [];
  if (trap.trigger === 'allyDestroyed' && trap.when) conditions.push(trap.when);
  for (const effect of trap.effects) {
    if (effect.if && refOf(effect) === 'destroyed') conditions.push(effect.if);
  }
  for (const condition of conditions) {
    for (const leaf of zoneLeaves(condition)) {
      fail(ctx.sink, where, `condition "${leaf}" can't be checked on a destroyed monster`, DESTROYED_FIX);
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

// ---- Text (D-172, D-198) -------------------------------------------------------------------------------------------
// Placeholders are checked in card, objective, twist and keyword text. The sentence rule (D-113) runs on the rendered
// text, so a placeholder counts as its number and word. Rules 1–3 apply everywhere; the rest are per kind of text.

const TEXT_FIX = 'write {NAME} or {NAME|word|words} with a global name in capitals';

/** Object keys that are not global references: the id, the name and the text itself. */
const NON_REF_KEYS: ReadonlySet<string> = new Set(['id', 'name', 'text']);

/** The distinct global names an entry refers to (D-074), in order: every "$NAME" or "-$NAME" outside its text. */
function refNames(entry: unknown): string[] {
  const names: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (GLOBAL_REF.test(value)) names.push(value.replace(/^-?\$/, ''));
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (isRecord(value)) {
      for (const item of Object.values(value)) walk(item);
    }
  };
  if (isRecord(entry)) {
    for (const [key, value] of Object.entries(entry)) if (!NON_REF_KEYS.has(key)) walk(value);
  }
  return [...new Set(names)];
}

/** Rules 1–3 on one template. Returns the parsed template when all of its names are clean, else undefined. */
function checkNames(ctx: Ctx, where: Where, text: string): ParsedTemplate | undefined {
  const template = parseTemplate(text);
  let clean = true;
  for (const raw of template.malformed) {
    clean = false;
    fail(ctx.sink, where, `malformed placeholder "${raw}"`, TEXT_FIX, 'text');
  }
  for (const name of template.names) {
    const problem = placeholderProblem(name, ctx.globals);
    if (problem !== undefined) {
      clean = false;
      fail(ctx.sink, where, problem.problem, problem.fix, 'text');
    }
  }
  return clean ? template : undefined;
}

/** Every distinct run of digits left once the placeholders are removed. */
function bareNumbers(template: ParsedTemplate): string[] {
  return [...new Set(plainText(template).match(/\d+/g) ?? [])];
}

/** §10.3: the rendered text is one sentence (MAX_TEXT_SENTENCES). Sentences end at . ! or ? followed by a space. */
function checkSentences(ctx: Ctx, where: Where, text: string): void {
  const sentences = renderText(text, ctx.globals).trim().split(/(?<=[.!?])\s+/).length;
  if (sentences > ctx.globals.MAX_TEXT_SENTENCES) {
    fail(ctx.sink, where, `text has ${sentences} sentences`, 'shorten to one sentence');
  }
}

/**
 * Card and objective text (D-172 rules 1–4, 6, 7). `refs` are the globals the entry uses outside its text. Rule 4
 * applies only when there are refs, so a card with no globals may keep its digits. Objectives have no sentence rule.
 */
function checkEntryText(ctx: Ctx, where: Where, text: string, refs: readonly string[], noun: 'card' | 'objective'): void {
  const template = checkNames(ctx, where, text);
  if (template === undefined) return;
  if (refs.length > 0) {
    const used = refs.map((name) => `$${name}`).join(', ');
    for (const number of bareNumbers(template)) {
      const fix = refs.length === 1
        ? `write {${refs[0]}} instead of ${number}`
        : `write one of ${refs.map((name) => `{${name}}`).join(', ')} instead of ${number}`;
      fail(ctx.sink, where, `bare number "${number}" while the ${noun} uses ${used}`, fix, 'text');
    }
  }
  for (const name of template.names) {
    if (!refs.includes(name)) {
      const scope = noun === 'card' ? "this card's effects or conditions" : "this objective's thresholds";
      warn(ctx.sink, where, `{${name}} is not used by ${scope}`, 'check the name', 'text');
    }
  }
  if (noun === 'card') checkSentences(ctx, where, text);
}

// Card text (all six card files; monster and Relic text is optional) and objective text.
function checkTexts(ctx: Ctx): void {
  const { data } = ctx;
  const lists: readonly (readonly [ContentKey, readonly { readonly id: string; readonly text?: string | undefined }[] | undefined])[] = [
    ['playerMonsters', data.playerMonsters],
    ['relics', data.relics],
    ['playerSpells', data.playerSpells],
    ['playerTraps', data.playerTraps],
    ['collectorSpells', data.collectorSpells],
    ['collectorTraps', data.collectorTraps],
  ];
  for (const [key, entries] of lists) {
    for (const entry of entries ?? []) {
      if (entry.text === undefined) continue;
      checkEntryText(ctx, { file: fileOf(key), id: entry.id }, entry.text, refNames(entry), 'card');
    }
  }
  for (const objective of data.objectives ?? []) {
    checkEntryText(ctx, { file: fileOf('objectives'), id: objective.id }, objective.text, refNames(objective), 'objective');
  }
  for (const twist of data.twists ?? []) {
    checkNames(ctx, { file: fileOf('twists'), id: twist.id }, twist.text);
  }
  checkKeywordTexts(ctx);
}

// Keyword and Flaw text (D-172 rules 1–3, 5, 7; D-198): the registry is checked, so the browser dev build sees it too.
// A keyword's numbers always come from globals (§1.3), so any digit left after the placeholders is a bare number.
function checkKeywordTexts(ctx: Ctx): void {
  for (const keyword of ctx.keywordList) {
    const where: Where = { file: `keywords/${keyword.id}.ts`, id: keyword.id };
    const template = checkNames(ctx, where, keyword.text);
    if (template === undefined) continue;
    for (const number of bareNumbers(template)) {
      fail(ctx.sink, where, `bare number "${number}"`, 'write a {NAME} placeholder for the global the keyword uses', 'text');
    }
    checkSentences(ctx, where, keyword.text);
  }
}

// Every "$NAME" / "-$NAME" string in the data must name a numeric entry of the globals (D-074, D-171).
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
  const sign = ref.startsWith('-') ? '-' : '';
  const problem = globalNameProblem(name, ctx.globals, `"${ref}"`, sign);
  if (problem) fail(ctx.sink, where, problem.problem, problem.fix);
}

// art-briefs.json: one brief per card and Chimera family, and no briefs for ids that don't exist (D-110, D-174: warnings).
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
      warn(sink, { file, id }, 'missing art brief', 'add a one-line "mood · pose · palette"');
    }
  }
  for (const id of Object.keys(briefs)) {
    if (!ids.has(id)) warn(sink, { file, id }, 'orphan brief, no card or Chimera family has this id', 'delete the entry');
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

// D-201: a base monster and a Relic take at most MAX_BASE_KEYWORDS keywords. The limit is read here, not in zod, so the
// global is the one place to change it. Chimeras are limited by MAX_INHERITED_KEYWORDS in graft.ts, not here.
function checkKeywordCount(ctx: Ctx): void {
  const { data, globals, sink } = ctx;
  const max = globals.MAX_BASE_KEYWORDS;
  const lists: readonly (readonly [ContentKey, readonly { readonly id: string; readonly keywords: readonly string[] }[] | undefined])[] = [
    ['playerMonsters', data.playerMonsters],
    ['relics', data.relics],
  ];
  for (const [key, entries] of lists) {
    for (const entry of entries ?? []) {
      const count = entry.keywords.length;
      if (count <= max) continue;
      fail(
        sink,
        { file: fileOf(key), id: entry.id },
        `has ${plural(count, 'keyword')}, max MAX_BASE_KEYWORDS=${max}`,
        `remove ${plural(count - max, 'keyword')}`,
        'keywords',
      );
    }
  }
}

// D-205: a CONTENT_NUMBERS entry that nothing names is a silent no-op, usually left behind by a deleted card. A name is
// used by a "$NAME" anywhere in the data, a {NAME} in card, objective, twist or keyword text, or a keyword-source ref.
// Runs only when every data file parsed, so a missing file can't produce false warnings.
function checkUnusedContentNumbers(ctx: Ctx, keywordRefs: readonly string[]): void {
  const { data, globals, sink } = ctx;
  const values = Object.values(data);
  if (values.some((value) => value === undefined)) return;
  const used = new Set<string>(keywordRefs);
  for (const value of values) collectRefNames(value, used);
  const texts: (string | undefined)[] = [
    ...[data.playerMonsters, data.relics, data.playerSpells, data.playerTraps, data.collectorSpells, data.collectorTraps]
      .flatMap((list) => (list ?? []).map((entry) => entry.text)),
    ...(data.objectives ?? []).map((objective) => objective.text),
    ...(data.twists ?? []).map((twist) => twist.text),
    ...ctx.keywordList.map((keyword) => keyword.text),
  ];
  for (const text of texts) {
    if (text === undefined) continue;
    for (const name of parseTemplate(text).names) used.add(name);
  }
  for (const name of Object.keys(globals.CONTENT_NUMBERS)) {
    if (used.has(name)) continue;
    warn(
      sink,
      { file: 'globals.ts', id: 'CONTENT_NUMBERS' },
      'not used by any card, objective, AI param or keyword',
      `delete the line, or use $${name} in an effect`,
      name,
    );
  }
}

/** Adds the name of every "$NAME" / "-$NAME" string inside a value, at any depth. */
function collectRefNames(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    if (GLOBAL_REF.test(value)) into.add(value.replace(/^-?\$/, ''));
  } else if (Array.isArray(value)) {
    for (const item of value) collectRefNames(item, into);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) collectRefNames(item, into);
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

// D-170: a player pool must hold enough distinct cards to fill its deck, when each card may be used MAX_COPIES times.
// Checked for monsters, spells and traps. Adding the missing cards is the fix; the count is ceil(DECK / MAX_COPIES).
function checkPoolCapacity(ctx: Ctx): void {
  const { data, globals, sink } = ctx;
  const pools: readonly [ContentKey, readonly unknown[] | undefined, number, string, string][] = [
    ['playerMonsters', data.playerMonsters, globals.DECK_MONSTERS, 'monster', 'DECK_MONSTERS'],
    ['playerSpells', data.playerSpells, globals.DECK_SPELLS, 'spell', 'DECK_SPELLS'],
    ['playerTraps', data.playerTraps, globals.DECK_TRAPS, 'trap', 'DECK_TRAPS'],
  ];
  for (const [key, entries, deck, label, name] of pools) {
    if (!entries) continue;
    const needed = Math.ceil(deck / globals.MAX_COPIES);
    if (entries.length >= needed) continue;
    fail(
      sink,
      { file: fileOf(key), id: 'pool' },
      `${plural(entries.length, label)} × MAX_COPIES=${globals.MAX_COPIES} can't fill ${name}=${deck}`,
      `add ${plural(needed - entries.length, label)}, or lower ${name} or raise MAX_COPIES in globals.ts`,
    );
  }
}
