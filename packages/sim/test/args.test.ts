// CLI argument parsing (ARCHITECTURE.md §15). No test pins a global's value.
import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBALS, OverridesError, withOverrides } from '@vault-duel/content';
import { addDays, dateRange, parseArgs, UsageError } from '../src/args';

describe('parseArgs', () => {
  it('reads every flag of quick', () => {
    const o = parseArgs(['quick', '--games', '50', '--from', '2026-02-27', '--bots', 'expert,novice', '--set', 'PLAYER_LIFE=18', '--set=FLAGS.ASCEND=false', '--workers', '2', '--out', 'x']);
    expect(o).toMatchObject({ command: 'quick', games: 50, from: '2026-02-27', bots: ['expert', 'novice'], sets: ['PLAYER_LIFE=18', 'FLAGS.ASCEND=false'], workers: 2, out: 'x' });
  });

  it('leaves counts undefined so the globals can supply them', () => {
    const o = parseArgs(['full']);
    expect(o.games).toBeUndefined();
    expect(o.seedDates).toBeUndefined();
    expect(o.from).toBeUndefined();
    expect(o.bots).toEqual(['expert', 'novice']);
  });

  it('takes the date of sim seed as a positional argument', () => {
    expect(parseArgs(['seed', '2026-03-01', '--set', 'BOT_NOISE_EPSILON=0.2'])).toMatchObject({ command: 'seed', date: '2026-03-01', sets: ['BOT_NOISE_EPSILON=0.2'] });
  });

  it('keeps --ab so the CLI can refuse it', () => {
    expect(parseArgs(['full', '--ab', 'M-03']).ab).toBe('M-03');
  });

  it.each([
    [[], 'missing command'],
    [['bogus'], 'unknown command'],
    [['quick', '--games', '0'], '--games'],
    [['quick', '--games', 'abc'], '--games'],
    [['quick', '--from', '2026-02-30'], '--from'],
    [['quick', '--bots', 'wizard'], 'unknown bot'],
    [['quick', '--wat', '1'], 'unknown flag'],
    [['quick', '--games'], 'needs a value'],
    [['quick', '2026-01-01'], 'unexpected argument'],
    [['seed'], 'needs a date'],
    [['seed', '2026-13-01'], 'needs a date'],
    [['quick', '--ab', 'M-03'], '--ab'],
  ])('rejects %j', (argv, text) => {
    expect(() => parseArgs(argv)).toThrow(UsageError);
    expect(() => parseArgs(argv)).toThrow(text);
  });
});

describe('--set values go through the globals schema', () => {
  it('accepts a valid override and refuses an unknown key and a bad value', () => {
    expect(withOverrides(DEFAULT_GLOBALS, ['SIM_QUICK_GAMES=7']).SIM_QUICK_GAMES).toBe(7);
    expect(() => withOverrides(DEFAULT_GLOBALS, ['NOT_A_GLOBAL=1'])).toThrow(OverridesError);
    expect(() => withOverrides(DEFAULT_GLOBALS, ['SIM_QUICK_GAMES=lots'])).toThrow(OverridesError);
  });
});

describe('dates', () => {
  it('counts across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dateRange('2028-02-28', 3)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });
});
