// The §10.3 rules added in content milestone 3: keyword references, Flaw kinds, Cond { keyword } refs and the
// globals sanity checks. Each fixture is a copy of the real data (the JSON is never changed), and each assertion
// is the exact §10.3 line.
import { describe, expect, it } from 'vitest';
import type { Globals } from '@vault-duel/engine';
import { DEFAULT_GLOBALS } from './globals';
import { formatError, loadContent, type ContentData } from './load';
import { DEFERRED_RULES, validateContent } from './validate';

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
  return need(list?.find((item) => item.id === id), `entry "${id}"`);
}

const lines = (data: ContentData, globals: Globals = DEFAULT_GLOBALS): string[] =>
  validateContent(data, globals).errors.map(formatError);

describe('keyword references (§10.3, D-111, D-114)', () => {
  it('passes the real content with the real registry', () => {
    expect(lines(realData())).toEqual([]);
  });

  it('rejects an unregistered keyword on a base monster', () => {
    const data = realData();
    entry(data.playerMonsters, 'stormcrow').keywords = ['hant'];
    expect(lines(data)).toEqual([
      'cards/player-monsters.json › stormcrow › keyword "hant" is not registered › use one of: echo, haunt, pierce, sentinel, swift, ward, or add packages/content/keywords/hant.ts',
    ]);
  });

  it('rejects a Flaw used as a base monster keyword', () => {
    const data = realData();
    entry(data.playerMonsters, 'stormcrow').keywords = ['slow'];
    expect(lines(data)).toEqual([
      'cards/player-monsters.json › stormcrow › "slow" is a Flaw, not a keyword › use one of: echo, haunt, pierce, sentinel, swift, ward',
    ]);
  });

  it('rejects a keyword used as a Relic Flaw (keyword used as a Flaw)', () => {
    const data = realData();
    entry(data.relics, 'stormglass-hydra').flaw = 'swift';
    expect(lines(data)).toEqual([
      'cards/relics.json › stormglass-hydra › "swift" is a keyword, not a Flaw › use one of: brittle, covetous, slow, tethered, vain',
    ]);
  });

  it('rejects an unregistered Flaw on a Relic', () => {
    const data = realData();
    entry(data.relics, 'stormglass-hydra').flaw = 'frail';
    expect(lines(data)).toEqual([
      'cards/relics.json › stormglass-hydra › Flaw "frail" is not registered › use one of: brittle, covetous, slow, tethered, vain, or add packages/content/keywords/frail.ts',
    ]);
  });

  it('checks Cond { keyword } refs in twists', () => {
    const data = realData();
    data.twists = [
      { id: 'mire', text: 'Mire.', modifiers: [{ where: { keyword: 'hant' }, power: 1 }] },
    ];
    expect(lines(data)).toEqual([
      'twists.json › mire › keyword "hant" is not registered › use one of: brittle, covetous, echo, haunt, pierce, sentinel, slow, swift, tethered, vain, ward, or add packages/content/keywords/hant.ts',
    ]);
  });

  it('accepts a Cond { keyword } that names a Flaw', () => {
    const data = realData();
    data.twists = [{ id: 'mire', text: 'Mire.', modifiers: [{ where: { keyword: 'vain' }, power: 1 }] }];
    expect(lines(data)).toEqual([]);
  });
});

describe('globals sanity (§10.3, D-133, D-147)', () => {
  it('passes the real globals', () => {
    expect(lines(realData())).toEqual([]);
  });

  it('rejects an APPRAISAL_ROUNDS entry above MAX_ROUNDS', () => {
    expect(lines(realData(), { ...DEFAULT_GLOBALS, APPRAISAL_ROUNDS: [3, 6, 13] })).toEqual([
      'globals.ts › APPRAISAL_ROUNDS › round 13 > MAX_ROUNDS=12 › remove it',
    ]);
  });

  it('rejects a Range whose min is above its max', () => {
    expect(lines(realData(), { ...DEFAULT_GLOBALS, TARGET_EXPERT_WINRATE: [0.6, 0.4] })).toEqual([
      'globals.ts › TARGET_EXPERT_WINRATE › min 0.6 > max 0.4 › write the pair as [min, max]',
    ]);
  });

  it('rejects WARD_CHARGES other than 1 (D-133)', () => {
    const problems = lines(realData(), { ...DEFAULT_GLOBALS, WARD_CHARGES: 2 });
    expect(problems).toEqual([
      'globals.ts › WARD_CHARGES › WARD_CHARGES must be 1 until the engine has a charge counter (D-133) › fix the value in globals.ts',
    ]);
  });
});

describe('deferred rules', () => {
  it('leaves only the deckgen feasibility rule deferred (it needs engine setup/deckgen.ts)', () => {
    expect(DEFERRED_RULES).toEqual([
      'deckgen feasibility: DECK constraints satisfiable on 1,000 test dates',
    ]);
  });
});
