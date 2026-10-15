import { describe, expect, it } from 'vitest';
import { RoundFlag } from '@vault-duel/engine';
import type { Track } from '@vault-duel/engine';
import * as content from '@vault-duel/content';
import { loadGameContent } from '../src/content/load';
import { parseOverrides } from '../src/content/overrides';
import { buildMonth, monthOf, shiftMonth } from '../src/meta/calendar';
import { familyCells } from '../src/meta/chimera';
import { addDays, streaks, summarize } from '../src/meta/stats';
import { BINDER_KEY, emptyBinder, emptyStats, loadBinder, loadStats, recordDaily, STATS_KEY } from '../src/persistence/meta';
import type { DayRecord } from '../src/persistence/meta';
import { memoryStorage } from '../src/persistence/storage';
import { practiceKey, sessionKey } from '../src/daily/session';
import { roundRow } from '../src/view/roundRow';
import { sendShare, shareText } from '../src/view/share';
import { makeStore, simplePick, started } from './helpers';

const win = (rounds = 6, stars = 2): DayRecord => ({ won: true, rounds, par: 6, life: 12, stars });
const loss = (): DayRecord => ({ won: false, rounds: 12, par: 6, life: 0, stars: 0 });
const out = (date: string, day: DayRecord, families: string[] = []) => ({ date, day, signature: 'sig-' + date, families });

describe('recording the daily result', () => {
  it('writes stats and a won day adds its signature to the Binder', () => {
    const kv = memoryStorage();
    const r = recordDaily(kv, out('2026-10-14', win()));
    expect(r.fresh).toBe(true);
    expect(loadStats(kv).days['2026-10-14']).toEqual(win());
    expect(loadBinder(kv).signatures).toEqual({ '2026-10-14': 'sig-2026-10-14' });
  });

  it('a loss records the day but adds no signature; a family counts on a loss too', () => {
    const kv = memoryStorage();
    const r = recordDaily(kv, out('2026-10-14', loss(), ['packmaw']));
    expect(loadStats(kv).days['2026-10-14']?.won).toBe(false);
    expect(loadBinder(kv).signatures).toEqual({});
    expect(loadBinder(kv).families).toEqual({ packmaw: '2026-10-14' });
    expect(r.newFamilies).toEqual(['packmaw']);
  });

  it('is idempotent per date: a second record of the day changes nothing', () => {
    const kv = memoryStorage();
    recordDaily(kv, out('2026-10-14', win(), ['packmaw']));
    const before = [...kv.data.entries()];
    const again = recordDaily(kv, out('2026-10-14', loss(), ['clockwork-wyrm']));
    expect(again.fresh).toBe(false);
    expect([...kv.data.entries()]).toEqual(before);
  });

  it('keeps the first discovery date of a family', () => {
    const kv = memoryStorage();
    recordDaily(kv, out('2026-10-14', win(), ['packmaw', 'packmaw']));
    const r = recordDaily(kv, out('2026-10-15', win(), ['packmaw', 'clockwork-wyrm']));
    expect(r.newFamilies).toEqual(['clockwork-wyrm']);
    expect(loadBinder(kv).families).toEqual({ packmaw: '2026-10-14', 'clockwork-wyrm': '2026-10-15' });
  });
});

describe('stored records are migration-safe', () => {
  it('corrupt or missing text reads as empty', () => {
    const kv = memoryStorage();
    expect(loadStats(kv)).toEqual(emptyStats());
    kv.set(STATS_KEY, '{nope');
    kv.set(BINDER_KEY, '[1,2]');
    expect(loadStats(kv)).toEqual(emptyStats());
    expect(loadBinder(kv)).toEqual(emptyBinder());
  });

  it('drops malformed entries and keeps the good ones', () => {
    const kv = memoryStorage();
    kv.set(STATS_KEY, JSON.stringify({ v: 1, days: { '2026-10-01': win(), 'bad-date': win(), '2026-10-02': { won: 'yes' }, '2026-10-03': { ...win(), rounds: 0 } } }));
    kv.set(BINDER_KEY, JSON.stringify({ v: 1, signatures: { '2026-10-01': 'a', x: 'b', '2026-10-02': 5 }, families: { packmaw: '2026-10-01', gone: 'never' } }));
    expect(Object.keys(loadStats(kv).days)).toEqual(['2026-10-01']);
    expect(loadBinder(kv)).toEqual({ v: 1, signatures: { '2026-10-01': 'a' }, families: { packmaw: '2026-10-01' } });
  });

  it('never overwrites a record written by a newer build', () => {
    const kv = memoryStorage();
    const future = JSON.stringify({ v: 2, days: { '2026-10-01': win() }, extra: true });
    kv.set(STATS_KEY, future);
    kv.set(BINDER_KEY, JSON.stringify({ v: 2, signatures: {}, families: {} }));
    expect(loadStats(kv)).toEqual(emptyStats());
    recordDaily(kv, out('2026-10-14', win()));
    expect(kv.get(STATS_KEY)).toBe(future);
  });
});

describe('streaks (D-248)', () => {
  const days = (entries: [string, DayRecord][]): Record<string, DayRecord> => Object.fromEntries(entries);
  it('counts consecutive winning days ending today, or yesterday while today is unplayed', () => {
    const d = days([['2026-10-12', win()], ['2026-10-13', win()], ['2026-10-14', win()]]);
    expect(streaks(d, '2026-10-14')).toEqual({ current: 3, best: 3 });
    expect(streaks(d, '2026-10-15')).toEqual({ current: 3, best: 3 }); // today not played yet
    expect(streaks(d, '2026-10-16')).toEqual({ current: 0, best: 3 }); // a missed day ended it
  });
  it('a loss ends the streak, and an earlier best survives', () => {
    const d = days([['2026-10-10', win()], ['2026-10-11', win()], ['2026-10-12', loss()], ['2026-10-13', win()]]);
    expect(streaks(d, '2026-10-13')).toEqual({ current: 1, best: 2 });
    expect(streaks({ ...d, '2026-10-14': loss() }, '2026-10-14')).toEqual({ current: 0, best: 2 });
  });
  it('crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    const d = days([['2026-12-31', win()], ['2027-01-01', win()]]);
    expect(streaks(d, '2027-01-01').current).toBe(2);
  });
  it('summarizes played, won, rate, stars and the rounds chart', () => {
    const d = days([['2026-10-12', win(5, 3)], ['2026-10-13', win(8, 1)], ['2026-10-14', loss()]]);
    const s = summarize(d, '2026-10-14', 12);
    expect(s).toMatchObject({ played: 3, won: 2, winPct: 67, stars: 4, lost: 1, avgVsPar: 0.5, current: 0, best: 2 });
    expect(s.byRounds[5]).toBe(1);
    expect(s.byRounds[8]).toBe(1);
    expect(summarize({}, '2026-10-14', 12)).toMatchObject({ played: 0, winPct: 0, avgVsPar: null, current: 0 });
  });
});

describe('Binder helpers', () => {
  it('lays out a month Monday-first', () => {
    const oct = buildMonth(2026, 10); // 1 Oct 2026 is a Thursday
    expect(oct.lead).toBe(3);
    expect(oct.days).toHaveLength(31);
    expect(oct.days[0]?.date).toBe('2026-10-01');
    expect(buildMonth(2028, 2).days).toHaveLength(29);
    expect(shiftMonth(monthOf('2026-01-15'), -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });
  it('builds the kind-pair triangle from content: 15 cells for 5 kinds, each with a recipe', () => {
    const loaded = loadGameContent(content);
    if (!loaded.ok) throw new Error(loaded.lines.join('\n'));
    const n = loaded.ctx.kindOrder.length;
    const cells = familyCells(loaded.ctx);
    expect(cells).toHaveLength((n * (n + 1)) / 2);
    expect(cells.every((c) => c.recipe !== null)).toBe(true);
    expect(new Set(cells.map((c) => c.recipe?.id)).size).toBe(cells.length);
  });
  it('parses dev overrides', () => {
    expect(parseOverrides('?set=PLAYER_LIFE=18&set=FLAGS.ASCEND=false&x=1')).toEqual(['PLAYER_LIFE=18', 'FLAGS.ASCEND=false']);
    expect(parseOverrides('?debug')).toEqual(['FLAGS.DEBUG_OVERLAY=true']);
    expect(parseOverrides('')).toEqual([]);
  });
  it('applies overrides to the loaded globals and reports bad ones', () => {
    const ok = loadGameContent(content, ['PLAYER_LIFE=18']);
    expect(ok.ok && ok.ctx.globals.PLAYER_LIFE).toBe(18);
    expect(ok.ok && ok.ctx.overrides).toEqual(['PLAYER_LIFE=18']);
    const bad = loadGameContent(content, ['NOT_A_GLOBAL=1']);
    expect(bad.ok).toBe(false);
  });
});

describe('share text', () => {
  const track: Track = { round: [RoundFlag.Attacked, RoundFlag.Grafted, 0, RoundFlag.Appraised, 0, 0, 0, 0, 0, 0, 0, 0], grafts: 1, families: [], unpriced: false, appraisedLost: 0 };
  it('builds the round row, rounds against par, life and stars', () => {
    const row = roundRow(track, 4).join('');
    const text = shareText({ date: '2026-10-15', won: true, rounds: 4, par: 6, life: 9, stars: 2, starsMax: 3, row, url: 'https://example.test/' });
    expect(text).toBe(`Vault Duel 2026-10-15 · Acquired\n4 rounds (par 6) · Life 9 · ★★☆\n${row}\nhttps://example.test/`);
    expect(row).toBe('⚔️🧬🛡️🔨');
  });
  it('a loss says Sealed and never shows negative life', () => {
    const text = shareText({ date: 'd', won: false, rounds: 12, par: 6, life: -3, stars: 0, starsMax: 3, row: '', url: 'u' });
    expect(text).toContain('Sealed');
    expect(text).toContain('Life 0');
    expect(text).toContain('☆☆☆');
    expect(text).toContain('12 rounds (par 6)');
  });
  it('uses the Web Share API, falls back to the clipboard, and treats a cancelled sheet as no error', async () => {
    const calls: string[] = [];
    expect(await sendShare('t', { share: () => (calls.push('share'), Promise.resolve()), copy: () => (calls.push('copy'), Promise.resolve()) })).toBe('shared');
    expect(await sendShare('t', { copy: () => (calls.push('copy'), Promise.resolve()) })).toBe('copied');
    expect(await sendShare('t', { share: () => Promise.reject(new DOMException('x', 'AbortError')), copy: () => (calls.push('copy2'), Promise.resolve()) })).toBe('cancelled');
    expect(await sendShare('t', { share: () => Promise.reject(new Error('nope')), copy: () => (calls.push('copy3'), Promise.resolve()) })).toBe('copied');
    expect(await sendShare('t', { copy: () => Promise.reject(new Error('denied')) })).toBe('failed');
    expect(await sendShare('t', {})).toBe('failed');
    expect(calls).toEqual(['share', 'copy', 'copy3']);
  });
});

const DATE = '2026-10-14';
async function playOut(h: Awaited<ReturnType<typeof started>>): Promise<void> {
  for (let n = 0; h.store.getState().state?.result === null && n < 600; n++) h.store.getState().act(simplePick(h.store.getState().legal));
  expect(h.store.getState().state?.result).not.toBeNull();
}

describe('the store records the daily and never records Practice (D-247)', () => {
  it('records the finished daily once, and a reload shows the same ledger', async () => {
    const h = await started(DATE);
    expect(h.store.getState().dailyDone).toBe(false);
    await playOut(h);
    const s = h.store.getState();
    expect(s.dailyDone).toBe(true);
    expect(Object.keys(s.stats.days)).toEqual([DATE]);
    const day = s.stats.days[DATE] as DayRecord;
    expect(day.won).toBe(s.state?.result?.winner === 0);
    expect(Object.keys(s.binder.signatures)).toEqual(day.won ? [DATE] : []);
    const fresh = makeStore(DATE, h.storage);
    await fresh.store.getState().boot();
    expect(fresh.store.getState().stats).toEqual(s.stats);
    expect(fresh.store.getState().phase.name).toBe('result');
  });

  it('Practice is locked until the daily is over', async () => {
    const h = await started(DATE);
    h.store.getState().startPractice();
    expect(h.store.getState().mode).toBe('daily');
  });

  it('a whole Practice duel writes no stats, Binder or daily session; leaving restores the daily Result', async () => {
    const h = await started(DATE);
    await playOut(h);
    const daily = h.store.getState();
    const snapshot = (): [string, string][] => [...h.storage.data.entries()].filter(([k]) => k !== practiceKey(DATE)).sort();
    const before = snapshot();
    h.store.getState().startPractice();
    expect(h.store.getState().mode).toBe('practice');
    expect(h.store.getState().phase.name).toBe('duel');
    await playOut(h);
    expect(h.store.getState().mode).toBe('practice');
    expect(snapshot()).toEqual(before);
    expect(h.storage.data.get(sessionKey(DATE))).toBe(before.find(([k]) => k === sessionKey(DATE))?.[1]);
    expect(h.store.getState().stats).toEqual(daily.stats);
    h.store.getState().leavePractice();
    const s = h.store.getState();
    expect(s.mode).toBe('daily');
    expect(s.state).toBe(daily.state);
    expect(s.phase.name).toBe('result');
    expect(h.storage.get(practiceKey(DATE))).toBeNull();
  });

  it('a Practice duel in progress resumes after a reload, on top of the finished daily', async () => {
    const h = await started(DATE);
    await playOut(h);
    h.store.getState().startPractice();
    for (let i = 0; i < 6; i++) h.store.getState().act(simplePick(h.store.getState().legal));
    const n = h.store.getState().actions.length;
    const fresh = makeStore(DATE, h.storage);
    await fresh.store.getState().boot();
    const s = fresh.store.getState();
    expect(s.mode).toBe('practice');
    expect(s.actions).toHaveLength(n);
    expect(s.daily?.state?.result).not.toBeNull();
    s.leavePractice();
    expect(fresh.store.getState().phase.name).toBe('result');
  });
});
