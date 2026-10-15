// Cross-file validator (ARCHITECTURE.md §10.3): the synthetic fixture passes every rule, and each implemented rule
// fails on a one-line break of the fixture with the exact §10.3 message (D-168: no test pins a live value).
import { describe, expect, it } from 'vitest';
import { FIXTURE_GLOBALS, fixtureData } from '../test-utils/fixture';
import { formatError, type ContentData } from './files';
import { KEYWORDS } from '../keywords/index.gen';
import { DEFERRED_RULES, validateContent } from './validate';

const G = FIXTURE_GLOBALS;

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture: ${what} is missing`);
  return value;
}

function entry<T extends { readonly id: string }>(list: readonly T[] | undefined, id: string): T {
  return need(list?.find((item) => item.id === id), `entry "${id}"`);
}

function run(data: ContentData, globals = G) {
  const result = validateContent(data, globals);
  return { errors: result.errors.map(formatError), warnings: result.warnings.map(formatError) };
}

function errorLines(data: ContentData, globals = G): string[] {
  return run(data, globals).errors;
}

describe('fixture', () => {
  it('passes every cross-file rule with no errors and no warnings', () => {
    expect(run(fixtureData())).toEqual({ errors: [], warnings: [] });
  });

  it('lists each deferred §10.3 rule as a non-empty line', () => {
    expect(DEFERRED_RULES.every((rule) => rule.trim() !== '')).toBe(true);
  });
});

describe('ids and vocabulary', () => {
  it('rejects a duplicate id across card files', () => {
    const data = fixtureData();
    need(data.collectorSpells, 'collectorSpells').push({
      id: 'fixture-whelp', type: 'spell', name: 'Copy', text: 'A copy.', effects: [{ op: 'draw', who: 'self', n: 1 }],
    });
    need(data.artBriefs, 'artBriefs')['fixture-whelp'] = 'fierce and small · mid-snarl · ember orange, soot black';
    expect(errorLines(data)).toEqual([
      'cards/collector-spells.json › fixture-whelp › duplicate id (also in cards/player-monsters.json) › rename one of them',
    ]);
  });

  it('rejects an unknown element on a base monster', () => {
    const data = fixtureData();
    entry(data.playerMonsters, 'fixture-whelp').element = 'wind';
    expect(errorLines(data)).toEqual([
      'cards/player-monsters.json › fixture-whelp › unknown element "wind" › use one of: ember, gale, or add it to elements.json',
    ]);
  });

  it('rejects an unknown kind on a base monster', () => {
    const data = fixtureData();
    entry(data.playerMonsters, 'fixture-whelp').kind = 'dragon';
    expect(errorLines(data)).toEqual([
      'cards/player-monsters.json › fixture-whelp › unknown kind "dragon" › use one of: beast, spirit, or add it to kinds.json',
    ]);
  });

  it('rejects an unknown element named in a condition', () => {
    const data = fixtureData();
    entry(data.playerSpells, 'fixture-bolt').target = {
      side: 'enemy',
      zone: 'board',
      where: { all: [{ faceUp: true }, { element: 'wind' }] },
    };
    expect(errorLines(data)).toEqual([
      'cards/player-spells.json › fixture-bolt › unknown element "wind" › use one of: ember, gale, or add it to elements.json',
    ]);
  });

  it('rejects an element beats entry that is not an element', () => {
    const data = fixtureData();
    entry(data.elements, 'ember').beats = ['lumin'];
    expect(errorLines(data)).toEqual([
      'elements.json › ember › beats unknown element "lumin" › use an id from elements.json',
    ]);
  });
});

describe('stat budget (D-109, D-167: a warning)', () => {
  it('warns, and does not fail, when a base monster is above STAT_BUDGET_MAX', () => {
    const data = fixtureData();
    const whelp = entry(data.playerMonsters, 'fixture-whelp');
    whelp.power = G.STAT_BUDGET_MAX; // P(max) + G4 is above the budget by 4
    const total = G.STAT_BUDGET_MAX + whelp.guard;
    const result = run(data);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      `cards/player-monsters.json › fixture-whelp › budget ${total} (P${G.STAT_BUDGET_MAX}+G4) outside ${G.STAT_BUDGET_MIN}–${G.STAT_BUDGET_MAX} › lower Power or Guard by ${total - G.STAT_BUDGET_MAX} if this is not intended`,
    ]);
  });

  it('warns, and does not fail, when a base monster is below STAT_BUDGET_MIN', () => {
    const data = fixtureData();
    const whelp = entry(data.playerMonsters, 'fixture-whelp');
    whelp.power = 0;
    whelp.guard = 0;
    const result = run(data);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      `cards/player-monsters.json › fixture-whelp › budget 0 (P0+G0) outside ${G.STAT_BUDGET_MIN}–${G.STAT_BUDGET_MAX} › raise Power or Guard by ${G.STAT_BUDGET_MIN} if this is not intended`,
    ]);
  });
});

describe('Chimera recipes', () => {
  it('rejects a kind pair with no recipe', () => {
    const data = fixtureData();
    data.recipes = need(data.recipes, 'recipes').filter((recipe) => recipe.id !== 'fixture-choir');
    delete need(data.artBriefs, 'artBriefs')['fixture-choir'];
    expect(errorLines(data)).toEqual([
      'recipes.json › (spirit, spirit) › no Chimera recipe for this kind pair › add {"kinds":["spirit","spirit"], …}',
    ]);
  });

  it('rejects a second recipe for a kind pair', () => {
    const data = fixtureData();
    need(data.recipes, 'recipes').push({
      id: 'fixture-pack-2', name: 'Fixture Pack Two', kinds: ['beast', 'beast'], power: 6, guard: 4,
    });
    need(data.artBriefs, 'artBriefs')['fixture-pack-2'] = 'savage and crowded · two packs fused · bone white, blood red';
    expect(errorLines(data)).toEqual([
      'recipes.json › fixture-pack-2 › pair (beast, beast) already defined by fixture-pack › delete one',
    ]);
  });
});

describe('Collector deck and AI references', () => {
  it('rejects a Collector deck that is not COLLECTOR_DECK_SIZE', () => {
    const data = fixtureData();
    const collector = need(data.collector, 'collector');
    collector.deck = collector.deck.filter((id) => id !== 'fixture-rite'); // keeps the ace and the trap in the deck
    const size = G.COLLECTOR_DECK_SIZE;
    expect(errorLines(data)).toEqual([
      `collector.json › deck › has ${size - 1} cards, needs COLLECTOR_DECK_SIZE=${size} › add 1 card id`,
    ]);
  });

  it('rejects a deck entry that is a player card', () => {
    const data = fixtureData();
    need(data.collector, 'collector').deck[1] = 'fixture-whelp';
    expect(errorLines(data)).toEqual([
      'collector.json › deck[1] › "fixture-whelp" is a player card › use a card from relics.json or collector-*.json',
    ]);
  });

  it('rejects a deck entry that no longer exists', () => {
    const data = fixtureData();
    need(data.collector, 'collector').deck[1] = 'vanished-idol';
    expect(errorLines(data)).toEqual([
      'collector.json › deck[1] › "vanished-idol" no longer exists › remove the reference',
    ]);
  });

  it('rejects a trapPreference id that is not a Collector trap in the deck (D-145)', () => {
    const data = fixtureData();
    need(data.collector, 'collector').ai.trapPreference[0] = 'snare';
    expect(errorLines(data)).toEqual([
      'collector.json › ai › trapPreference.[0]: "snare" is not a Collector trap in the deck › use a trap id from collector.json › deck',
    ]);
  });

  it('rejects a castHighValueSpell key that is not a Collector spell in the deck (D-145, D-204)', () => {
    // None of these ids is a spell in this fixture's deck, so each key is reported at its real JSON path.
    const data = fixtureData();
    need(data.collector, 'collector').ai.params.castHighValueSpell = {
      forfeit: { pick: 'highestPower' },
      restoration: { pick: 'highestPower' },
      'gilt-frame': { when: 'contestedAttack' },
    };
    expect(errorLines(data)).toEqual([
      'collector.json › ai › params.castHighValueSpell.forfeit: "forfeit" is not a Collector spell in the deck › use a spell id from collector.json › deck',
      'collector.json › ai › params.castHighValueSpell.restoration: "restoration" is not a Collector spell in the deck › use a spell id from collector.json › deck',
      'collector.json › ai › params.castHighValueSpell.gilt-frame: "gilt-frame" is not a Collector spell in the deck › use a spell id from collector.json › deck',
    ]);
  });

  it('names the mood path for a mood castHighValueSpell key (D-145, D-204)', () => {
    const data = fixtureData();
    need(data.collector, 'collector').ai.moods.agitated.params = { castHighValueSpell: { forfeit: { pick: 'highestPower' } } };
    expect(errorLines(data)).toEqual([
      'collector.json › ai › moods.agitated.params.castHighValueSpell.forfeit: "forfeit" is not a Collector spell in the deck › use a spell id from collector.json › deck',
    ]);
  });

  it('rejects "contestedAttack" on a spell that gives no Power to "chosen" (D-204)', () => {
    // fixture-rite is in the deck and only draws, so Gilt Frame's test has no Power to read.
    const data = fixtureData();
    need(data.collector, 'collector').ai.params.castHighValueSpell = { 'fixture-rite': { when: 'contestedAttack' } };
    expect(errorLines(data)).toEqual([
      'collector.json › ai › params.castHighValueSpell.fixture-rite: "contestedAttack" needs a spell that gives Power to "chosen" › use "pick": "highestPower" instead',
    ]);
  });

  it('accepts "contestedAttack" on a spell that gives Power to "chosen" (D-204)', () => {
    const data = withGiltSpell();
    need(data.collector, 'collector').ai.params.castHighValueSpell = { 'fixture-gilt': { when: 'contestedAttack' } };
    expect(run(data)).toEqual({ errors: [], warnings: [] });
  });

  it('rejects Covetous on a Relic that is not the ace', () => {
    const data = fixtureData();
    entry(data.relics, 'fixture-mantle').flaw = 'covetous';
    expect(errorLines(data)).toEqual([
      'cards/relics.json › fixture-mantle › Covetous is ace-only › change flaw or set collector.json ace',
    ]);
  });
});

/** Test-only globals with extra CONTENT_NUMBERS names, so a test picks the value a "$NAME" resolves to (D-168). */
function withNumbers(numbers: Record<string, number>): typeof G {
  return { ...G, CONTENT_NUMBERS: { ...G.CONTENT_NUMBERS, ...numbers } };
}

describe('contestedAttack and the Power it reads (D-219)', () => {
  const GILT_LINE =
    'collector.json › ai › params.castHighValueSpell.fixture-gilt: "contestedAttack" needs a spell that gives Power to "chosen" › use "pick": "highestPower" instead';

  /** The withGiltSpell fixture with its one effect replaced, and "contestedAttack" set on it. */
  function giltWith(effects: NonNullable<ContentData['collectorSpells']>[number]['effects']): ContentData {
    const data = withGiltSpell();
    const gilt = need(need(data.collectorSpells, 'collectorSpells').find((spell) => spell.id === 'fixture-gilt'), 'fixture-gilt');
    gilt.effects = effects;
    need(data.collector, 'collector').ai.params.castHighValueSpell = { 'fixture-gilt': { when: 'contestedAttack' } };
    return data;
  }

  it('rejects "contestedAttack" when a Power reference resolves to 0', () => {
    const data = giltWith([{ op: 'modifyStats', target: 'chosen', power: '$FIX_ZERO', duration: 'untilEndOfYourNextTurn' }]);
    expect(errorLines(data, withNumbers({ FIX_ZERO: 0 }))).toEqual([GILT_LINE]);
  });

  it('rejects "contestedAttack" when a negated Power reference resolves to a negative value', () => {
    const data = giltWith([{ op: 'modifyStats', target: 'chosen', power: '-$FIX_TWO', duration: 'untilEndOfYourNextTurn' }]);
    expect(errorLines(data, withNumbers({ FIX_TWO: 2 }))).toEqual([GILT_LINE]);
  });

  it('accepts "contestedAttack" when the Power is on an effect with an "if" condition', () => {
    const data = giltWith([
      {
        op: 'modifyStats',
        target: 'chosen',
        power: 2,
        duration: 'untilEndOfYourNextTurn',
        if: { powerLte: 3 },
      },
    ]);
    expect(run(data)).toEqual({ errors: [], warnings: [] });
  });
});

describe('Collector ace (D-203)', () => {
  it('rejects an ace id that is not in relics.json', () => {
    const data = fixtureData();
    need(data.collector, 'collector').ace = 'no-such-relic';
    expect(errorLines(data)).toEqual([
      'collector.json › ace › "no-such-relic" is not a Relic › use a Relic id from cards/relics.json',
    ]);
  });

  it('rejects an ace that is a Collector spell, not a Relic', () => {
    const data = fixtureData();
    need(data.collector, 'collector').ace = 'fixture-rite';
    expect(errorLines(data)).toEqual([
      'collector.json › ace › "fixture-rite" is not a Relic › use a Relic id from cards/relics.json',
    ]);
  });

  it('rejects a Relic ace that is not in the deck', () => {
    const data = fixtureData();
    need(data.collector, 'collector').ace = 'fixture-mantle';
    expect(errorLines(data)).toEqual([
      'collector.json › ace › "fixture-mantle" is not in the deck › add it to the deck list in collector.json',
    ]);
  });
});

describe('Collector AI warnings (D-177)', () => {
  it('warns when a deck spell has no AI entry and is not draw-only', () => {
    const data = withGiltSpell();
    expect(run(data)).toEqual({
      errors: [],
      warnings: [
        'collector.json › deck[1] › Collector spell "fixture-gilt" has no AI rule that casts it › add "fixture-gilt" to ai.params.castHighValueSpell with a pick, or make it draw-only',
      ],
    });
  });

  it('clears the warning when a base entry casts the spell', () => {
    const data = withGiltSpell();
    need(data.collector, 'collector').ai.params.castHighValueSpell = { 'fixture-gilt': { pick: 'highestPower' } };
    expect(run(data)).toEqual({ errors: [], warnings: [] });
  });

  it('counts a mood entry as an AI entry too', () => {
    const data = withGiltSpell();
    need(data.collector, 'collector').ai.moods.desperate.params = { castHighValueSpell: { 'fixture-gilt': { pick: 'highestPower' } } };
    expect(run(data).warnings).toEqual([]);
  });

  it('does not warn for a draw-only spell in the deck', () => {
    expect(run(fixtureData()).warnings).toEqual([]);
  });

  it('warns when a deck trap is not in trapPreference', () => {
    const data = fixtureData();
    need(data.collector, 'collector').ai.trapPreference = [];
    expect(run(data)).toEqual({
      errors: [],
      warnings: ['collector.json › deck[2] › Collector trap "fixture-ward-trap" is not in ai.trapPreference › add it, or AI rule 4 never sets it'],
    });
  });
});

describe('keyword count (D-201)', () => {
  it('rejects a base monster with more keywords than MAX_BASE_KEYWORDS', () => {
    const data = fixtureData();
    entry(data.playerMonsters, 'fixture-stag').keywords = ['swift', 'ward'];
    expect(errorLines(data)).toEqual([
      'cards/player-monsters.json › fixture-stag › keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword',
    ]);
  });

  it('rejects a Relic with more keywords than MAX_BASE_KEYWORDS', () => {
    const data = fixtureData();
    entry(data.relics, 'fixture-hydra').keywords = ['swift', 'ward'];
    expect(errorLines(data)).toEqual([
      'cards/relics.json › fixture-hydra › keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword',
    ]);
  });

  it('uses the singular for a limit of zero', () => {
    expect(errorLines(fixtureData(), { ...G, MAX_BASE_KEYWORDS: 0 })).toEqual([
      'cards/player-monsters.json › fixture-stag › keywords: has 1 keyword, max MAX_BASE_KEYWORDS=0 › remove 1 keyword',
    ]);
  });

  it('accepts two keywords when MAX_BASE_KEYWORDS is 2', () => {
    const data = fixtureData();
    entry(data.playerMonsters, 'fixture-stag').keywords = ['swift', 'ward'];
    expect(errorLines(data, { ...G, MAX_BASE_KEYWORDS: 2 })).toEqual([]);
  });
});

describe('unused content numbers (D-205: a warning, run when the keyword refs are given)', () => {
  const unmake = need(G.CONTENT_NUMBERS.UNMAKE_MAX_POWER, 'UNMAKE_MAX_POWER');
  const globals = { ...G, CONTENT_NUMBERS: { UNMAKE_MAX_POWER: unmake, QUILL_TOLL: 2 } };
  const unused = 'globals.ts › CONTENT_NUMBERS › QUILL_TOLL: not used by any card, objective, AI param or keyword › delete the line, or use $QUILL_TOLL in an effect';

  it('warns on a CONTENT_NUMBERS name that nothing uses', () => {
    const result = validateContent(fixtureData(), globals, KEYWORDS, []);
    expect(result.errors).toEqual([]);
    expect(result.warnings.map(formatError)).toEqual([unused]);
  });

  it('counts a keyword-source ref as a use', () => {
    const result = validateContent(fixtureData(), globals, KEYWORDS, ['QUILL_TOLL']);
    expect(result.warnings).toEqual([]);
  });

  it('is not run when no keyword refs are given', () => {
    const result = validateContent(fixtureData(), globals);
    expect(result.warnings.filter((warning) => warning.file === 'globals.ts')).toEqual([]);
  });
});

/** The fixture with a Collector spell that gives Power to "chosen" in the deck, in place of fixture-rite (D-204). */
function withGiltSpell(): ContentData {
  const data = fixtureData();
  const collector = need(data.collector, 'collector');
  collector.deck = ['fixture-hydra', 'fixture-gilt', 'fixture-ward-trap'];
  need(data.collectorSpells, 'collectorSpells').push({
    id: 'fixture-gilt', type: 'spell', name: 'Fixture Gilt', text: 'Gain Power.',
    target: { side: 'ally', zone: 'board', where: { faceUp: true } },
    effects: [{ op: 'modifyStats', target: 'chosen', power: 2, duration: 'untilEndOfYourNextTurn' }],
  });
  need(data.artBriefs, 'artBriefs')['fixture-gilt'] = 'bright and heavy · a gilt frame · gold, umber';
  return data;
}

describe('effects, traps and globals', () => {
  it('rejects a $NAME that is not in globals.ts and suggests the closest name', () => {
    const data = fixtureData();
    entry(data.playerSpells, 'fixture-bolt').target = {
      side: 'enemy',
      zone: 'board',
      where: { all: [{ faceUp: true }, { powerLte: '$UNMAKE_MAX_POWR' }] },
    };
    expect(errorLines(data)).toEqual([
      'cards/player-spells.json › fixture-bolt › "$UNMAKE_MAX_POWR" not in globals.ts › did you mean $UNMAKE_MAX_POWER?',
    ]);
  });

  it('accepts a $NAME from CONTENT_NUMBERS and rejects a non-numeric core global', () => {
    const data = fixtureData();
    entry(data.playerSpells, 'fixture-bolt').target = {
      side: 'enemy',
      zone: 'board',
      where: { powerLte: '$CONTENT_VERSION' },
    };
    expect(errorLines(data)).toEqual([
      'cards/player-spells.json › fixture-bolt › "$CONTENT_VERSION" is not a number in globals.ts › use a numeric global from globals.ts',
    ]);
  });

  it('rejects a spell effect that uses "chosen" without a target spec', () => {
    const data = fixtureData();
    delete entry(data.playerSpells, 'fixture-bolt').target;
    expect(errorLines(data)).toEqual([
      'cards/player-spells.json › fixture-bolt › effect uses target "chosen" but card has no "target" › add a target spec',
    ]);
  });

  it('rejects a spell effect whose ref is not "chosen"', () => {
    // A spell has no event, so "attacker" is not available. The target spec is then unused, which is reported too.
    const data = fixtureData();
    const bolt = entry(data.playerSpells, 'fixture-bolt');
    const effect = need(bolt.effects[0], 'bolt effect');
    if (!('target' in effect)) throw new Error('fixture: bolt effect has no target');
    effect.target = 'attacker';
    expect(errorLines(data)).toEqual([
      'cards/player-spells.json › fixture-bolt › ref "attacker" is not available for spells › use "chosen" with a target spec',
      'cards/player-spells.json › fixture-bolt › has a "target" but no effect uses "chosen" › remove "target" or use "chosen" in an effect',
    ]);
  });

  it('rejects a trap ref that its trigger does not provide', () => {
    const data = fixtureData();
    const effect = need(entry(data.playerTraps, 'fixture-snare').effects[0], 'snare effect');
    if (!('target' in effect)) throw new Error('fixture: snare effect has no target');
    effect.target = 'grafted';
    expect(errorLines(data)).toEqual([
      'cards/player-traps.json › fixture-snare › ref "grafted" is not available for trigger "enemyAttack" › use attacker or defender',
    ]);
  });

  it('rejects card text longer than one sentence', () => {
    const data = fixtureData();
    entry(data.playerSpells, 'fixture-bolt').text = 'Destroy a monster. It stays destroyed.';
    expect(errorLines(data)).toEqual([
      'cards/player-spells.json › fixture-bolt › text has 2 sentences › shorten to one sentence',
    ]);
  });
});

describe('pool capacity (D-170)', () => {
  it('passes when the spell pool can fill DECK_SPELLS with MAX_COPIES copies', () => {
    expect(errorLines(fixtureData())).toEqual([]);
  });

  it('rejects a spell pool too small for DECK_SPELLS and says how many to add', () => {
    const globals = { ...G, DECK_SPELLS: 3 };
    // 1 spell × MAX_COPIES cannot fill 3 spells, so ceil(3 / MAX_COPIES) − 1 more spells are needed.
    const needed = Math.ceil(3 / globals.MAX_COPIES) - 1;
    expect(errorLines(fixtureData(), globals)).toEqual([
      `cards/player-spells.json › pool › 1 spell × MAX_COPIES=${globals.MAX_COPIES} can't fill DECK_SPELLS=3 › add ${needed} spell${needed === 1 ? '' : 's'}, or lower DECK_SPELLS or raise MAX_COPIES in globals.ts`,
    ]);
  });

  it('rejects a trap pool too small for DECK_TRAPS', () => {
    const globals = { ...G, DECK_TRAPS: 5 };
    const needed = Math.ceil(5 / globals.MAX_COPIES) - 1;
    expect(errorLines(fixtureData(), globals)).toEqual([
      `cards/player-traps.json › pool › 1 trap × MAX_COPIES=${globals.MAX_COPIES} can't fill DECK_TRAPS=5 › add ${needed} trap${needed === 1 ? '' : 's'}, or lower DECK_TRAPS or raise MAX_COPIES in globals.ts`,
    ]);
  });
});

describe('cancelAttack placement (D-163)', () => {
  const problem = '"cancelAttack" only works in a trap with trigger enemyAttack or enemyDirectAttack › remove it or change the trigger';

  it('rejects cancelAttack in a spell', () => {
    const data = fixtureData();
    entry(data.playerSpells, 'fixture-bolt').effects.push({ op: 'cancelAttack' });
    expect(errorLines(data)).toEqual([`cards/player-spells.json › fixture-bolt › ${problem}`]);
  });

  it('rejects cancelAttack in a trap whose trigger is allyDestroyed', () => {
    const data = fixtureData();
    const trap = entry(data.playerTraps, 'fixture-snare');
    trap.trigger = 'allyDestroyed';
    trap.effects = [{ op: 'cancelAttack' }];
    expect(errorLines(data)).toEqual([`cards/player-traps.json › fixture-snare › ${problem}`]);
  });

  it('accepts cancelAttack in a trap whose trigger is enemyAttack', () => {
    const data = fixtureData();
    entry(data.playerTraps, 'fixture-snare').effects.push({ op: 'cancelAttack' });
    expect(errorLines(data)).toEqual([]);
  });

  it('accepts cancelAttack in a trap whose trigger is enemyDirectAttack', () => {
    const data = fixtureData();
    const trap = entry(data.playerTraps, 'fixture-snare');
    trap.trigger = 'enemyDirectAttack';
    trap.effects = [{ op: 'cancelAttack' }];
    expect(errorLines(data)).toEqual([]);
  });
});

describe('art briefs (D-110, D-174: warnings)', () => {
  it('warns, and does not fail, when a card has no art brief', () => {
    const data = fixtureData();
    delete need(data.artBriefs, 'artBriefs')['fixture-stag'];
    const result = run(data);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      'art-briefs.json › fixture-stag › missing art brief › add a one-line "mood · pose · palette"',
    ]);
  });

  it('warns, and does not fail, on a brief for an id that no card has', () => {
    const data = fixtureData();
    need(data.artBriefs, 'artBriefs')['ghost-card'] = 'faded and quiet · drifting in a hall · pale grey, ash, white';
    const result = run(data);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      'art-briefs.json › ghost-card › orphan brief, no card or Chimera family has this id › delete the entry',
    ]);
  });
});

describe('text placeholders (D-172)', () => {
  const bolt = (text: string): ContentData => {
    const data = fixtureData();
    entry(data.playerSpells, 'fixture-bolt').text = text;
    return data;
  };
  const boltLine = (problem: string, fix: string): string =>
    `cards/player-spells.json › fixture-bolt › text: ${problem} › ${fix}`;

  it('accepts a placeholder that the card uses', () => {
    expect(run(bolt(`Destroy an enemy monster with Power {UNMAKE_MAX_POWER} or less.`))).toEqual({ errors: [], warnings: [] });
  });

  it('rejects a bare number on a card that uses a global (rule 4)', () => {
    expect(errorLines(bolt(`Destroy an enemy monster with Power ${G.CONTENT_NUMBERS.UNMAKE_MAX_POWER} or less.`))).toEqual([
      boltLine(
        `bare number "${G.CONTENT_NUMBERS.UNMAKE_MAX_POWER}" while the card uses $UNMAKE_MAX_POWER`,
        `write {UNMAKE_MAX_POWER} instead of ${G.CONTENT_NUMBERS.UNMAKE_MAX_POWER}`,
      ),
    ]);
  });

  it('warns on a placeholder the card does not use (rule 6)', () => {
    expect(run(bolt('Destroy a monster with Power {SIPHON_GAIN} or less.')).warnings).toEqual([
      'cards/player-spells.json › fixture-bolt › text: {SIPHON_GAIN} is not used by this card\'s effects or conditions › check the name',
    ]);
  });

  it('rejects a malformed placeholder (rule 1)', () => {
    expect(errorLines(bolt('Destroy {Unmake}.'))).toEqual([
      boltLine('malformed placeholder "{Unmake}"', 'write {NAME} or {NAME|word|words} with a global name in capitals'),
    ]);
  });

  it('rejects an unknown placeholder and suggests the closest name (rule 2)', () => {
    expect(errorLines(bolt('Destroy with Power {UNMAKE_MAX_POWR} or less.'))).toEqual([
      boltLine('unknown placeholder {UNMAKE_MAX_POWR}', 'did you mean {UNMAKE_MAX_POWER}?'),
    ]);
  });

  it('rejects a placeholder that is not a number (rule 3)', () => {
    expect(errorLines(bolt('Destroy {CONTENT_VERSION}.'))).toEqual([
      boltLine('{CONTENT_VERSION} is not a number in globals.ts', 'use a numeric global'),
    ]);
  });

  it('counts sentences on the rendered text (rule 7)', () => {
    expect(errorLines(bolt('Destroy {UNMAKE_MAX_POWER} monsters. Again.'))).toEqual([
      'cards/player-spells.json › fixture-bolt › text has 2 sentences › shorten to one sentence',
    ]);
  });

  it('checks objective text with the same rules, using the objective\'s thresholds', () => {
    const data = fixtureData();
    const n = G.CONTENT_NUMBERS.UNMAKE_MAX_POWER;
    data.objectives = [{ id: 'fixture-goal', text: `Win with ${n}+ life`, requiresWin: true, metric: 'playerLife', gte: '$UNMAKE_MAX_POWER' }];
    expect(errorLines(data)).toEqual([
      `objectives.json › fixture-goal › text: bare number "${n}" while the objective uses $UNMAKE_MAX_POWER › write {UNMAKE_MAX_POWER} instead of ${n}`,
    ]);
  });

  it('checks twist text for malformed and unknown placeholders (rules 1–2)', () => {
    const data = fixtureData();
    data.twists = [{ id: 'mire', text: 'Monsters gain {UNMAKE_MAX_POWR} Power.', modifiers: [] }];
    expect(errorLines(data)).toEqual([
      'twists.json › mire › text: unknown placeholder {UNMAKE_MAX_POWR} › did you mean {UNMAKE_MAX_POWER}?',
    ]);
  });
});

describe('conditions on a destroyed monster (D-185)', () => {
  const trap = (): ContentData => {
    const data = fixtureData();
    const snare = entry(data.playerTraps, 'fixture-snare');
    snare.trigger = 'allyDestroyed';
    snare.effects = [{ op: 'destroy', target: 'destroyed' }];
    return data;
  };
  const message = (leaf: string): string =>
    `cards/player-traps.json › fixture-snare › condition "${leaf}" can't be checked on a destroyed monster › use type, relic, chimera, element, kind or graftedThisTurn`;

  it('accepts a when that uses only zone-free leaves, through all', () => {
    const data = trap();
    entry(data.playerTraps, 'fixture-snare').when = { all: [{ relic: true }, { element: 'ember' }] };
    expect(errorLines(data)).toEqual([]);
  });

  it('rejects a board-state leaf in when on an allyDestroyed trap', () => {
    const data = trap();
    entry(data.playerTraps, 'fixture-snare').when = { faceUp: true };
    expect(errorLines(data)).toEqual([message('faceUp')]);
  });

  it('rejects a board-state leaf in the if of an effect that acts on the destroyed monster', () => {
    const data = trap();
    entry(data.playerTraps, 'fixture-snare').effects = [{ op: 'destroy', target: 'destroyed', if: { not: { powerGte: 3 } } }];
    expect(errorLines(data)).toEqual([message('powerGte')]);
  });
});
