// A deliberately broken fixture must fail with a readable §10.3 message.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formatError, parseFile } from './files';
import { PlayerMonster, Relic } from './schemas/card';
import { Collector, AI_PLAY_RULES, AI_REPOSITION } from './schemas/collector';
import { Objective } from './schemas/objective';
import { fixtureData } from '../test-utils/fixture';

const KILN_WHELP = {
  id: 'kiln-whelp', type: 'monster', name: 'Kiln Whelp', element: 'ember', kind: 'wyrm',
  power: '7', guard: 3, keywords: [],
};

describe('schema failures', () => {
  it('reports a quoted number with the file, id, field and fix', () => {
    const result = parseFile('cards/player-monsters.json', z.array(PlayerMonster), [KILN_WHELP]);
    expect('errors' in result).toBe(true);
    if (!('errors' in result)) return;
    const lines = result.errors.map(formatError);
    expect(lines).toEqual([
      'cards/player-monsters.json › kiln-whelp › power: expected number, got "7" › write numbers without quotes',
    ]);
  });

  it('reports a Relic with no Flaw as missing (D-207)', () => {
    const relic = { ...KILN_WHELP, id: 'broken-relic', power: 7, keywords: ['ward'] };
    const result = parseFile('cards/relics.json', z.array(Relic), [relic]);
    expect('errors' in result).toBe(true);
    if (!('errors' in result)) return;
    expect(result.errors.map(formatError)).toEqual([
      'cards/relics.json › broken-relic › flaw: missing, a Relic needs exactly 1 Flaw › add "flaw": "<flaw id>"',
    ]);
  });

  it('reports a missing field as missing and says what to add (D-207)', () => {
    const noPower: Record<string, unknown> = { ...KILN_WHELP };
    delete noPower['power'];
    const result = parseFile('cards/player-monsters.json', z.array(PlayerMonster), [noPower]);
    expect('errors' in result).toBe(true);
    if (!('errors' in result)) return;
    expect(result.errors.map(formatError)).toEqual([
      'cards/player-monsters.json › kiln-whelp › power: missing › add "power"',
    ]);
  });

  it('reports a Flaw on a base monster with the reason (D-207)', () => {
    const monster = { ...KILN_WHELP, power: 7, id: 'halo-stag', flaw: 'slow' };
    const result = parseFile('cards/player-monsters.json', z.array(PlayerMonster), [monster]);
    expect('errors' in result).toBe(true);
    if (!('errors' in result)) return;
    expect(result.errors.map(formatError)).toEqual([
      'cards/player-monsters.json › halo-stag › Flaws appear only on Relics › remove "flaw"',
    ]);
  });

  it('keeps the generic unknown-key line when a base monster has other unknown keys too (D-207)', () => {
    const monster = { ...KILN_WHELP, power: 7, id: 'halo-stag', flaw: 'slow', colour: 'red' };
    const result = parseFile('cards/player-monsters.json', z.array(PlayerMonster), [monster]);
    expect('errors' in result).toBe(true);
    if (!('errors' in result)) return;
    expect(result.errors.map(formatError)).toEqual([
      'cards/player-monsters.json › halo-stag › unknown key(s) flaw, colour › remove flaw, colour',
    ]);
  });

  it('prints the objective threshold fix from params.fix (D-207)', () => {
    const result = parseFile('objectives.json', z.array(Objective), [
      { id: 'win-fast', text: 'Win fast.', requiresWin: true, metric: 'round' },
    ]);
    expect('errors' in result).toBe(true);
    if (!('errors' in result)) return;
    expect(result.errors.map(formatError)).toEqual([
      'objectives.json › win-fast › needs exactly one of "lte" or "gte" › keep exactly one of "lte" or "gte"',
    ]);
  });

  it('omits the field part for a whole-entry problem (D-206)', () => {
    const relic = { ...KILN_WHELP, id: 'r1', power: 7, keywords: [], flaw: 'slow', foo: 1 };
    const result = parseFile('cards/relics.json', z.array(Relic), [relic]);
    expect('errors' in result).toBe(true);
    if (!('errors' in result)) return;
    expect(result.errors.map(formatError)).toEqual(['cards/relics.json › r1 › unknown key(s) foo › remove foo']);
  });

  it('keeps the (file) entry for a whole-file problem and omits the field (D-206)', () => {
    expect(formatError({
      file: 'elements.json', id: '(file)', field: '', problem: 'file is missing', fix: 'create elements.json',
    })).toBe('elements.json › (file) › file is missing › create elements.json');
  });
});

describe('castHighValueSpell entries (D-204)', () => {
  /** The fixture's Collector block, which parses; the tests set one castHighValueSpell entry on it. */
  const collectorWith = (entry: unknown): unknown => {
    const raw = structuredClone(fixtureData().collector) as unknown as { ai: { params: Record<string, unknown> } };
    raw.ai.params['castHighValueSpell'] = { 'fixture-rite': entry };
    return raw;
  };
  const message = 'collector.json › ai › params.castHighValueSpell.fixture-rite: needs exactly one of "pick" or "when" › keep exactly one of "pick" or "when"';

  it('rejects an entry with neither "pick" nor "when"', () => {
    const result = parseFile('collector.json', Collector, collectorWith({}));
    expect('errors' in result && result.errors.map(formatError)).toEqual([message]);
  });

  it('rejects an entry with both "pick" and "when"', () => {
    const result = parseFile('collector.json', Collector, collectorWith({ pick: 'highestPower', when: 'contestedAttack' }));
    expect('errors' in result && result.errors.map(formatError)).toEqual([message]);
  });

  it('accepts one mode', () => {
    expect('data' in parseFile('collector.json', Collector, collectorWith({ pick: 'highestPower' }))).toBe(true);
  });
});

describe('closed collector AI enums (D-145)', () => {
  it('rejects an unknown play rule id and an unknown mood reposition', () => {
    const ok = AI_PLAY_RULES.safeParse('summonAce').success;
    const typo = AI_PLAY_RULES.safeParse('summonAcee');
    const badMood = AI_REPOSITION.safeParse('guardUnlessBeater');
    expect(ok).toBe(true);
    expect(typo.success).toBe(false);
    expect(badMood.success).toBe(false);
  });
});
