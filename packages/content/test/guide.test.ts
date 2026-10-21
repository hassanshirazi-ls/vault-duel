// Tests for docs/CONTENT_GUIDE.md (D-178). Every worked example in sections 1–7 is applied here to a temp copy of the
// content, then checked with the same steps content:check runs. Expected output is written out in full, so the guide
// and the tooling cannot drift apart. The copy is set up on its own terms: globals that an example depends on are
// written into the copy's src/globals.ts, and no test assumes a live value. Keyword and vocabulary ids (ember, swift,
// slow, covetous) are rules, not tuning values, so they are used as they are.
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Globals } from '@vault-duel/engine';
import { compileContent } from '../src/compile';
import { CONTENT_FILES, formatError } from '../src/files';
import { checkDeckgen } from '../src/feasibility';
import {
  checkKeywordBarrel,
  checkKeywordExamples,
  checkKeywordGlobalRefs,
  checkKeywordSources,
  keywordGlobalRefNames,
  loadKeywordFiles,
  sortKeywords,
} from '../src/keyword-files';
import { CONTENT_ROOT, loadContent } from '../src/load';
import { OverridesError, withOverrides } from '../src/globals';
import { PLANNED_GLOBALS } from '../src/planned-globals';
import { renderText } from '../src/text';
import { DEFERRED_RULES, validateContent } from '../src/validate';
import { KEYWORDS } from '../keywords/index.gen';
import { OBJECTIVE_METRICS } from '../src/schemas/objective';

// ---- The guide and the copy harness -------------------------------------------------------------------------------

const GUIDE_PATH = resolve(CONTENT_ROOT, '../../docs/CONTENT_GUIDE.md');
const GUIDE = readFileSync(GUIDE_PATH, 'utf8');
// Table cells escape "|" as "\|" (GitHub markdown); the text the tooling prints has a plain "|".
const GUIDE_TEXT = GUIDE.replaceAll('\\|', '|');
const TSX = join(CONTENT_ROOT, '../../node_modules/.bin/tsx');
/** Spawning the real scripts takes seconds; the default vitest timeout is too short under load. */
const SPAWN_TIMEOUT = 60_000;
const CONTENT_JSON = Object.values(CONTENT_FILES).map((file) => file.path);

type Json = Record<string, unknown>;

const copies: string[] = [];

afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A temp copy of the content: the JSON files, keywords/, src/, scripts/ and package.json (for tsx). */
function makeCopy(): string {
  const root = mkdtempSync(join(tmpdir(), 'vault-guide-'));
  copies.push(root);
  cpSync(join(CONTENT_ROOT, 'package.json'), join(root, 'package.json'));
  for (const dir of ['src', 'keywords', 'scripts']) {
    cpSync(join(CONTENT_ROOT, dir), join(root, dir), { recursive: true, filter: (path) => !path.endsWith('.test.ts') });
  }
  for (const rel of CONTENT_JSON) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    cpSync(join(CONTENT_ROOT, rel), join(root, rel));
  }
  // Keyword files import @vault-duel/engine, which resolves through the package's node_modules.
  symlinkSync(join(CONTENT_ROOT, 'node_modules'), join(root, 'node_modules'));
  return root;
}

/** A copy of `value` without the given keys. Written without `delete`, which lint bans for computed keys. */
function withoutKeys(value: Json, keys: readonly string[]): Json {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function readArray(root: string, rel: string): Json[] {
  return JSON.parse(readFileSync(join(root, rel), 'utf8')) as Json[];
}

function readObject(root: string, rel: string): Json {
  return JSON.parse(readFileSync(join(root, rel), 'utf8')) as Json;
}

function writeJson(root: string, rel: string, value: unknown): void {
  writeFileSync(join(root, rel), `${JSON.stringify(value, null, 2)}\n`);
}

/** Sets a core number in the copy's globals.ts, e.g. setGlobal(root, 'PLAYER_LIFE', '18'). The name must appear once. */
function setGlobal(root: string, name: string, literal: string): void {
  const path = join(root, 'src/globals.ts');
  const text = readFileSync(path, 'utf8');
  const pattern = new RegExp(`(\\b${name}: )(\\[[^\\]]*\\]|[^,\\n]+)`);
  if (!pattern.test(text)) throw new Error(`setGlobal: ${name} is not a core key in globals.ts`);
  writeFileSync(path, text.replace(pattern, `$1${literal}`));
}

/** Adds `line` on its own line before or after `marker` in a copy file. The marker must appear once in the file. */
function addLine(root: string, rel: string, marker: string, line: string, where: 'before' | 'after'): void {
  const path = join(root, rel);
  const text = readFileSync(path, 'utf8');
  if (text.split(marker).length !== 2) throw new Error(`addLine: ${marker} must appear once in ${rel}`);
  writeFileSync(path, text.replace(marker, where === 'before' ? `${line}\n${marker}` : `${marker}\n${line}`));
}

/** Adds one line inside the copy's CONTENT_NUMBERS block, as the owner does by hand (D-171). */
function addContentNumber(root: string, line: string): void {
  const path = join(root, 'src/globals.ts');
  const text = readFileSync(path, 'utf8');
  if (!text.includes('CONTENT_NUMBERS: {')) throw new Error('addContentNumber: no CONTENT_NUMBERS block');
  writeFileSync(path, text.replace('CONTENT_NUMBERS: {', `CONTENT_NUMBERS: {\n${line}`));
}

/** Removes one entry from the copy's CONTENT_NUMBERS block, as the owner does when the card that used it is deleted. */
function removeContentNumber(root: string, name: string): void {
  const path = join(root, 'src/globals.ts');
  const text = readFileSync(path, 'utf8');
  const pattern = new RegExp(`\\b${name}: [^,\\n]+, `);
  if (!pattern.test(text)) throw new Error(`removeContentNumber: ${name} is not in CONTENT_NUMBERS`);
  writeFileSync(path, text.replace(pattern, ''));
}

let globalsLoads = 0;
/** The copy's DEFAULT_GLOBALS, read from its own globals.ts. A new query each time, so an edit is picked up. */
async function globalsOf(root: string): Promise<Globals> {
  globalsLoads += 1;
  const url = `${pathToFileURL(join(root, 'src/globals.ts')).href}?load=${globalsLoads}`;
  const mod = (await import(url)) as { DEFAULT_GLOBALS: Globals };
  return mod.DEFAULT_GLOBALS;
}

interface Report {
  readonly errors: string[];
  readonly warnings: string[];
}

/**
 * The steps of scripts/content-check.ts, run on a copy: load, keyword checks, validate (with the keyword-source refs,
 * as content:check passes them, D-205), and then (only when there are no errors) compile and the deck-generation
 * check. Lines come back in the §10.3 format, warnings with their prefix.
 */
async function check(root: string): Promise<Report> {
  const g = await globalsOf(root);
  const load = loadContent(root);
  const keywords = await loadKeywordFiles(root);
  const keywordErrors = [
    ...keywords.errors,
    ...checkKeywordSources(keywords.sources),
    ...checkKeywordGlobalRefs(keywords.sources, g, root),
    ...checkKeywordBarrel(keywords.sources, root),
  ];
  const defs = sortKeywords(keywords.sources).map((source) => source.def);
  const validation = validateContent(load.data, g, defs, keywordGlobalRefNames(keywords.sources, root));
  const errors = [...load.errors, ...keywordErrors, ...validation.errors];
  const warnings = [...validation.warnings, ...checkKeywordExamples(keywords.sources)];
  if (errors.length === 0) {
    errors.push(...checkDeckgen(compileContent(load.data, defs, g), g));
  }
  return {
    errors: errors.map(formatError),
    warnings: warnings.map((warning) => `warning: ${formatError(warning)}`),
  };
}

/** Runs one of the real scripts with the same tsx the root scripts use, from inside the copy. */
function runScript(root: string, script: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(TSX, [join(root, 'scripts', script)], { cwd: root, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function lines(text: string): string[] {
  return text.split('\n').filter((line) => line !== '');
}

/** The first deck entry the AI does not name in its trap preference or its spell picks, so removing it is safe. */
function unnamedDeckId(c: Json): string {
  const ai = c['ai'] as { trapPreference: string[]; params: { castHighValueSpell: Record<string, unknown> } };
  const named = new Set([...ai.trapPreference, ...Object.keys(ai.params.castHighValueSpell)]);
  const deck = c['deck'] as string[];
  const id = deck.find((entry) => !named.has(entry));
  if (id === undefined) throw new Error('every deck entry is named by the AI; the example needs one that is not');
  return id;
}

// ---- Literal snippets. Each one is quoted verbatim in the guide (checked below). ------------------------------------

const BEAST_JSON = `{
  "id": "example-beast",
  "type": "monster",
  "name": "Example Beast",
  "element": "ember",
  "kind": "beast",
  "power": 6,
  "guard": 3,
  "keywords": []
}`;

const RELIC_JSON = `{
  "id": "example-relic",
  "type": "monster",
  "name": "Example Courtier",
  "element": "lumen",
  "kind": "knight",
  "power": 6,
  "guard": 5,
  "keywords": [],
  "flaw": "slow"
}`;

const SPELL_JSON = `{
  "id": "example-purge",
  "type": "spell",
  "name": "Example Purge",
  "text": "Destroy one enemy monster.",
  "target": { "side": "enemy", "zone": "board" },
  "effects": [{ "op": "destroy", "target": "chosen" }]
}`;

const TRAP_JSON = `{
  "id": "example-snare",
  "type": "trap",
  "name": "Example Snare",
  "text": "When an enemy monster attacks, cancel that attack.",
  "trigger": "enemyAttack",
  "effects": [{ "op": "cancelAttack" }]
}`;

const DRAW_JSON = `{
  "id": "example-draw",
  "type": "spell",
  "name": "Example Draw",
  "text": "Draw {DRAW_CARDS|card|cards}.",
  "effects": [{ "op": "draw", "who": "self", "n": "$DRAW_CARDS" }]
}`;

const COLLECTOR_SPELL_JSON = `{
  "id": "example-collector-purge",
  "type": "spell",
  "name": "Example Monarch Purge",
  "text": "Destroy one enemy monster.",
  "target": { "side": "enemy", "zone": "board" },
  "effects": [{ "op": "destroy", "target": "chosen" }]
}`;

const QUILL_JSON = `{
  "id": "example-quill",
  "type": "spell",
  "name": "Example Quill",
  "text": "The Monarch loses {QUILL_TOLL} life.",
  "effects": [{ "op": "damage", "who": "opponent", "n": "$QUILL_TOLL" }]
}`;

const BRIEF_LINE = '"example-beast": "feral · lunging · solid black shadow",';
const DRAW_NUMBER_LINE = '    DRAW_CARDS: 2,';
const QUILL_LINE = '    QUILL_TOLL: 2,';
const DECK_LINE = '"example-collector-purge",';
const CAST_LINE = '"example-collector-purge": { "pick": "highestPower" },';
/** D-352: the optional levy list in collector.json › dialogue. */
const LEVY_LINE = '"levy": ["Rise, soldier. You serve a greater house."],';
/** D-349: the one-edit switch for the crown, and the crown's Power, as they read in globals.ts. */
const CROWNED_LINE = '  CROWNED: false,';
const CROWN_POWER_LINE = '  CROWN_POWER: 2,';
const CROWN_SIM_COMMAND = 'pnpm sim:quick --games 2 --seed-dates 1 --bots expert --workers 1 --set FLAGS.CROWNED=false --out /tmp/vd-guide-crown';

const ELEMENT_EMBER_JSON = '{ "id": "ember", "name": "Ember", "color": "#C8452C", "icon": "flame", "beats": ["gale"], "identity": "Aggressive, high Power" }';
const ELEMENT_VOID_JSON = '{ "id": "void", "name": "Void", "color": "#2A2A2A", "icon": "moon", "beats": ["ember"], "identity": "Example only" }';
const SUMMON_LANE_LINE = '"summonLane": ["sentinelCenter", "facingBeatable", "facingEmpty", "leftmostFree"]';
const SENTINEL_TEMPLATE = 'Enemy attacks in its lane and in the lanes within {SENTINEL_REACH|lane|lanes} of it must target it.';

const SNIPPETS = [
  BEAST_JSON, RELIC_JSON, SPELL_JSON, TRAP_JSON, DRAW_JSON, COLLECTOR_SPELL_JSON, QUILL_JSON, BRIEF_LINE, DRAW_NUMBER_LINE,
  QUILL_LINE, DECK_LINE, CAST_LINE, ELEMENT_EMBER_JSON, ELEMENT_VOID_JSON, SUMMON_LANE_LINE, SENTINEL_TEMPLATE,
  LEVY_LINE, CROWNED_LINE, CROWN_POWER_LINE,
];

// ---- Messages the guide quotes. Lists of ids are written as "…" in the guide, so those are quoted by prefix. --------

const BUDGET_11 = 'warning: cards/player-monsters.json › example-beast › budget 11 (P7+G3+1kw) outside 8–10 › lower Power or Guard by 1 if this is not intended';
const MISSING_BRIEF = 'warning: art-briefs.json › example-beast › missing art brief › add a one-line "mood · pose · ink"';
const ORPHAN_BRIEF = 'warning: art-briefs.json › example-purge › orphan brief, no card or Chimera family has this id › delete the entry';
const NO_EXAMPLES = 'warning: keywords/example-ward.ts › example-ward › no examples › add one board-DSL example with declared cards (D-169)';
const BARE_NUMBER = 'cards/player-spells.json › example-draw › text: bare number "2" while the card uses $DRAW_CARDS › write {DRAW_CARDS} instead of 2';
const TWO_SENTENCES = 'cards/player-spells.json › example-draw › text has 2 sentences › shorten to one sentence';
const MALFORMED = 'cards/player-spells.json › example-draw › text: malformed placeholder "{draw}" › write {NAME} or {NAME|word|words} with a global name in capitals';
const UNKNOWN_PLACEHOLDER = 'cards/player-spells.json › example-draw › text: unknown placeholder {DRAW_CARDZ} › did you mean {DRAW_CARDS}?';
const UNUSED_PLACEHOLDER = "warning: cards/player-spells.json › example-draw › text: {DRAW_CARDS} is not used by this card's effects or conditions › check the name";
const NOT_A_NUMBER = 'cards/player-spells.json › example-draw › text: {CONTENT_VERSION} is not a number in globals.ts › use a numeric global';
const UNKNOWN_REF = 'cards/player-spells.json › example-draw › "$DRAW_CARDZ" not in globals.ts › did you mean $DRAW_CARDS?';
const POOL_SPELLS = "cards/player-spells.json › pool › 2 spells × MAX_COPIES=2 can't fill DECK_SPELLS=5 › add 1 spell, or lower DECK_SPELLS or raise MAX_COPIES in globals.ts";
const MISSING_POWER = 'cards/player-monsters.json › example-beast › power: missing › add "power"';
const RELIC_FLAW_MISSING = 'cards/relics.json › example-relic › flaw: missing, a Relic needs exactly 1 Flaw › add "flaw": "<flaw id>"';
const BASE_FLAW = 'cards/player-monsters.json › example-beast › Flaws appear only on Relics › remove "flaw"';
const TWO_KEYWORDS = 'cards/player-monsters.json › example-beast › keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword';
const RELIC_TWO_KEYWORDS = 'cards/relics.json › example-relic › keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword';
const ACE_NOT_RELIC = 'collector.json › ace › "no-such-relic" is not a Relic › use a Relic id from cards/relics.json';
const ACE_NOT_IN_DECK = 'collector.json › ace › "the-unpriced" is not in the deck › add it to the deck list in collector.json';
/** Moving the ace off the Covetous Relic leaves the Covetous rule (§3, D-054) unmet on that Relic too. */
const COVETOUS_MOVED = 'cards/relics.json › the-unpriced › Covetous is ace-only › change flaw or set collector.json ace';
const FORFEIT_NEEDS_ONE = 'collector.json › ai › params.castHighValueSpell.forfeit: needs exactly one of "pick" or "when" › keep exactly one of "pick" or "when"';
const PURGE_NEEDS_ONE = 'collector.json › ai › params.castHighValueSpell.example-collector-purge: needs exactly one of "pick" or "when" › keep exactly one of "pick" or "when"';
const CONTESTED_NO_POWER = 'collector.json › ai › params.castHighValueSpell.example-collector-purge: "contestedAttack" needs a spell that gives Power to "chosen" › use "pick": "highestPower" instead';
const FORFEIT_NOT_IN_DECK = 'collector.json › ai › params.castHighValueSpell.forfeit: "forfeit" is not a Collector spell in the deck › use a spell id from collector.json › deck';
const UNUSED_SIPHON_DRAIN = 'warning: globals.ts › CONTENT_NUMBERS › SIPHON_DRAIN: not used by any card, objective, AI param or keyword › delete the line, or use $SIPHON_DRAIN in an effect';
const UNUSED_SIPHON_GAIN = 'warning: globals.ts › CONTENT_NUMBERS › SIPHON_GAIN: not used by any card, objective, AI param or keyword › delete the line, or use $SIPHON_GAIN in an effect';
const PINNED_RELIC_FLAWS = 'globals.ts › RELIC_FLAWS › must be 1 until the engine supports other values › keep 1';
/** D-177: the example spell is in the deck with no AI entry. `at` is its deck index. */
const NO_AI_RULE = (at: number): string =>
  `warning: collector.json › deck[${at}] › Collector spell "example-collector-purge" has no AI rule that casts it › add "example-collector-purge" to ai.params.castHighValueSpell with a pick, or make it draw-only`;
/** D-177: a Collector trap in the deck that trapPreference does not name. */
const TRAP_NOT_PREFERRED = (at: number): string =>
  `warning: collector.json › deck[${at}] › Collector trap "display-case" is not in ai.trapPreference › add it, or AI rule 4 never sets it`;
/** The card numbers that only the player spells after the first two use (scrying-bones and siphon). */
const NUMBERS_OF_DROPPED_SPELLS = ['SCRYING_DRAW', 'SIPHON_DRAIN', 'SIPHON_GAIN'];

/** Sections 3, 7, 10 and 13: the messages added for the 2026-10-17 rules (v0.2.0). */
const BEATS_UNKNOWN = 'elements.json › ember › beats unknown element "wind" › use an id from elements.json';
const UMBRA_BEATS = 'elements.json › lumen › beats unknown element "umbra" › use an id from elements.json';
const UMBRA_CARD = 'cards/player-monsters.json › <card id> › unknown element "umbra" › use one of: …, or add it to elements.json';
const REPOSITION_BAD = 'collector.json › ai › reposition: got "sometimes" › use one of: toAttackIfUsable, allAttack, laneAware';
const LANE_BAD = 'collector.json › ai › params.summonLane.[0]: got "nowhere" › use one of: sentinelCenter, facingBeatable, facingEmpty, leftmostFree';
const SICKNESS_BAD = 'globals.ts › SICKNESS_MODE › Invalid option: expected one of "classic"|"monstersOnly" › fix the value in globals.ts';
const LANES_WORDS = 'globals.ts › FLAGS › LANES: Invalid input: expected boolean, received string › fix the value in globals.ts';
const REACH_NEGATIVE = 'globals.ts › SENTINEL_REACH › must be 0 or more › use 0 or more';
const BONDS_BAD = 'globals.ts › BONDS_PER_TURN › must be 1 until the engine supports other values › keep 1';
const SYMBIOTES_BAD = 'globals.ts › SYMBIOTES_PER_HOST › must be 1 until the engine supports other values › keep 1';
const SENTINEL_TYPO = 'keywords/sentinel.ts › sentinel › text: unknown placeholder {SENTINEL_REACHX} › did you mean {SENTINEL_REACH}?';
/** D-352: a line list in collector.json › dialogue under a name nothing reads. */
const DIALOGUE_LEVYS = 'collector.json › dialogue › unknown key(s) levys › remove levys';

const MESSAGES = [
  BUDGET_11, MISSING_BRIEF, ORPHAN_BRIEF, NO_EXAMPLES, BARE_NUMBER, TWO_SENTENCES, MALFORMED, UNKNOWN_PLACEHOLDER,
  UNUSED_PLACEHOLDER, NOT_A_NUMBER, UNKNOWN_REF, POOL_SPELLS, MISSING_POWER, RELIC_FLAW_MISSING, BASE_FLAW, TWO_KEYWORDS,
  RELIC_TWO_KEYWORDS, ACE_NOT_RELIC, COVETOUS_MOVED, ACE_NOT_IN_DECK, FORFEIT_NEEDS_ONE, PURGE_NEEDS_ONE, CONTESTED_NO_POWER,
  FORFEIT_NOT_IN_DECK, UNUSED_SIPHON_DRAIN, UNUSED_SIPHON_GAIN, PINNED_RELIC_FLAWS,
  BEATS_UNKNOWN, UMBRA_BEATS, REPOSITION_BAD, LANE_BAD, SICKNESS_BAD, LANES_WORDS, REACH_NEGATIVE, BONDS_BAD, SYMBIOTES_BAD,
  SENTINEL_TYPO, DIALOGUE_LEVYS,
];

/** Asserts that the guide quotes `line` verbatim. Table cells escape the pipe character, so the guide text is normalised first. */
function quoted(line: string): void {
  expect(GUIDE_TEXT.includes(line), `guide quotes: ${line}`).toBe(true);
}

// ---- Small builders used above --------------------------------------------------------------------------------------

const KEYWORD_STUB = `import { defineKeyword } from '@vault-duel/engine';

export default defineKeyword({
  id: 'example-ward',
  name: 'Example Ward',
  kind: 'keyword',
  icon: 'example',
  visual: 'example',
  text: 'Does nothing.',
  hooks: {},
});
`;

const QUILL_SPELL = JSON.parse(QUILL_JSON) as Json;

/** Adds the Collector spell of COLLECTOR_SPELL_JSON to collector-spells.json, with its art brief. */
function addCollectorSpell(root: string): void {
  writeJson(root, 'cards/collector-spells.json', [...readArray(root, 'cards/collector-spells.json'), JSON.parse(COLLECTOR_SPELL_JSON) as Json]);
  writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-collector-purge': 'feral · lunging · solid black shadow' });
}

/** The collector.json `ai` block with one castHighValueSpell entry set (or replaced), as the owner edits it (D-204). */
function aiWithCast(collector: Json, id: string, entry: unknown): Json {
  const ai = collector['ai'] as Json;
  const params = ai['params'] as Json;
  const cast = params['castHighValueSpell'] as Json;
  return { ...ai, params: { ...params, castHighValueSpell: { ...cast, [id]: entry } } };
}

/**
 * Adds the example Collector spell to collector-spells.json and puts it in his deck in place of the first card the AI
 * never names. With an `entry`, it also sets that castHighValueSpell entry. Returns the deck index it took.
 */
function swapPurgeIntoDeck(root: string, entry?: unknown): { at: number; removed: string } {
  addCollectorSpell(root);
  const collector = readObject(root, 'collector.json');
  const removed = unnamedDeckId(collector);
  const deck = collector['deck'] as string[];
  const next: Json = { ...collector, deck: deck.map((id) => (id === removed ? 'example-collector-purge' : id)) };
  if (entry !== undefined) next['ai'] = aiWithCast(collector, 'example-collector-purge', entry);
  writeJson(root, 'collector.json', next);
  return { at: deck.indexOf(removed), removed };
}

/**
 * The pool setup of the spell examples: keeps the first two player spells, deletes the rest with their art briefs, and
 * removes the card numbers only the deleted spells used. That leaves the pool error alone in the output.
 */
function keepTwoPlayerSpells(root: string): void {
  const spells = readArray(root, 'cards/player-spells.json');
  const briefs = withoutKeys(readObject(root, 'art-briefs.json'), spells.slice(2).map((gone) => gone['id'] as string));
  writeJson(root, 'cards/player-spells.json', spells.slice(0, 2));
  writeJson(root, 'art-briefs.json', briefs);
  for (const name of NUMBERS_OF_DROPPED_SPELLS) removeContentNumber(root, name);
}

/**
 * Adds the example spell (example-draw) with the given text and optional effects, its art brief, and the DRAW_CARDS
 * line in globals.ts. Call it once per copy.
 */
function withText(root: string, text: string, effects?: unknown[]): string {
  const draw: Json = { ...(JSON.parse(DRAW_JSON) as Json), text };
  if (effects !== undefined) draw['effects'] = effects;
  writeJson(root, 'cards/player-spells.json', [...readArray(root, 'cards/player-spells.json'), draw]);
  writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-draw': 'feral · lunging · solid black shadow' });
  addContentNumber(root, DRAW_NUMBER_LINE);
  return root;
}

function messageOf(fn: () => unknown): string {
  try {
    fn();
    return 'no error';
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
}

// ---- Tests ----------------------------------------------------------------------------------------------------------

describe('guide: the tooling the guide relies on', () => {
  it('the real content:check script passes on a fresh copy of the content', () => {
    expect(existsSync(TSX), 'tsx is installed at the repo root').toBe(true);
    const root = makeCopy();
    const result = runScript(root, 'content-check.ts');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^content:check OK: \d+ files parsed$/m);
  }, SPAWN_TIMEOUT);

  it('the copy harness and the in-process check agree on a fresh copy', async () => {
    const report = await check(makeCopy());
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('the registry facts the examples use are present (keyword and Flaw ids are rules)', () => {
    const kind = (id: string): string | undefined => KEYWORDS.find((keyword) => keyword.id === id)?.kind;
    expect(kind('swift')).toBe('keyword');
    expect(kind('sentinel')).toBe('keyword');
    expect(kind('slow')).toBe('flaw');
    expect(kind('covetous')).toBe('flaw');
    expect(kind('frail'), 'the unregistered example id must stay unregistered').toBeUndefined();
    expect(kind('hant'), 'the unregistered example id must stay unregistered').toBeUndefined();
  });
});

describe('guide §1 · where things live', () => {
  it('§1 every file the guide names exists', () => {
    const named = [
      'src/globals.ts',
      'cards/player-monsters.json',
      'cards/player-spells.json',
      'cards/player-traps.json',
      'cards/relics.json',
      'cards/collector-spells.json',
      'cards/collector-traps.json',
      'collector.json',
      'elements.json',
      'kinds.json',
      'recipes.json',
      'objectives.json',
      'twists.json',
      'art-briefs.json',
      'keywords',
      'src/planned-globals.ts',
    ];
    for (const rel of named) expect(existsSync(join(CONTENT_ROOT, rel)), rel).toBe(true);
    expect(existsSync(resolve(CONTENT_ROOT, '../../docs/DESIGN.md'))).toBe(true);
    for (const rel of named) quoted(rel);
  });

  it('§1 example: the Collector deck size is set in two places, and the check reports the mismatch', async () => {
    const root = makeCopy();
    const collector = readObject(root, 'collector.json');
    const deck = collector['deck'] as string[];
    const removed = unnamedDeckId(collector);
    setGlobal(root, 'COLLECTOR_DECK_SIZE', String(deck.length));
    writeJson(root, 'collector.json', { ...collector, deck: deck.filter((id) => id !== removed) });
    const n = deck.length;
    const report = await check(root);
    expect(report.errors).toEqual([`collector.json › deck › has ${n - 1} cards, needs COLLECTOR_DECK_SIZE=${n} › add 1 card id`]);
  });
});

describe('guide §2 · the edit loop', () => {
  it('§2 the commands the guide names are scripts in package.json', () => {
    const scripts = (JSON.parse(readFileSync(resolve(CONTENT_ROOT, '../../package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    for (const name of ['content:check', 'content:gen', 'sim:quick', 'sim:full', 'seeds:check', 'dev']) {
      expect(scripts[name], name).toBeDefined();
      expect(GUIDE_TEXT.includes(`pnpm ${name}`), `guide names pnpm ${name}`).toBe(true);
    }
  });

  it('§2 example: a warning is printed but does not fail the check (exit 0), and a fix clears it', () => {
    const root = makeCopy();
    setGlobal(root, 'STAT_BUDGET_MIN', '8');
    setGlobal(root, 'STAT_BUDGET_MAX', '10');
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), power: 7, keywords: ['swift'] };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-beast': 'feral · lunging · solid black shadow' });

    const first = runScript(root, 'content-check.ts');
    expect(first.status).toBe(0);
    expect(lines(first.stderr)).toEqual([BUDGET_11]);
    expect(first.stdout).toMatch(/^content:check OK: \d+ files parsed$/m);

    writeJson(root, 'cards/player-monsters.json', readArray(root, 'cards/player-monsters.json').map((card) =>
      card['id'] === 'example-beast' ? { ...card, power: 6 } : card,
    ));
    const second = runScript(root, 'content-check.ts');
    expect(second.status).toBe(0);
    expect(lines(second.stderr)).toEqual([]);
    quoted(BUDGET_11);
  }, SPAWN_TIMEOUT);
});

describe('guide §3 · reading content:check output', () => {
  it('§3 a run prints warnings first, then errors, and exits 1 with a summary line', () => {
    const root = makeCopy();
    setGlobal(root, 'STAT_BUDGET_MIN', '8');
    setGlobal(root, 'STAT_BUDGET_MAX', '10');
    setGlobal(root, 'DECK_SPELLS', '5');
    setGlobal(root, 'MAX_COPIES', '2');
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), power: 7, keywords: ['swift'] };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-beast': 'feral · lunging · solid black shadow' });
    // Keep two player spells, so the pool cannot fill a five-spell deck. The briefs and the card numbers of the deleted
    // spells go with them (section 5 shows what a number left behind looks like).
    keepTwoPlayerSpells(root);
    const result = runScript(root, 'content-check.ts');
    expect(result.status).toBe(1);
    expect(lines(result.stderr)).toEqual([
      BUDGET_11,
      POOL_SPELLS,
      'content:check FAILED: 1 error(s) in 1 file(s)',
    ]);
    quoted('content:check FAILED: 1 error(s) in 1 file(s)');
  }, SPAWN_TIMEOUT);

  it('§3 table · a missing field says what to add', async () => {
    const root = makeCopy();
    const beast = withoutKeys(JSON.parse(BEAST_JSON) as Json, ['power']);
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    const report = await check(root);
    expect(report.errors).toEqual([MISSING_POWER]);
    quoted(MISSING_POWER);
  });

  it('§3 table · zod type error: a number written in quotes', async () => {
    const root = makeCopy();
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), power: '7' };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    const report = await check(root);
    expect(report.errors).toEqual(['cards/player-monsters.json › example-beast › power: expected number, got "7" › write numbers without quotes']);
    quoted('power: expected number, got "7" › write numbers without quotes');
  });

  it('§3 table · unknown element lists the element ids', async () => {
    const root = makeCopy();
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), element: 'wind' };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    const ids = readArray(root, 'elements.json').map((element) => element['id']).join(', ');
    const report = await check(root);
    expect(report.errors).toEqual([`cards/player-monsters.json › example-beast › unknown element "wind" › use one of: ${ids}, or add it to elements.json`]);
    quoted('unknown element "wind" › use one of:');
  });

  it('§3 table · unknown kind lists the kind ids', async () => {
    const root = makeCopy();
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), kind: 'dragon' };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    const ids = readArray(root, 'kinds.json').map((kind) => kind['id']).join(', ');
    const report = await check(root);
    expect(report.errors).toEqual([`cards/player-monsters.json › example-beast › unknown kind "dragon" › use one of: ${ids}, or add it to kinds.json`]);
    quoted('unknown kind "dragon" › use one of:');
  });

  it('§3 table · a keyword that is not registered', async () => {
    const root = makeCopy();
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), keywords: ['hant'] };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    const ids = KEYWORDS.filter((keyword) => keyword.kind === 'keyword').map((keyword) => keyword.id).sort().join(', ');
    const report = await check(root);
    expect(report.errors).toEqual([
      `cards/player-monsters.json › example-beast › keyword "hant" is not registered › use one of: ${ids}, or add packages/content/keywords/hant.ts`,
    ]);
    quoted('keyword "hant" is not registered › use one of:');
  });

  it('§3 table · an objective with an unknown metric', async () => {
    const root = makeCopy();
    const objectives = readArray(root, 'objectives.json');
    const first = objectives[0] ?? {};
    writeJson(root, 'objectives.json', [{ ...first, metric: 'rounds' }, ...objectives.slice(1)]);
    const report = await check(root);
    expect(report.errors).toEqual([
      `objectives.json › ${first['id']} › metric: got "rounds" › use one of: ${OBJECTIVE_METRICS.join(', ')}`,
    ]);
    quoted('metric: got "rounds" › use one of:');
  });

  it('§3 table · a deck entry that is a player card', async () => {
    const root = makeCopy();
    const collector = readObject(root, 'collector.json');
    const deck = collector['deck'] as string[];
    const player = readArray(root, 'cards/player-monsters.json')[0]?.['id'] as string;
    const removed = unnamedDeckId(collector);
    writeJson(root, 'collector.json', { ...collector, deck: deck.map((id) => (id === removed ? player : id)) });
    const report = await check(root);
    expect(report.errors).toEqual([
      `collector.json › deck[${deck.indexOf(removed)}] › "${player}" is a player card › use a card from relics.json or collector-*.json`,
    ]);
    quoted('is a player card › use a card from relics.json or collector-*.json');
  });

  it('§3 table · a Flaw in a keyword list', async () => {
    const root = makeCopy();
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), keywords: ['slow'] };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    const report = await check(root);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.startsWith('cards/player-monsters.json › example-beast › "slow" is a Flaw, not a keyword › use one of: ')).toBe(true);
    quoted('"slow" is a Flaw, not a keyword › use one of:');
  });

  it('§3 table · a Flaw that is not registered on a Relic', async () => {
    const root = makeCopy();
    const relic = { ...(JSON.parse(RELIC_JSON) as Json), flaw: 'frail' };
    writeJson(root, 'cards/relics.json', [...readArray(root, 'cards/relics.json'), relic]);
    const ids = KEYWORDS.filter((keyword) => keyword.kind === 'flaw').map((keyword) => keyword.id).sort().join(', ');
    const report = await check(root);
    expect(report.errors).toEqual([`cards/relics.json › example-relic › Flaw "frail" is not registered › use one of: ${ids}, or add packages/content/keywords/frail.ts`]);
    quoted('Flaw "frail" is not registered › use one of:');
  });

  it('§3 table · stat budget is a warning, not an error', async () => {
    const root = makeCopy();
    setGlobal(root, 'STAT_BUDGET_MIN', '8');
    setGlobal(root, 'STAT_BUDGET_MAX', '10');
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), power: 7, keywords: ['swift'] };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-beast': 'feral · lunging · solid black shadow' });
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([BUDGET_11]);
    quoted(BUDGET_11);
  });

  it('§3 table · missing art brief is a warning', async () => {
    const root = makeCopy();
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), JSON.parse(BEAST_JSON) as Json]);
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([MISSING_BRIEF]);
    quoted(MISSING_BRIEF);
  });

  it('§3 table · orphan art brief is a warning', async () => {
    const root = makeCopy();
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-purge': 'feral · lunging · solid black shadow' });
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([ORPHAN_BRIEF]);
    quoted(ORPHAN_BRIEF);
  });

  it('§3 table · a keyword file without an example is a warning, after the barrel is regenerated', async () => {
    const root = makeCopy();
    writeFileSync(join(root, 'keywords/example-ward.ts'), KEYWORD_STUB);
    const stale = await check(root);
    expect(stale.errors).toEqual(['keywords/index.gen.ts › (file) › stale, does not match keywords/*.ts › run pnpm content:gen']);
    const gen = runScript(root, 'gen-keyword-index.ts');
    expect(gen.status).toBe(0);
    expect(gen.stdout).toMatch(/^content:gen wrote keywords\/index\.gen\.ts: /m);
    const fresh = await check(root);
    expect(fresh.errors).toEqual([]);
    expect(fresh.warnings).toEqual([NO_EXAMPLES]);
    quoted(NO_EXAMPLES);
    quoted('keywords/index.gen.ts › (file) › stale, does not match keywords/*.ts › run pnpm content:gen');
  }, SPAWN_TIMEOUT);

  it('§3 table · a keyword file whose id differs from its file name', async () => {
    const root = makeCopy();
    writeFileSync(join(root, 'keywords/example-ward.ts'), KEYWORD_STUB.replace("id: 'example-ward'", "id: 'example-other'"));
    const report = await check(root);
    expect(report.errors).toEqual([
      'keywords/example-ward.ts › example-ward › id "example-other" ≠ file name › rename the file or the id',
      'keywords/index.gen.ts › (file) › stale, does not match keywords/*.ts › run pnpm content:gen',
    ]);
    quoted('keywords/example-ward.ts › example-ward › id "example-other" ≠ file name › rename the file or the id');
  });

  it('§3 table · a bare number in card text next to a global', async () => {
    const root = makeCopy();
    addContentNumber(root, DRAW_NUMBER_LINE);
    writeJson(root, 'cards/player-spells.json', [...readArray(root, 'cards/player-spells.json'), { ...(JSON.parse(DRAW_JSON) as Json), text: 'Draw 2 cards.' }]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-draw': 'feral · lunging · solid black shadow' });
    const report = await check(root);
    expect(report.errors).toEqual([BARE_NUMBER]);
    quoted(BARE_NUMBER);
  });

  it('§3 table · a card text with two sentences', async () => {
    const two = await check(withText(makeCopy(), 'Draw a card. Then wait.'));
    expect(two.errors).toEqual(['cards/player-spells.json › example-draw › text has 2 sentences › shorten to one sentence']);
    quoted(TWO_SENTENCES);
  });

  it('§3 table · a malformed placeholder', async () => {
    const root = withText(makeCopy(), 'Draw {draw}.');
    const report = await check(root);
    expect(report.errors).toEqual(['cards/player-spells.json › example-draw › text: malformed placeholder "{draw}" › write {NAME} or {NAME|word|words} with a global name in capitals']);
    quoted(MALFORMED);
  });

  it('§3 table · an unknown placeholder, with a did-you-mean', async () => {
    const root = withText(makeCopy(), 'Draw {DRAW_CARDZ|card|cards}.');
    const report = await check(root);
    expect(report.errors).toEqual(['cards/player-spells.json › example-draw › text: unknown placeholder {DRAW_CARDZ} › did you mean {DRAW_CARDS}?']);
    quoted(UNKNOWN_PLACEHOLDER);
  });

  it('§3 table · a placeholder that is not a number', async () => {
    const root = withText(makeCopy(), 'Version {CONTENT_VERSION}.');
    const report = await check(root);
    expect(report.errors).toEqual(['cards/player-spells.json › example-draw › text: {CONTENT_VERSION} is not a number in globals.ts › use a numeric global']);
    quoted(NOT_A_NUMBER);
  });

  it('§3 table · a placeholder the card does not use is a warning', async () => {
    const root = withText(makeCopy(), 'Draw {DRAW_CARDS|card|cards}.', [{ op: 'draw', who: 'self', n: 1 }]);
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toContain(UNUSED_PLACEHOLDER);
    quoted(UNUSED_PLACEHOLDER);
  });

  it('§3 table · an unknown $NAME in an effect, with a did-you-mean', async () => {
    const root = withText(makeCopy(), 'Draw {DRAW_CARDS|card|cards}.', [{ op: 'draw', who: 'self', n: '$DRAW_CARDZ' }]);
    const report = await check(root);
    expect(report.errors).toEqual(['cards/player-spells.json › example-draw › "$DRAW_CARDZ" not in globals.ts › did you mean $DRAW_CARDS?']);
    quoted(UNKNOWN_REF);
  });

  it('§3 table · a pool that cannot fill its deck', async () => {
    const root = makeCopy();
    setGlobal(root, 'DECK_SPELLS', '5');
    setGlobal(root, 'MAX_COPIES', '2');
    keepTwoPlayerSpells(root);
    const report = await check(root);
    expect(report.errors).toEqual([POOL_SPELLS]);
    expect(report.warnings).toEqual([]);
    quoted("2 spells × MAX_COPIES=2 can't fill DECK_SPELLS=5 › add 1 spell");
  });

  it('§3 table · a deck id that no longer exists', async () => {
    const root = makeCopy();
    const collector = readObject(root, 'collector.json');
    const deck = collector['deck'] as string[];
    const target = unnamedDeckId(collector);
    const at = deck.indexOf(target);
    // Remove the card from whichever pool file holds it, and its brief, but leave the deck list alone.
    for (const rel of ['cards/relics.json', 'cards/collector-spells.json', 'cards/collector-traps.json']) {
      const entries = readArray(root, rel);
      if (entries.some((entry) => entry['id'] === target)) writeJson(root, rel, entries.filter((entry) => entry['id'] !== target));
    }
    const briefs = withoutKeys(readObject(root, 'art-briefs.json'), [target]);
    writeJson(root, 'art-briefs.json', briefs);
    const report = await check(root);
    expect(report.errors).toEqual([`collector.json › deck[${at}] › "${target}" no longer exists › remove the reference`]);
    expect(report.warnings).toEqual([]);
    quoted('no longer exists › remove the reference');
  });

  it('§3 table · a missing Chimera recipe for a kind pair', async () => {
    const root = makeCopy();
    const kinds = readArray(root, 'kinds.json').map((kind) => kind['id'] as string);
    const recipes = readArray(root, 'recipes.json');
    const first = recipes[0];
    if (first === undefined) throw new Error('no recipes');
    const [x, y] = first['kinds'] as string[];
    const [a, b] = [x, y].sort((p, q) => kinds.indexOf(p ?? '') - kinds.indexOf(q ?? '')) as [string, string];
    writeJson(root, 'recipes.json', recipes.slice(1));
    const report = await check(root);
    expect(report.errors).toEqual([`recipes.json › (${a}, ${b}) › no Chimera recipe for this kind pair › add {"kinds":["${a}","${b}"], …}`]);
    quoted('no Chimera recipe for this kind pair › add {"kinds":["');
  });

  it('§3 table · a second recipe for a kind pair', async () => {
    const root = makeCopy();
    const recipes = readArray(root, 'recipes.json');
    const first = recipes[0];
    if (first === undefined) throw new Error('no recipes');
    const copy = { id: 'example-chimera', name: 'Example Chimera', kinds: first['kinds'], power: 1, guard: 1 };
    writeJson(root, 'recipes.json', [...recipes, copy]);
    const [x, y] = first['kinds'] as string[];
    const report = await check(root);
    expect(report.errors).toEqual([`recipes.json › example-chimera › pair (${x}, ${y}) already defined by ${first['id']} › delete one`]);
    quoted('already defined by');
  });

  it('§3 table · Covetous is ace-only', async () => {
    const root = makeCopy();
    const relic = { ...(JSON.parse(RELIC_JSON) as Json), flaw: 'covetous' };
    writeJson(root, 'cards/relics.json', [...readArray(root, 'cards/relics.json'), relic]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-relic': 'feral · lunging · solid black shadow' });
    const report = await check(root);
    expect(report.errors).toEqual(['cards/relics.json › example-relic › Covetous is ace-only › change flaw or set collector.json ace']);
    quoted('Covetous is ace-only › change flaw or set collector.json ace');
  });

  it('§3 table · the ace must be a Relic id', async () => {
    const root = makeCopy();
    writeJson(root, 'collector.json', { ...readObject(root, 'collector.json'), ace: 'no-such-relic' });
    const report = await check(root);
    expect(report.errors).toEqual([ACE_NOT_RELIC, COVETOUS_MOVED]);
    quoted(ACE_NOT_RELIC);
    quoted(COVETOUS_MOVED);
  });

  it('§3 table · the ace must be in the deck list', async () => {
    const root = makeCopy();
    writeJson(root, 'cards/relics.json', [...readArray(root, 'cards/relics.json'), JSON.parse(RELIC_JSON) as Json]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-relic': 'feral · lunging · solid black shadow' });
    const collector = readObject(root, 'collector.json');
    // The ace leaves the deck list, and a Relic that is not the ace takes its place, so the deck size does not change.
    const deck = (collector['deck'] as string[]).map((id) => (id === 'the-unpriced' ? 'example-relic' : id));
    writeJson(root, 'collector.json', { ...collector, deck });
    const report = await check(root);
    expect(report.errors).toEqual([ACE_NOT_IN_DECK]);
    expect(report.warnings).toEqual([]);
    quoted(ACE_NOT_IN_DECK);
  });

  it('§3 table · a trap ref that the trigger does not provide', async () => {
    const root = makeCopy();
    const trap = { ...(JSON.parse(TRAP_JSON) as Json), effects: [{ op: 'modifyStats', target: 'grafted', power: 1, duration: 'permanent' }] };
    writeJson(root, 'cards/player-traps.json', [...readArray(root, 'cards/player-traps.json'), trap]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-snare': 'feral · lunging · solid black shadow' });
    const report = await check(root);
    expect(report.errors).toEqual(['cards/player-traps.json › example-snare › ref "grafted" is not available for trigger "enemyAttack" › use attacker or defender']);
    quoted('is not available for trigger "enemyAttack" › use attacker or defender');
  });

  it('§3 table · cancelAttack outside an attack trap', async () => {
    const root = makeCopy();
    writeJson(root, 'cards/player-spells.json', [...readArray(root, 'cards/player-spells.json'), { ...(JSON.parse(SPELL_JSON) as Json), effects: [{ op: 'cancelAttack' }], text: 'Cancel it.', target: undefined }]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-purge': 'feral · lunging · solid black shadow' });
    const report = await check(root);
    expect(report.errors).toEqual(['cards/player-spells.json › example-purge › "cancelAttack" only works in a trap with trigger enemyAttack or enemyDirectAttack › remove it or change the trigger']);
    quoted('"cancelAttack" only works in a trap with trigger enemyAttack or enemyDirectAttack');
  });

  it('§3 table · a condition that cannot be checked on a destroyed monster', async () => {
    const root = makeCopy();
    const trap = { id: 'example-last', type: 'trap', name: 'Example Last', text: 'Draw {DRAW_CARDS|card|cards}.', trigger: 'allyDestroyed', when: { powerGte: 3 }, effects: [{ op: 'draw', who: 'self', n: '$DRAW_CARDS' }] };
    addContentNumber(root, DRAW_NUMBER_LINE);
    writeJson(root, 'cards/player-traps.json', [...readArray(root, 'cards/player-traps.json'), trap]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-last': 'feral · lunging · solid black shadow' });
    const report = await check(root);
    expect(report.errors).toEqual(['cards/player-traps.json › example-last › condition "powerGte" can\'t be checked on a destroyed monster › use type, relic, chimera, element, kind or graftedThisTurn']);
    quoted("condition \"powerGte\" can't be checked on a destroyed monster");
  });

  it('§3 table · a Relic without its Flaw', async () => {
    const root = makeCopy();
    const relic = withoutKeys(JSON.parse(RELIC_JSON) as Json, ['flaw']);
    writeJson(root, 'cards/relics.json', [...readArray(root, 'cards/relics.json'), relic]);
    const report = await check(root);
    expect(report.errors).toEqual([RELIC_FLAW_MISSING]);
    quoted(RELIC_FLAW_MISSING);
  });

  it('§3 table · a Flaw written on a base monster', async () => {
    const root = makeCopy();
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), flaw: 'slow' };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    const report = await check(root);
    expect(report.errors).toEqual([BASE_FLAW]);
    quoted(BASE_FLAW);
  });

  it('§3 table · a Collector AI reference to a spell that is not in the deck', async () => {
    const root = makeCopy();
    const collector = readObject(root, 'collector.json');
    const deck = collector['deck'] as string[];
    const ai = collector['ai'] as { params: { castHighValueSpell: Record<string, unknown> } };
    const key = Object.keys(ai.params.castHighValueSpell)[0] ?? '';
    // Take the named spell out of the deck and put a different card in its place, so the deck size still matches.
    addCollectorSpell(root);
    writeJson(root, 'collector.json', { ...collector, deck: deck.map((id) => (id === key ? 'example-collector-purge' : id)) });
    const report = await check(root);
    expect(report.errors).toEqual([
      `collector.json › ai › params.castHighValueSpell.${key}: "${key}" is not a Collector spell in the deck › use a spell id from collector.json › deck`,
    ]);
    quoted('is not a Collector spell in the deck › use a spell id from collector.json › deck');
    quoted('collector.json › ai › params.castHighValueSpell.forfeit: "forfeit" is not a Collector spell in the deck');
  });

  it('§3 table · a castHighValueSpell entry needs exactly one of "pick" or "when"', async () => {
    const root = makeCopy();
    const collector = readObject(root, 'collector.json');
    writeJson(root, 'collector.json', { ...collector, ai: aiWithCast(collector, 'forfeit', {}) });
    const report = await check(root);
    expect(report.errors).toEqual([FORFEIT_NEEDS_ONE]);
    quoted(FORFEIT_NEEDS_ONE);
  });

  it('§3 table · a contestedAttack entry needs a spell that gives Power to "chosen"', async () => {
    const root = makeCopy();
    swapPurgeIntoDeck(root, { when: 'contestedAttack' });
    const report = await check(root);
    expect(report.errors).toEqual([CONTESTED_NO_POWER]);
    quoted(CONTESTED_NO_POWER);
  });

  it('§3 table · the global sanity rules (negative, round range, pinned, limits)', async () => {
    const negative = makeCopy();
    setGlobal(negative, 'PLAYER_LIFE', '-1');
    expect((await check(negative)).errors).toEqual(['globals.ts › PLAYER_LIFE › must be 0 or more › use 0 or more']);
    quoted('globals.ts › PLAYER_LIFE › must be 0 or more › use 0 or more');

    const rounds = makeCopy();
    setGlobal(rounds, 'APPRAISAL_ROUNDS', '[3, 13]');
    expect((await check(rounds)).errors).toEqual(['globals.ts › APPRAISAL_ROUNDS › round 13 > MAX_ROUNDS=12 › remove it']);
    quoted('globals.ts › APPRAISAL_ROUNDS › round 13 > MAX_ROUNDS=12 › remove it');

    const pinned = makeCopy();
    setGlobal(pinned, 'WARD_CHARGES', '2');
    expect((await check(pinned)).errors).toEqual(['globals.ts › WARD_CHARGES › must be 1 until the engine supports other values › keep 1']);
    quoted('globals.ts › WARD_CHARGES › must be 1 until the engine supports other values › keep 1');
  });

  it('§3 table · RELIC_FLAWS is pinned to 1, and any other value is refused', async () => {
    const root = makeCopy();
    setGlobal(root, 'RELIC_FLAWS', '2');
    const report = await check(root);
    expect(report.errors).toEqual([PINNED_RELIC_FLAWS]);
    quoted(PINNED_RELIC_FLAWS);
  });

  it('§3 table · deck generation cannot satisfy its constraints', async () => {
    const root = makeCopy();
    setGlobal(root, 'DECK_MIN_KINDS', '9');
    const report = await check(root);
    expect(report.errors).toEqual([
      'cards/player-monsters.json › pool › deck constraints unsatisfiable on 1000 of 1000 test dates › relax DECK_MIN_ELEMENTS, DECK_MIN_KINDS or the CURVE_* globals, or add monsters',
    ]);
    quoted('deck constraints unsatisfiable on 1000 of 1000 test dates');
  });

  it('§3 table · a CONTENT_NUMBERS name that clashes with a core key', async () => {
    const clash = makeCopy();
    addContentNumber(clash, '    PLAYER_LIFE: 3,');
    expect((await check(clash)).errors).toEqual([
      'globals.ts › CONTENT_NUMBERS › PLAYER_LIFE: PLAYER_LIFE is already a core key of Globals › rename it, or change the core PLAYER_LIFE instead',
    ]);
    quoted('is already a core key of Globals');
  });

  it('§3 "not yet checked" lines: there are no deferred rules today', () => {
    expect([...DEFERRED_RULES]).toEqual([]);
    quoted('not yet checked');
  });

  it('§3 "not yet read" line: a clean run prints it last when something is planned, with the count and readers from planned-globals.ts, and not at all when nothing is', () => {
    const root = makeCopy();
    const result = runScript(root, 'content-check.ts');
    expect(result.status).toBe(0);
    const planned = Object.values(PLANNED_GLOBALS);
    const printed = lines(result.stdout);
    if (planned.length === 0) {
      expect(printed.some((line) => line.startsWith('not yet read'))).toBe(false);
    } else {
      const readers = [...new Set(planned.map((entry) => entry.reader))].sort().join(', ');
      const line = `not yet read: ${planned.length} globals wait for ${readers} › see packages/content/src/planned-globals.ts`;
      expect(printed[printed.length - 1]).toBe(line);
    }
    // The guide shows the line with <N> and <readers>, so adding or wiring a planned global needs no guide edit.
    quoted('not yet read: <N> globals wait for <readers> › see packages/content/src/planned-globals.ts');
  }, SPAWN_TIMEOUT);
});

describe('guide §4 · change a monster or Relic', () => {
  it('§4 example: raising Power pushes the stat budget over, and the warning names the fix', async () => {
    const root = makeCopy();
    setGlobal(root, 'STAT_BUDGET_MIN', '8');
    setGlobal(root, 'STAT_BUDGET_MAX', '10');
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), keywords: ['swift'] };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-beast': 'feral · lunging · solid black shadow' });
    expect((await check(root)).warnings).toEqual([]);
    writeJson(root, 'cards/player-monsters.json', readArray(root, 'cards/player-monsters.json').map((card) =>
      card['id'] === 'example-beast' ? { ...card, power: 7 } : card,
    ));
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([BUDGET_11]);
  });

  it('§4 example: a second keyword is refused, and the fix is to remove one', async () => {
    const root = makeCopy();
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), keywords: ['swift', 'sentinel'] };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    const report = await check(root);
    expect(report.errors).toEqual([TWO_KEYWORDS]);
    quoted(TWO_KEYWORDS);
  });

  it('§4 example: the same limit applies to a Relic, and its line names the Relic file', async () => {
    const root = makeCopy();
    const relic = { ...(JSON.parse(RELIC_JSON) as Json), keywords: ['swift', 'sentinel'] };
    writeJson(root, 'cards/relics.json', [...readArray(root, 'cards/relics.json'), relic]);
    const report = await check(root);
    expect(report.errors).toEqual([RELIC_TWO_KEYWORDS]);
    quoted(RELIC_TWO_KEYWORDS);
  });

  it('§4 example: raising MAX_BASE_KEYWORDS to 2 accepts the two-keyword card', async () => {
    const root = makeCopy();
    setGlobal(root, 'MAX_BASE_KEYWORDS', '2');
    // Power 6 and Guard 3 with two keywords is a budget of 11, so the copy's budget top is raised to match.
    setGlobal(root, 'STAT_BUDGET_MAX', '11');
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), keywords: ['swift', 'sentinel'] };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-beast': 'feral · lunging · solid black shadow' });
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    quoted('MAX_BASE_KEYWORDS: 2,');
  });

  it('§4 example: a Relic with its Flaw in the right field is accepted, and an unknown Flaw is refused', async () => {
    const good = makeCopy();
    writeJson(good, 'cards/relics.json', [...readArray(good, 'cards/relics.json'), JSON.parse(RELIC_JSON) as Json]);
    writeJson(good, 'art-briefs.json', { ...readObject(good, 'art-briefs.json'), 'example-relic': 'feral · lunging · solid black shadow' });
    expect((await check(good)).errors).toEqual([]);

    const bad = makeCopy();
    writeJson(bad, 'cards/relics.json', [...readArray(bad, 'cards/relics.json'), { ...(JSON.parse(RELIC_JSON) as Json), flaw: 'frail' }]);
    const ids = KEYWORDS.filter((keyword) => keyword.kind === 'flaw').map((keyword) => keyword.id).sort().join(', ');
    expect((await check(bad)).errors).toEqual([`cards/relics.json › example-relic › Flaw "frail" is not registered › use one of: ${ids}, or add packages/content/keywords/frail.ts`]);
  });

  it('§4 example: a Relic without its Flaw is refused, and the fix says what to add', async () => {
    const root = makeCopy();
    writeJson(root, 'cards/relics.json', [...readArray(root, 'cards/relics.json'), withoutKeys(JSON.parse(RELIC_JSON) as Json, ['flaw'])]);
    const report = await check(root);
    expect(report.errors).toEqual([RELIC_FLAW_MISSING]);
    quoted(RELIC_FLAW_MISSING);
  });

  it('§4 example: a stat budget does not apply to a Relic', async () => {
    const root = makeCopy();
    setGlobal(root, 'STAT_BUDGET_MIN', '8');
    setGlobal(root, 'STAT_BUDGET_MAX', '10');
    writeJson(root, 'cards/relics.json', [...readArray(root, 'cards/relics.json'), { ...(JSON.parse(RELIC_JSON) as Json), power: 1, guard: 1 }]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-relic': 'feral · lunging · solid black shadow' });
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('§4 example: an element that is not in elements.json is refused', async () => {
    const root = makeCopy();
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), { ...(JSON.parse(BEAST_JSON) as Json), element: 'wind' }]);
    const report = await check(root);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.startsWith('cards/player-monsters.json › example-beast › unknown element "wind" › use one of: ')).toBe(true);
    quoted('unknown element "wind" › use one of:');
  });
});

describe('guide §5 · add or remove a card', () => {
  it('§5 example: add a monster with its art brief, and the check is clean', async () => {
    const root = makeCopy();
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), JSON.parse(BEAST_JSON) as Json]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-beast': 'feral · lunging · solid black shadow' });
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    quoted(BRIEF_LINE);
  });

  it('§5 example: a new monster without its brief gets a warning, not an error', async () => {
    const root = makeCopy();
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), JSON.parse(BEAST_JSON) as Json]);
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([MISSING_BRIEF]);
  });

  it('§5 example: add a spell, a trap and a Relic (each with its brief), and a Relic outside the deck is valid', async () => {
    const root = makeCopy();
    writeJson(root, 'cards/player-spells.json', [...readArray(root, 'cards/player-spells.json'), JSON.parse(SPELL_JSON) as Json]);
    writeJson(root, 'cards/player-traps.json', [...readArray(root, 'cards/player-traps.json'), JSON.parse(TRAP_JSON) as Json]);
    writeJson(root, 'cards/relics.json', [...readArray(root, 'cards/relics.json'), JSON.parse(RELIC_JSON) as Json]);
    writeJson(root, 'art-briefs.json', {
      ...readObject(root, 'art-briefs.json'),
      'example-purge': 'feral · lunging · solid black shadow',
      'example-snare': 'feral · lunging · solid black shadow',
      'example-relic': 'feral · lunging · solid black shadow',
    });
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('§5 example: a Collector spell swapped into his deck, with its AI entry, is clean', async () => {
    const root = makeCopy();
    const { removed } = swapPurgeIntoDeck(root, { pick: 'highestPower' });
    expect(removed, 'the guide says gilded-penitent, the first deck card the AI never names').toBe('gilded-penitent');
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    quoted(DECK_LINE);
    quoted(CAST_LINE);
  });

  it('§5 example: the same spell without its AI entry gets the D-177 warning', async () => {
    const root = makeCopy();
    const { at } = swapPurgeIntoDeck(root);
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([NO_AI_RULE(at)]);
    quoted(NO_AI_RULE(at));
  });

  it('§5 AI: an entry needs exactly one of "pick" or "when", and both or neither is refused', async () => {
    const neither = makeCopy();
    swapPurgeIntoDeck(neither, {});
    expect((await check(neither)).errors).toEqual([PURGE_NEEDS_ONE]);

    const both = makeCopy();
    swapPurgeIntoDeck(both, { pick: 'highestPower', when: 'contestedAttack' });
    expect((await check(both)).errors).toEqual([PURGE_NEEDS_ONE]);
    quoted(PURGE_NEEDS_ONE);
  });

  it('§5 AI: "contestedAttack" is refused on a spell that gives no Power to "chosen"', async () => {
    const root = makeCopy();
    swapPurgeIntoDeck(root, { when: 'contestedAttack' });
    const report = await check(root);
    expect(report.errors).toEqual([CONTESTED_NO_POWER]);
    quoted(CONTESTED_NO_POWER);
  });

  it('§5 AI: the shipped entries pass, including "contestedAttack" on Gilt Frame, which gives Power to "chosen"', async () => {
    const report = await check(makeCopy());
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('§5 AI: a deck trap that trapPreference does not name gets a warning', async () => {
    const root = makeCopy();
    const collector = readObject(root, 'collector.json');
    const ai = collector['ai'] as Json;
    const preferred = (ai['trapPreference'] as string[]).filter((id) => id !== 'display-case');
    writeJson(root, 'collector.json', { ...collector, ai: { ...ai, trapPreference: preferred } });
    const at = (collector['deck'] as string[]).indexOf('display-case');
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([TRAP_NOT_PREFERRED(at)]);
    quoted(TRAP_NOT_PREFERRED(at));
  });

  it('§5 example: one card too many in the Collector deck', async () => {
    const root = makeCopy();
    addCollectorSpell(root);
    const collector = readObject(root, 'collector.json');
    const deck = [...(collector['deck'] as string[]), 'example-collector-purge'];
    writeJson(root, 'collector.json', { ...collector, deck });
    setGlobal(root, 'COLLECTOR_DECK_SIZE', String(deck.length - 1));
    const report = await check(root);
    expect(report.errors).toEqual([`collector.json › deck › has ${deck.length} cards, needs COLLECTOR_DECK_SIZE=${deck.length - 1} › remove 1 card id`]);
    quoted('remove 1 card id');
  });

  it('§5 example: delete a Collector spell from its file but not from the deck, and see what is listed', async () => {
    const root = makeCopy();
    addCollectorSpell(root);
    const collector = readObject(root, 'collector.json');
    writeJson(root, 'collector.json', { ...collector, deck: (collector['deck'] as string[]).map((id) => (id === unnamedDeckId(collector) ? 'example-collector-purge' : id)) });
    writeJson(root, 'cards/collector-spells.json', readArray(root, 'cards/collector-spells.json').filter((spell) => spell['id'] !== 'example-collector-purge'));
    const deck = (readObject(root, 'collector.json')['deck'] as string[]);
    const at = deck.indexOf('example-collector-purge');
    const report = await check(root);
    expect(report.errors).toEqual([`collector.json › deck[${at}] › "example-collector-purge" no longer exists › remove the reference`]);
    expect(report.warnings).toEqual([`warning: art-briefs.json › example-collector-purge › orphan brief, no card or Chimera family has this id › delete the entry`]);
    quoted('no longer exists › remove the reference');
  });

  it('§5 example: delete too many player spells, and the pool error says how many to add', async () => {
    const root = makeCopy();
    setGlobal(root, 'DECK_SPELLS', '5');
    setGlobal(root, 'MAX_COPIES', '2');
    keepTwoPlayerSpells(root);
    const report = await check(root);
    expect(report.errors).toEqual([POOL_SPELLS]);
    expect(report.warnings).toEqual([]);
  });

  it('§5 example: delete a spell and leave its card numbers, and the check names each number', async () => {
    const root = makeCopy();
    writeJson(root, 'cards/player-spells.json', readArray(root, 'cards/player-spells.json').filter((spell) => spell['id'] !== 'siphon'));
    writeJson(root, 'art-briefs.json', withoutKeys(readObject(root, 'art-briefs.json'), ['siphon']));
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([UNUSED_SIPHON_DRAIN, UNUSED_SIPHON_GAIN]);
    quoted(UNUSED_SIPHON_DRAIN);
    quoted(UNUSED_SIPHON_GAIN);
  });

  it('§5 example: a deleted card whose brief is left behind gets an orphan warning', async () => {
    const root = makeCopy();
    writeJson(root, 'cards/player-spells.json', [...readArray(root, 'cards/player-spells.json'), JSON.parse(SPELL_JSON) as Json]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-purge': 'feral · lunging · solid black shadow' });
    writeJson(root, 'cards/player-spells.json', readArray(root, 'cards/player-spells.json').filter((spell) => spell['id'] !== 'example-purge'));
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([ORPHAN_BRIEF]);
  });

  it('§5 example: the ace must be a Relic, so a Collector spell or an unknown id is refused with the same line', async () => {
    const unknown = makeCopy();
    writeJson(unknown, 'collector.json', { ...readObject(unknown, 'collector.json'), ace: 'no-such-relic' });
    expect((await check(unknown)).errors).toEqual([ACE_NOT_RELIC, COVETOUS_MOVED]);

    const spell = makeCopy();
    writeJson(spell, 'collector.json', { ...readObject(spell, 'collector.json'), ace: 'forfeit' });
    expect((await check(spell)).errors).toEqual([
      'collector.json › ace › "forfeit" is not a Relic › use a Relic id from cards/relics.json',
      COVETOUS_MOVED,
    ]);
  });

  it('§5 example: rename a card by changing its name only, and the check is clean', async () => {
    const root = makeCopy();
    writeJson(root, 'cards/player-monsters.json', readArray(root, 'cards/player-monsters.json').map((card) =>
      card['id'] === 'cinderjaw-hound' ? { ...card, name: 'Example Hound' } : card,
    ));
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('§5 example: changing an id in the Collector list shows every reference that breaks', async () => {
    const root = makeCopy();
    const collector = readObject(root, 'collector.json');
    const ai = collector['ai'] as { params: { castHighValueSpell: Record<string, unknown> } };
    const key = Object.keys(ai.params.castHighValueSpell)[0] ?? '';
    const deck = collector['deck'] as string[];
    writeJson(root, 'cards/collector-spells.json', readArray(root, 'cards/collector-spells.json').map((spell) =>
      spell['id'] === key ? { ...spell, id: `${key}-2` } : spell,
    ));
    const at = deck.indexOf(key);
    const report = await check(root);
    expect(report.errors).toEqual([
      `collector.json › deck[${at}] › "${key}" no longer exists › remove the reference`,
      `collector.json › ai › params.castHighValueSpell.${key}: "${key}" is not a Collector spell in the deck › use a spell id from collector.json › deck`,
    ]);
    expect(report.warnings).toEqual([
      `warning: art-briefs.json › ${key}-2 › missing art brief › add a one-line "mood · pose · ink"`,
      `warning: art-briefs.json › ${key} › orphan brief, no card or Chimera family has this id › delete the entry`,
    ]);
  });
});

describe('guide §6 · write card text', () => {
  it('§6 example: a placeholder renders the current number, singular or plural', async () => {
    const root = makeCopy();
    addContentNumber(root, DRAW_NUMBER_LINE);
    writeJson(root, 'cards/player-spells.json', [...readArray(root, 'cards/player-spells.json'), JSON.parse(DRAW_JSON) as Json]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-draw': 'feral · lunging · solid black shadow' });
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    const g = await globalsOf(root);
    const text = 'Draw {DRAW_CARDS|card|cards}.';
    expect(renderText(text, withOverrides(g, ['DRAW_CARDS=1']))).toBe('Draw 1 card.');
    expect(renderText(text, withOverrides(g, ['DRAW_CARDS=3']))).toBe('Draw 3 cards.');
    quoted(DRAW_NUMBER_LINE.trim());
  });

  it('§6 example: a typed digit next to a global is refused', async () => {
    const report = await check(withText(makeCopy(), 'Draw 2 cards.'));
    expect(report.errors).toEqual([BARE_NUMBER]);
    quoted(BARE_NUMBER);
  });

  it('§6 example: a sign goes outside the placeholder', async () => {
    const g = await globalsOf(makeCopy());
    const rendered = renderText('−{TETHERED_PENALTY} Power', g);
    expect(rendered).toBe(`−${g.TETHERED_PENALTY} Power`);
    quoted('−{TETHERED_PENALTY} Power');
  });

  it('§6 example: a card text with two sentences is refused, and the one-sentence rule runs on the rendered text', async () => {
    const root = withText(makeCopy(), 'Draw a card. Then wait.');
    expect((await check(root)).errors).toEqual(['cards/player-spells.json › example-draw › text has 2 sentences › shorten to one sentence']);
    quoted(TWO_SENTENCES);
  });

  it('§6 example: a placeholder the card does not use gets a warning', async () => {
    const root = withText(makeCopy(), 'Draw {DRAW_CARDS|card|cards}.', [{ op: 'draw', who: 'self', n: 1 }]);
    const report = await check(root);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toContain(UNUSED_PLACEHOLDER);
  });

  it('§6 example: a malformed placeholder, an unknown name and a non-number are each refused', async () => {
    expect((await check(withText(makeCopy(), 'Draw {draw}.'))).errors).toEqual([MALFORMED]);
    expect((await check(withText(makeCopy(), 'Draw {DRAW_CARDZ|card|cards}.'))).errors).toEqual([UNKNOWN_PLACEHOLDER]);
    expect((await check(withText(makeCopy(), 'Version {CONTENT_VERSION}.'))).errors).toEqual([NOT_A_NUMBER]);
  });
});

describe('guide §7 · tune a global', () => {
  it('§7 example: change PLAYER_LIFE in globals.ts, and the copy reads the new value', async () => {
    const root = makeCopy();
    setGlobal(root, 'PLAYER_LIFE', '18');
    const g = await globalsOf(root);
    expect(g.PLAYER_LIFE).toBe(18);
    expect((await check(root)).errors).toEqual([]);
    quoted('PLAYER_LIFE: 18,');
  });

  it('§7 example: widen the stat budget and the warning goes away', async () => {
    const root = makeCopy();
    setGlobal(root, 'STAT_BUDGET_MIN', '8');
    setGlobal(root, 'STAT_BUDGET_MAX', '10');
    const beast = { ...(JSON.parse(BEAST_JSON) as Json), power: 7, keywords: ['swift'] };
    writeJson(root, 'cards/player-monsters.json', [...readArray(root, 'cards/player-monsters.json'), beast]);
    writeJson(root, 'art-briefs.json', { ...readObject(root, 'art-briefs.json'), 'example-beast': 'feral · lunging · solid black shadow' });
    expect((await check(root)).warnings).toEqual([BUDGET_11]);
    setGlobal(root, 'STAT_BUDGET_MAX', '11');
    expect((await check(root)).warnings).toEqual([]);
    quoted('STAT_BUDGET_MAX: 11,');
  });

  it('§7 example: a temporary --set changes the value the game reads, and card text shows it', async () => {
    const root = withText(makeCopy(), 'Draw {DRAW_CARDS|card|cards}.', [{ op: 'draw', who: 'self', n: '$DRAW_CARDS' }]);
    const g = await globalsOf(root);
    const before = g.PLAYER_LIFE;
    const overridden = withOverrides(g, ['PLAYER_LIFE=18', 'DRAW_CARDS=1']);
    expect(overridden.PLAYER_LIFE).toBe(18);
    expect(overridden.CONTENT_NUMBERS['DRAW_CARDS']).toBe(1);
    expect(renderText('Draw {DRAW_CARDS|card|cards}.', overridden)).toBe('Draw 1 card.');
    expect(g.PLAYER_LIFE, 'the base globals are not changed by an override').toBe(before);
    expect(withOverrides(g, []).PLAYER_LIFE, 'with no --set, the value is unchanged').toBe(before);
    quoted('--set PLAYER_LIFE=18');
    quoted('?set=PLAYER_LIFE=18');
  });

  it('§7 example: a typo in --set is refused with the list of keys', async () => {
    const g = await globalsOf(makeCopy());
    expect(messageOf(() => withOverrides(g, ['PLAYER_LEFE=18']))).toBe(
      'globals.ts › PLAYER_LEFE › unknown key › use a key from globals.ts or a name already in CONTENT_NUMBERS',
    );
    expect(() => withOverrides(g, ['PLAYER_LEFE=18'])).toThrow(OverridesError);
    quoted('unknown key › use a key from globals.ts or a name already in CONTENT_NUMBERS');
  });

  it('§7 example: --set of a whole object is refused, and a value that breaks a sanity rule is refused', async () => {
    const g = await globalsOf(makeCopy());
    expect(() => withOverrides(g, ['FLAGS={}'])).toThrow(OverridesError);
    expect(messageOf(() => withOverrides(g, ['FLAGS={}']))).toBe('globals.ts › FLAGS › set one entry at a time › write FLAGS.<NAME>=<value>');
    expect(messageOf(() => withOverrides(g, ['CONTENT_NUMBERS={}']))).toBe('globals.ts › CONTENT_NUMBERS › set one entry at a time › write CONTENT_NUMBERS.<NAME>=<value>');
    expect(messageOf(() => withOverrides(g, ['PLAYER_LIFE=-1']))).toBe('globals.ts › PLAYER_LIFE › must be 0 or more › use 0 or more');
    quoted('set one entry at a time › write FLAGS.<NAME>=<value>');
  });

  it('§7 example: a new card number needs one line in globals.ts; without it the check fails', async () => {
    const without = makeCopy();
    writeJson(without, 'cards/player-spells.json', [...readArray(without, 'cards/player-spells.json'), QUILL_SPELL]);
    writeJson(without, 'art-briefs.json', { ...readObject(without, 'art-briefs.json'), 'example-quill': 'feral · lunging · solid black shadow' });
    const failed = await check(without);
    expect(failed.errors).toEqual([
      'cards/player-spells.json › example-quill › text: unknown placeholder {QUILL_TOLL} › use a numeric name from globals.ts',
      'cards/player-spells.json › example-quill › "$QUILL_TOLL" not in globals.ts › use a name from globals.ts or CONTENT_NUMBERS',
    ]);

    const withLine = makeCopy();
    addContentNumber(withLine, QUILL_LINE);
    writeJson(withLine, 'cards/player-spells.json', [...readArray(withLine, 'cards/player-spells.json'), QUILL_SPELL]);
    writeJson(withLine, 'art-briefs.json', { ...readObject(withLine, 'art-briefs.json'), 'example-quill': 'feral · lunging · solid black shadow' });
    const fixed = await check(withLine);
    expect(fixed.errors).toEqual([]);
    expect(fixed.warnings).toEqual([]);
    quoted(QUILL_LINE);
  });

  it('§7 example: a CONTENT_NUMBERS name that repeats a core key is refused', async () => {
    const root = makeCopy();
    addContentNumber(root, '    PLAYER_LIFE: 3,');
    expect((await check(root)).errors).toEqual([
      'globals.ts › CONTENT_NUMBERS › PLAYER_LIFE: PLAYER_LIFE is already a core key of Globals › rename it, or change the core PLAYER_LIFE instead',
    ]);
  });

  it('§7 pinned settings: each accepts its one value and refuses any other', async () => {
    const g = await globalsOf(makeCopy());
    const cases: [string, string, string][] = [
      ['PLAYS_PER_TURN=2', 'globals.ts › PLAYS_PER_TURN › must be 1 until the engine supports other values › keep 1', 'PLAYS_PER_TURN=1'],
      ['REPOSITIONS_PER_TURN=2', 'globals.ts › REPOSITIONS_PER_TURN › must be 1 until the engine supports other values › keep 1', 'REPOSITIONS_PER_TURN=1'],
      ['ATTACKS_PER_TURN=2', 'globals.ts › ATTACKS_PER_TURN › must be 1 until the engine supports other values › keep 1', 'ATTACKS_PER_TURN=1'],
      ['MIN_GRAFT_MATERIALS=3', 'globals.ts › MIN_GRAFT_MATERIALS › must be 2 until the engine supports other values › keep 2', 'MIN_GRAFT_MATERIALS=2'],
      ['WARD_CHARGES=2', 'globals.ts › WARD_CHARGES › must be 1 until the engine supports other values › keep 1', 'WARD_CHARGES=1'],
      ['RELIC_FLAWS=2', PINNED_RELIC_FLAWS, 'RELIC_FLAWS=1'],
      ['BONDS_PER_TURN=2', BONDS_BAD, 'BONDS_PER_TURN=1'],
      ['SYMBIOTES_PER_HOST=2', SYMBIOTES_BAD, 'SYMBIOTES_PER_HOST=1'],
    ];
    for (const [refused, message, accepted] of cases) {
      expect(messageOf(() => withOverrides(g, [refused])), refused).toBe(message);
      expect(() => withOverrides(g, [accepted]), accepted).not.toThrow();
    }
    quoted('keep 1');
    quoted(PINNED_RELIC_FLAWS);
  });

  it('§7 limits: BOARD_SLOTS up to 16 and MAX_GRAFT_MATERIALS 2 to 3', async () => {
    const g = await globalsOf(makeCopy());
    expect(() => withOverrides(g, ['BOARD_SLOTS=16'])).not.toThrow();
    expect(messageOf(() => withOverrides(g, ['BOARD_SLOTS=17']))).toBe("globals.ts › BOARD_SLOTS › must be 16 or less, the engine's LOC_STRIDE › use 16 or less");
    expect(messageOf(() => withOverrides(g, ['MAX_GRAFT_MATERIALS=4']))).toBe('globals.ts › MAX_GRAFT_MATERIALS › must be from 2 to 3 › use 2 or 3');
    expect(() => withOverrides(g, ['MAX_GRAFT_MATERIALS=3'])).not.toThrow();
    quoted("must be 16 or less, the engine's LOC_STRIDE › use 16 or less");
    quoted('must be from 2 to 3 › use 2 or 3');
  });

  it('§7 flags: a flag is set by name, and an unknown flag is refused', async () => {
    const g = await globalsOf(makeCopy());
    expect(withOverrides(g, ['FLAGS.WEEKLY_TWIST=true']).FLAGS.WEEKLY_TWIST).toBe(true);
    expect(messageOf(() => withOverrides(g, ['FLAGS.NOPE=true']))).toMatch(/^globals\.ts › FLAGS\.NOPE › unknown flag › use one of: /);
    quoted('FLAGS.WEEKLY_TWIST=true');
  });

  it('§7 a planned setting is accepted today, and the check stays clean', async () => {
    // Nothing is planned in the repo, so the guide's example runs on a copy: a new setting with its schema entry,
    // then its planned line, exactly as the guide's worked example writes them.
    const root = makeCopy();
    const planned = "  EXAMPLE_LIMIT: { reader: 'engine', where: 'engine <file> (<decision>)' },";
    addLine(root, 'src/globals.ts', '  // Balance targets (sim report pass/fail)', '  EXAMPLE_LIMIT: 3,', 'before');
    addLine(root, 'src/schemas/globals.ts', '    // Balance targets', '    EXAMPLE_LIMIT: Int,', 'before');
    addLine(root, 'src/planned-globals.ts', 'PLANNED_GLOBALS: Readonly<Record<string, PlannedGlobal>> = {', planned, 'after');
    setGlobal(root, 'EXAMPLE_LIMIT', '5');
    const g = await globalsOf(root);
    expect(g).toHaveProperty('EXAMPLE_LIMIT', 5);
    // The copy's own content-check, so its own schema and planned list are the ones that accept the setting.
    const result = runScript(root, 'content-check.ts');
    expect(result.status, result.stderr).toBe(0);
    const printed = lines(result.stdout);
    expect(printed[printed.length - 1]).toBe('not yet read: 1 globals wait for engine › see packages/content/src/planned-globals.ts');
    quoted('EXAMPLE_LIMIT: 5,');
    quoted(planned.trim());
    quoted('planned-globals.ts');
  }, SPAWN_TIMEOUT);
});

// ---- The guide's own structure ----------------------------------------------------------------------------------------

describe('guide: structure and quoted text', () => {
  it('sections 1 to 7 appear in order', () => {
    const numbers = [...GUIDE.matchAll(/^## (\d+)\. /gm)].map((match) => Number(match[1]));
    expect(numbers.slice(0, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('every ```json block in the guide is valid JSON', () => {
    const blocks = [...GUIDE.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1] ?? '');
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) expect(() => JSON.parse(block), block).not.toThrow();
  });

  it('every message constant the tests assert is quoted verbatim in the guide', () => {
    for (const line of MESSAGES) expect(GUIDE_TEXT.includes(line), line).toBe(true);
  });

  it('every worked example snippet is quoted verbatim in the guide', () => {
    for (const snippet of SNIPPETS) expect(GUIDE.includes(snippet), snippet).toBe(true);
  });

  it('the guide no longer quotes the messages that changed (D-201, D-202, D-204, D-206, D-207)', () => {
    for (const old of [
      'keywords: ["swift","sentinel"] is above the maximum 1',
      'flaw: expected string, got undefined',
      '(entry): unknown key(s) flaw',
      '› castHighValueSpell.forfeit:',
      'the validator does not read `MAX_BASE_KEYWORDS`',
      'changing that number does nothing yet',
      'unknown key(s) example-collector-purge',
      'D-177 is not built',
      'The check does not warn about this yet',
    ]) {
      expect(GUIDE_TEXT.includes(old), `guide still quotes: ${old}`).toBe(false);
    }
  });

  it('every snippet the tests apply parses to the object the test uses', () => {
    expect(JSON.parse(BEAST_JSON)).toMatchObject({ id: 'example-beast', type: 'monster' });
    expect(JSON.parse(RELIC_JSON)).toMatchObject({ id: 'example-relic', flaw: 'slow' });
    expect(JSON.parse(SPELL_JSON)).toMatchObject({ id: 'example-purge', type: 'spell' });
    expect(JSON.parse(TRAP_JSON)).toMatchObject({ id: 'example-snare', type: 'trap' });
    expect(JSON.parse(DRAW_JSON)).toMatchObject({ id: 'example-draw', type: 'spell' });
    expect(JSON.parse(COLLECTOR_SPELL_JSON)).toMatchObject({ id: 'example-collector-purge' });
    expect(JSON.parse(`{${CAST_LINE.replace(/,$/, '')}}`)).toMatchObject({ 'example-collector-purge': { pick: 'highestPower' } });
  });
});

// v0.2.0 rules (2026-10-17): every new message the guide quotes is what content:check really prints.
describe('guide · the v0.2.0 rule levers', () => {
  it('an unknown element in a beats list is refused', async () => {
    const root = makeCopy();
    const elements = readArray(root, 'elements.json').map((e) => (e['id'] === 'ember' ? { ...e, beats: ['wind'] } : e));
    writeJson(root, 'elements.json', elements);
    expect((await check(root)).errors).toContain(BEATS_UNKNOWN);
  });

  it('removing an element names every place that still uses it', async () => {
    const root = makeCopy();
    writeJson(root, 'elements.json', readArray(root, 'elements.json').filter((e) => e['id'] !== 'umbra'));
    const errors = (await check(root)).errors;
    expect(errors).toContain(UMBRA_BEATS);
    const [prefix, suffix] = UMBRA_CARD.split('<card id>') as [string, string];
    const [suffixHead, suffixTail] = suffix.split('…') as [string, string];
    expect(errors.some((e) => e.startsWith(prefix) && e.includes(suffixHead) && e.endsWith(suffixTail))).toBe(true);
  });

  it('a reposition mode or summon lane rule that does not exist is refused', async () => {
    const root = makeCopy();
    const collector = readObject(root, 'collector.json');
    const ai = collector['ai'] as Json;
    const params = ai['params'] as Json;
    const lanes = params['summonLane'] as string[];
    writeJson(root, 'collector.json', { ...collector, ai: { ...ai, reposition: 'sometimes', params: { ...params, summonLane: ['nowhere', ...lanes.slice(1)] } } });
    const errors = (await check(root)).errors;
    expect(errors).toContain(REPOSITION_BAD);
    expect(errors).toContain(LANE_BAD);
  });

  it('a sickness mode, a lanes flag or a Sentinel reach of the wrong kind is refused', async () => {
    const sickness = makeCopy();
    setGlobal(sickness, 'SICKNESS_MODE', "'sometimes'");
    expect((await check(sickness)).errors).toContain(SICKNESS_BAD);

    const lanes = makeCopy();
    const path = join(lanes, 'src/globals.ts');
    const text = readFileSync(path, 'utf8');
    expect(/\bLANES: true/.test(text)).toBe(true);
    writeFileSync(path, text.replace(/\bLANES: true/, "LANES: 'yes'"));
    expect((await check(lanes)).errors).toContain(LANES_WORDS);

    const reach = makeCopy();
    setGlobal(reach, 'SENTINEL_REACH', '-1');
    expect((await check(reach)).errors).toContain(REACH_NEGATIVE);
  });

  it('a mistyped placeholder in the Sentinel text is caught with a suggestion', async () => {
    const root = makeCopy();
    const path = join(root, 'keywords/sentinel.ts');
    const text = readFileSync(path, 'utf8');
    expect(text.includes('{SENTINEL_REACH|')).toBe(true);
    writeFileSync(path, text.replace('{SENTINEL_REACH|', '{SENTINEL_REACHX|'));
    expect((await check(root)).errors).toContain(SENTINEL_TYPO);
  });
});

// Round 2026-10-18 (D-349 crown, D-350 royal court names, D-352 levy lines): the Monarch's lines, the crown switches
// and the player-facing names the guide uses.
describe('guide · the Monarch, the crown and the levy lines (D-349, D-350, D-352)', () => {
  it('§5 dialogue: a levy list is accepted, and without one the mood lines are used', async () => {
    const root = makeCopy();
    const collector = readObject(root, 'collector.json');
    const dialogue = collector['dialogue'] as Json;
    expect(dialogue['levy'], 'the shipped collector.json has a levy list').toBeDefined();
    expect((await check(root)).errors).toEqual([]);
    quoted(LEVY_LINE);

    writeJson(root, 'collector.json', { ...collector, dialogue: withoutKeys(dialogue, ['levy']) });
    const fallback = await check(root);
    expect(fallback.errors).toEqual([]);
    expect(fallback.warnings).toEqual([]);
  });

  it('§5 dialogue: a misspelled levy key is refused', async () => {
    const root = makeCopy();
    const collector = readObject(root, 'collector.json');
    const dialogue = collector['dialogue'] as Json;
    const misspelt = { ...withoutKeys(dialogue, ['levy']), levys: dialogue['levy'] };
    writeJson(root, 'collector.json', { ...collector, dialogue: misspelt });
    expect((await check(root)).errors).toEqual([DIALOGUE_LEVYS]);
    quoted(DIALOGUE_LEVYS);
  });

  it('§7 crown: CROWNED is switched off in one edit, and the check stays clean', async () => {
    const root = makeCopy();
    setGlobal(root, 'CROWNED', 'false');
    const g = await globalsOf(root);
    expect(g.FLAGS.CROWNED).toBe(false);
    expect((await check(root)).errors).toEqual([]);
    quoted(CROWNED_LINE);
  });

  it('§7 crown: CROWN_POWER is a number of 0 or more, and a negative one is refused', async () => {
    const root = makeCopy();
    setGlobal(root, 'CROWN_POWER', '2');
    const g = await globalsOf(root);
    expect(g.CROWN_POWER).toBe(2);
    expect((await check(root)).errors).toEqual([]);
    quoted(CROWN_POWER_LINE);
    expect(messageOf(() => withOverrides(g, ['CROWN_POWER=-1']))).toBe('globals.ts › CROWN_POWER › must be 0 or more › use 0 or more');
  });

  it('§7 crown: one simulator run can switch the crown off, and the base globals are unchanged', async () => {
    const g = await globalsOf(makeCopy());
    const overridden = withOverrides(g, ['FLAGS.CROWNED=false']);
    expect(overridden.FLAGS.CROWNED).toBe(false);
    expect(g.FLAGS.CROWNED, 'the base globals keep the crown on').toBe(true);
    quoted(CROWN_SIM_COMMAND);
  });

  it('the guide uses the player names, not the old card and screen names (D-350)', () => {
    for (const old of [
      'Gilt Frame',
      'Mourning Cartographer',
      'Abyssal Curator',
      'Provenance Ledger',
      'Display Case',
      'Counterfeit',
      'Insurance Claim',
      'The Collector loses',
      'Example Relic',
      'Example Collector Purge',
    ]) {
      expect(GUIDE_TEXT.includes(old), `guide still names: ${old}`).toBe(false);
    }
  });
});
