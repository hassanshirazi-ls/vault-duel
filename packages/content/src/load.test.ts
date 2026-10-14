// A deliberately broken fixture must fail with a readable §10.3 message.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formatError, parseFile } from './load';
import { PlayerMonster, Relic } from './schemas/card';

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

  it('reports a Relic with two keywords and no Flaw', () => {
    const relic = { ...KILN_WHELP, id: 'broken-relic', keywords: ['ward', 'echo'] };
    const result = parseFile('cards/relics.json', z.array(Relic), [relic]);
    expect('errors' in result).toBe(true);
    if (!('errors' in result)) return;
    const lines = result.errors.map(formatError);
    expect(lines.some((line) => line.startsWith('cards/relics.json › broken-relic › keywords: '))).toBe(true);
    expect(lines.some((line) => line.includes('flaw'))).toBe(true);
  });
});
