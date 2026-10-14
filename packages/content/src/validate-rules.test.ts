// The §10.3 rules for keyword references (D-111, D-114) and the globals sanity checks (D-133, D-147). Each case
// breaks one line of the synthetic fixture (D-168) and asserts the exact §10.3 line. The keyword registry is read
// from keywords/index.gen.ts, because keywords are rules; no case depends on a live card.
import { describe, expect, it } from 'vitest';
import type { Globals, KeywordDef } from '@vault-duel/engine';
import { TEST_GLOBALS } from '@vault-duel/engine/test-utils/globals';
import { KEYWORDS } from '../keywords/index.gen';
import { FIXTURE_GLOBALS, fixtureData } from '../test-utils/fixture';
import { formatError, type ContentData } from './files';
import { validateContent } from './validate';

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture: ${what} is missing`);
  return value;
}

function entry<T extends { readonly id: string }>(list: readonly T[] | undefined, id: string): T {
  return need(list?.find((item) => item.id === id), `entry "${id}"`);
}

/** The sorted ids the registry offers for a kind, as the §10.3 "use one of" lists print them. */
function registered(kind: 'keyword' | 'flaw'): string {
  return KEYWORDS.filter((keyword: KeywordDef) => keyword.kind === kind)
    .map((keyword) => keyword.id)
    .sort()
    .join(', ');
}

function allRegistered(): string {
  return KEYWORDS.map((keyword: KeywordDef) => keyword.id).sort().join(', ');
}

const lines = (data: ContentData, globals: Globals = FIXTURE_GLOBALS): string[] =>
  validateContent(data, globals).errors.map(formatError);

describe('keyword references (§10.3, D-111, D-114)', () => {
  it('rejects an unregistered keyword on a base monster', () => {
    const data = fixtureData();
    entry(data.playerMonsters, 'fixture-stag').keywords = ['hant'];
    expect(lines(data)).toEqual([
      `cards/player-monsters.json › fixture-stag › keyword "hant" is not registered › use one of: ${registered('keyword')}, or add packages/content/keywords/hant.ts`,
    ]);
  });

  it('rejects a Flaw used as a base monster keyword', () => {
    const data = fixtureData();
    entry(data.playerMonsters, 'fixture-stag').keywords = ['slow'];
    expect(lines(data)).toEqual([
      `cards/player-monsters.json › fixture-stag › "slow" is a Flaw, not a keyword › use one of: ${registered('keyword')}`,
    ]);
  });

  it('rejects a keyword used as a Relic Flaw', () => {
    const data = fixtureData();
    entry(data.relics, 'fixture-hydra').flaw = 'swift';
    expect(lines(data)).toEqual([
      `cards/relics.json › fixture-hydra › "swift" is a keyword, not a Flaw › use one of: ${registered('flaw')}`,
    ]);
  });

  it('rejects an unregistered Flaw on a Relic', () => {
    const data = fixtureData();
    entry(data.relics, 'fixture-hydra').flaw = 'frail';
    expect(lines(data)).toEqual([
      `cards/relics.json › fixture-hydra › Flaw "frail" is not registered › use one of: ${registered('flaw')}, or add packages/content/keywords/frail.ts`,
    ]);
  });

  it('checks Cond { keyword } refs in twists against every registered id', () => {
    const data = fixtureData();
    data.twists = [{ id: 'mire', text: 'Mire.', modifiers: [{ where: { keyword: 'hant' }, power: 1 }] }];
    expect(lines(data)).toEqual([
      `twists.json › mire › keyword "hant" is not registered › use one of: ${allRegistered()}, or add packages/content/keywords/hant.ts`,
    ]);
  });

  it('accepts a Cond { keyword } that names a Flaw', () => {
    const data = fixtureData();
    data.twists = [{ id: 'mire', text: 'Mire.', modifiers: [{ where: { keyword: 'vain' }, power: 1 }] }];
    expect(lines(data)).toEqual([]);
  });
});

describe('globals sanity (§10.3, D-133, D-147)', () => {
  it('rejects an APPRAISAL_ROUNDS entry above MAX_ROUNDS', () => {
    const over = TEST_GLOBALS.MAX_ROUNDS + 1;
    expect(lines(fixtureData(), { ...FIXTURE_GLOBALS, APPRAISAL_ROUNDS: [3, over] })).toEqual([
      `globals.ts › APPRAISAL_ROUNDS › round ${over} > MAX_ROUNDS=${TEST_GLOBALS.MAX_ROUNDS} › remove it`,
    ]);
  });

  it('rejects a Range whose min is above its max', () => {
    expect(lines(fixtureData(), { ...FIXTURE_GLOBALS, TARGET_EXPERT_WINRATE: [0.6, 0.4] })).toEqual([
      'globals.ts › TARGET_EXPERT_WINRATE › min 0.6 > max 0.4 › write the pair as [min, max]',
    ]);
  });

  it('pins WARD_CHARGES to its only supported value (D-133, D-199)', () => {
    expect(lines(fixtureData(), { ...FIXTURE_GLOBALS, WARD_CHARGES: 2 })).toEqual([
      'globals.ts › WARD_CHARGES › must be 1 until the engine supports other values › keep 1',
    ]);
  });

  it('rejects a negative number (signs are written outside the number, D-172)', () => {
    expect(lines(fixtureData(), { ...FIXTURE_GLOBALS, PLAYER_LIFE: -1 })).toEqual([
      'globals.ts › PLAYER_LIFE › must be 0 or more › use 0 or more',
    ]);
  });

  it('rejects a rate outside 0…1', () => {
    expect(lines(fixtureData(), { ...FIXTURE_GLOBALS, BOT_NOISE_EPSILON: 1.5 })).toEqual([
      'globals.ts › BOT_NOISE_EPSILON › must be between 0 and 1 › use a rate from 0 to 1',
    ]);
  });

  it('rejects star cuts that do not descend (D-098, D-126)', () => {
    expect(lines(fixtureData(), { ...FIXTURE_GLOBALS, DIFFICULTY_STAR_CUTS: [0.4, 0.6] })).toEqual([
      'globals.ts › DIFFICULTY_STAR_CUTS › cuts must descend, got [0.4, 0.6] › write the higher (1-star) cut first',
    ]);
  });

  it('rejects a win-rate band with its max below its min', () => {
    expect(lines(fixtureData(), { ...FIXTURE_GLOBALS, SEED_WINRATE_MIN: 0.6, SEED_WINRATE_MAX: 0.4 })).toEqual([
      'globals.ts › SEED_WINRATE_MAX › 0.4 < SEED_WINRATE_MIN=0.6 › raise SEED_WINRATE_MAX or lower SEED_WINRATE_MIN',
    ]);
  });
});

describe('keyword text (D-172 rules 1–3, 5, 7; D-198)', () => {
  const keyword = (text: string): KeywordDef => ({
    id: 'fixture-kw', name: 'Fixture', kind: 'keyword', icon: 'fixture', visual: 'fixture', text, hooks: {},
  });
  const registry = (text: string): readonly KeywordDef[] => [...KEYWORDS, keyword(text)];
  const kwLines = (text: string): string[] =>
    validateContent(fixtureData(), FIXTURE_GLOBALS, registry(text)).errors.map(formatError);
  const where = 'keywords/fixture-kw.ts › fixture-kw › text: ';

  it('accepts a placeholder and no errors', () => {
    expect(kwLines('Lose {UNMAKE_MAX_POWER} Power.')).toEqual([]);
  });

  it('rejects a bare number, since every keyword number comes from globals', () => {
    expect(kwLines('Lose 2 Power.')).toEqual([
      `${where}bare number "2" › write a {NAME} placeholder for the global the keyword uses`,
    ]);
  });

  it('rejects an unknown placeholder and suggests the closest name', () => {
    expect(kwLines('Lose {UNMAKE_MAX_POWR} Power.')).toEqual([
      `${where}unknown placeholder {UNMAKE_MAX_POWR} › did you mean {UNMAKE_MAX_POWER}?`,
    ]);
  });

  it('rejects a malformed placeholder', () => {
    expect(kwLines('Lose {Unmake} Power.')).toEqual([
      `${where}malformed placeholder "{Unmake}" › write {NAME} or {NAME|word|words} with a global name in capitals`,
    ]);
  });

  it('rejects a placeholder that is not a number', () => {
    expect(kwLines('Lose {CONTENT_VERSION} Power.')).toEqual([
      `${where}{CONTENT_VERSION} is not a number in globals.ts › use a numeric global`,
    ]);
  });

  it('counts sentences on the rendered text', () => {
    expect(kwLines('Lose {UNMAKE_MAX_POWER} Power. Then lose more.')).toEqual([
      'keywords/fixture-kw.ts › fixture-kw › text has 2 sentences › shorten to one sentence',
    ]);
  });
});
