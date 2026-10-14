// Cross-file validator (ARCHITECTURE.md §10.3): the real data passes, and each implemented rule fails on a
// minimal broken fixture with the exact §10.3 message. Fixtures are copies of the real data; the JSON is never changed.
import { describe, expect, it } from 'vitest';
import { formatError, loadContent, type ContentData } from './load';
import { DEFERRED_RULES, validateContent } from './validate';

/** A deep copy of the parsed real data. Every file must parse, or the fixtures would be meaningless. */
function realData(): ContentData {
  const loaded = loadContent();
  if (loaded.errors.length > 0) throw new Error('the real content does not parse; fix the zod pass first');
  return structuredClone(loaded.data);
}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture: ${what} is missing`);
  return value;
}

function entry<T extends { readonly id: string }>(list: readonly T[] | undefined, id: string): T {
  return need(
    list?.find((item) => item.id === id),
    `entry "${id}"`,
  );
}

function errorLines(data: ContentData): string[] {
  return validateContent(data).errors.map(formatError);
}

describe('real content', () => {
  it('passes every cross-file rule with no errors and no warnings', () => {
    const result = validateContent(realData());
    expect(result.errors.map(formatError)).toEqual([]);
    expect(result.warnings.map(formatError)).toEqual([]);
  });

  it('lists the §10.3 rules that are still deferred', () => {
    expect(DEFERRED_RULES.length).toBeGreaterThan(0);
  });
});

describe('ids and vocabulary', () => {
  it('rejects a duplicate id across card files', () => {
    const data = realData();
    const copy = { ...entry(data.relics, 'stormglass-hydra'), id: 'kiln-whelp' };
    need(data.relics, 'relics').push(copy);
    expect(errorLines(data)).toEqual([
      'cards/relics.json › kiln-whelp › duplicate id (also in cards/player-monsters.json) › rename one of them',
    ]);
  });

  it('rejects an unknown element on a base monster', () => {
    const data = realData();
    entry(data.playerMonsters, 'stormcrow').element = 'wind';
    expect(errorLines(data)).toEqual([
      'cards/player-monsters.json › stormcrow › unknown element "wind" › use one of: ember, gale, tide, lumen, umbra, or add it to elements.json',
    ]);
  });

  it('rejects an unknown kind on a base monster', () => {
    const data = realData();
    entry(data.playerMonsters, 'stormcrow').kind = 'dragon';
    expect(errorLines(data)).toEqual([
      'cards/player-monsters.json › stormcrow › unknown kind "dragon" › use one of: beast, knight, wyrm, construct, spirit, or add it to kinds.json',
    ]);
  });

  it('rejects an unknown element named in a condition', () => {
    const data = realData();
    entry(data.playerSpells, 'unmake').target = {
      side: 'enemy',
      zone: 'board',
      where: { all: [{ faceUp: true }, { element: 'wind' }] },
    };
    expect(errorLines(data)).toEqual([
      'cards/player-spells.json › unmake › unknown element "wind" › use one of: ember, gale, tide, lumen, umbra, or add it to elements.json',
    ]);
  });

  it('rejects an element beats entry that is not an element', () => {
    const data = realData();
    entry(data.elements, 'umbra').beats = ['lumin'];
    expect(errorLines(data)).toEqual([
      'elements.json › umbra › beats unknown element "lumin" › use an id from elements.json',
    ]);
  });
});

describe('stat budget (D-109)', () => {
  it('rejects a base monster whose budget is above STAT_BUDGET_MAX', () => {
    const data = realData();
    entry(data.playerMonsters, 'kiln-whelp').power = 8; // P8 + G3 = 11
    expect(errorLines(data)).toEqual([
      'cards/player-monsters.json › kiln-whelp › budget 11 (P8+G3) outside 8–10 › lower Power or Guard by 1',
    ]);
  });
});

describe('Chimera recipes', () => {
  it('rejects a kind pair with no recipe', () => {
    const data = realData();
    const kept = need(data.recipes, 'recipes').filter((recipe) => recipe.id !== 'choir-of-ash');
    data.recipes = kept;
    delete need(data.artBriefs, 'artBriefs')['choir-of-ash'];
    expect(errorLines(data)).toEqual([
      'recipes.json › (spirit, spirit) › no Chimera recipe for this kind pair › add {"kinds":["spirit","spirit"], …}',
    ]);
  });

  it('rejects a second recipe for a kind pair', () => {
    const data = realData();
    need(data.recipes, 'recipes').push({
      id: 'packmaw-2', name: 'Packmaw Two', kinds: ['beast', 'beast'], power: 7, guard: 4,
    });
    need(data.artBriefs, 'artBriefs')['packmaw-2'] = 'savage and crowded · two packs fused · bone white, blood red, black';
    expect(errorLines(data)).toEqual([
      'recipes.json › packmaw-2 › pair (beast, beast) already defined by packmaw › delete one',
    ]);
  });
});

describe('Collector deck and AI references', () => {
  it('rejects a Collector deck that is not COLLECTOR_DECK_SIZE', () => {
    const data = realData();
    const collector = need(data.collector, 'collector');
    // weeping-automaton is referenced nowhere else, so only the deck size is broken.
    collector.deck = collector.deck.filter((id) => id !== 'weeping-automaton');
    expect(errorLines(data)).toEqual([
      'collector.json › deck › has 19 cards, needs COLLECTOR_DECK_SIZE=20 › add 1 card id',
    ]);
  });

  it('rejects a deck entry that is a player card', () => {
    const data = realData();
    need(data.collector, 'collector').deck[4] = 'halo-stag';
    expect(errorLines(data)).toEqual([
      'collector.json › deck[4] › "halo-stag" is a player card › use a card from relics.json or collector-*.json',
    ]);
  });

  it('rejects a deck entry that no longer exists', () => {
    const data = realData();
    need(data.collector, 'collector').deck[7] = 'vanished-idol';
    expect(errorLines(data)).toEqual([
      'collector.json › deck[7] › "vanished-idol" no longer exists › remove the reference',
    ]);
  });

  it('rejects a trapPreference id that is not a Collector trap in the deck (D-145)', () => {
    const data = realData();
    need(data.collector, 'collector').ai.trapPreference[1] = 'snare';
    expect(errorLines(data)).toEqual([
      'collector.json › ai › trapPreference.[1]: "snare" is not a Collector trap in the deck › use a trap id from collector.json › deck',
    ]);
  });

  it('rejects a castHighValueSpell key that is not a Collector spell in the deck (D-145)', () => {
    // Every Collector pool card is already in the 20-card deck, so the swap in forfeit's slot duplicates a card.
    // Duplicate deck entries are not a §10.3 rule, so only the castHighValueSpell error is reported.
    const data = realData();
    const collector = need(data.collector, 'collector');
    collector.deck = collector.deck.map((id) => (id === 'forfeit' ? 'stormglass-hydra' : id));
    expect(errorLines(data)).toEqual([
      'collector.json › ai › castHighValueSpell.forfeit: "forfeit" is not a Collector spell in the deck › use a spell id from collector.json › deck',
    ]);
  });

  it('rejects Covetous on a Relic that is not the ace', () => {
    const data = realData();
    entry(data.relics, 'ashen-duchess').flaw = 'covetous';
    expect(errorLines(data)).toEqual([
      'cards/relics.json › ashen-duchess › Covetous is ace-only › change flaw or set collector.json ace',
    ]);
  });
});

describe('effects, traps and globals', () => {
  it('rejects a $NAME that is not in globals.ts and suggests the closest name', () => {
    const data = realData();
    entry(data.playerSpells, 'unmake').target = {
      side: 'enemy',
      zone: 'board',
      where: { all: [{ faceUp: true }, { powerLte: '$UNMAKE_MAX_POWR' }] },
    };
    expect(errorLines(data)).toEqual([
      'cards/player-spells.json › unmake › "$UNMAKE_MAX_POWR" not in globals.ts › did you mean $UNMAKE_MAX_POWER?',
    ]);
  });

  it('rejects a spell effect that uses "chosen" without a target spec', () => {
    const data = realData();
    delete entry(data.playerSpells, 'bloodlust').target;
    expect(errorLines(data)).toEqual([
      'cards/player-spells.json › bloodlust › effect uses target "chosen" but card has no "target" › add a target spec',
    ]);
  });

  it('rejects a spell effect whose ref is not "chosen"', () => {
    // A spell has no event, so "attacker" is not available. The target spec is then unused, which is reported too.
    const data = realData();
    const shroud = entry(data.playerSpells, 'shroud');
    const effect = need(shroud.effects[0], 'shroud effect');
    if (!('target' in effect)) throw new Error('fixture: shroud effect has no target');
    effect.target = 'attacker';
    expect(errorLines(data)).toEqual([
      'cards/player-spells.json › shroud › ref "attacker" is not available for spells › use "chosen" with a target spec',
      'cards/player-spells.json › shroud › has a "target" but no effect uses "chosen" › remove "target" or use "chosen" in an effect',
    ]);
  });

  it('rejects a trap ref that its trigger does not provide', () => {
    const data = realData();
    const effect = need(entry(data.playerTraps, 'mirror-sigil').effects[0], 'mirror-sigil effect');
    if (!('target' in effect)) throw new Error('fixture: mirror-sigil effect has no target');
    effect.target = 'grafted';
    expect(errorLines(data)).toEqual([
      'cards/player-traps.json › mirror-sigil › ref "grafted" is not available for trigger "enemyAttack" › use attacker or defender',
    ]);
  });

  it('rejects card text longer than one sentence', () => {
    const data = realData();
    entry(data.playerSpells, 'bloodlust').text = 'One of your monsters gets +3 Power this turn. It stays strong.';
    expect(errorLines(data)).toEqual([
      'cards/player-spells.json › bloodlust › text has 2 sentences › shorten to one sentence',
    ]);
  });
});

describe('cancelAttack placement (D-163)', () => {
  const problem = '"cancelAttack" only works in a trap with trigger enemyAttack or enemyDirectAttack › remove it or change the trigger';

  it('rejects cancelAttack in a spell', () => {
    const data = realData();
    entry(data.playerSpells, 'bloodlust').effects.push({ op: 'cancelAttack' });
    expect(errorLines(data)).toEqual([
      `cards/player-spells.json › bloodlust › ${problem}`,
    ]);
  });

  it('rejects cancelAttack in a trap whose trigger is allyDestroyed', () => {
    const data = realData();
    entry(data.playerTraps, 'last-rites').effects.push({ op: 'cancelAttack' });
    expect(errorLines(data)).toEqual([
      `cards/player-traps.json › last-rites › ${problem}`,
    ]);
  });

  it('accepts cancelAttack in a trap whose trigger is enemyAttack', () => {
    const data = realData();
    entry(data.playerTraps, 'mirror-sigil').effects.push({ op: 'cancelAttack' });
    expect(errorLines(data)).toEqual([]);
  });

  it('accepts cancelAttack in a trap whose trigger is enemyDirectAttack', () => {
    const data = realData();
    const trap = entry(data.playerTraps, 'last-rites');
    trap.trigger = 'enemyDirectAttack';
    trap.effects.push({ op: 'cancelAttack' });
    expect(errorLines(data)).toEqual([]);
  });
});

describe('art briefs', () => {
  it('rejects a card with no art brief', () => {
    const data = realData();
    delete need(data.artBriefs, 'artBriefs')['gale-serpent'];
    expect(errorLines(data)).toEqual([
      'art-briefs.json › gale-serpent › missing art brief › add a one-line "mood · pose · palette"',
    ]);
  });

  it('rejects a brief for an id that no card or family has', () => {
    const data = realData();
    need(data.artBriefs, 'artBriefs')['ghost-card'] = 'faded and quiet · drifting in a hall · pale grey, ash, white';
    expect(errorLines(data)).toEqual([
      'art-briefs.json › ghost-card › orphan brief, no card or Chimera family has this id › delete the entry',
    ]);
  });
});

describe('pool sizes (warnings only)', () => {
  it('warns, and does not fail, when the base monster pool is not POOL_MONSTERS', () => {
    const data = realData();
    const monsters = need(data.playerMonsters, 'playerMonsters');
    data.playerMonsters = monsters.filter((monster) => monster.id !== 'gale-serpent');
    delete need(data.artBriefs, 'artBriefs')['gale-serpent'];
    const result = validateContent(data);
    expect(result.errors.map(formatError)).toEqual([]);
    expect(result.warnings.map(formatError)).toEqual([
      'cards/player-monsters.json › pool › has 24 monsters, expects POOL_MONSTERS=25 › add or remove monsters, or change POOL_MONSTERS in globals.ts',
    ]);
  });
});
