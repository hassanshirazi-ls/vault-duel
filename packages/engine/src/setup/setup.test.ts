import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DC, DUEL_GLOBALS, duelEngine } from '../../test-utils/duel-fixture';
import { withGlobals } from '../../test-utils/globals';
import { EngineError } from '../errors';
import { createEnv } from '../hooks/registry';
import { Sfc32 } from '../rng';
import { compileTraps } from '../traps';
import { DefType } from '../types/content';
import type { Iid } from '../types/state';
import { generateDeck, monstersAcceptable, pickWithCap, sortDeckList } from './deckgen';
import { buildInitialState } from './initial-state';
import { configHash, rerollSeed, seedString, stream, STREAM_PURPOSES } from './seed';
import { shuffleDeck, windowsFor } from './shuffle';
import { pickSignature } from './signature';

const g = DUEL_GLOBALS;
const env = createEnv(DC, g, compileTraps(DC), true);
const SEED = rerollSeed(seedString(g, '2026-10-14'), 0);

describe('seed strings and streams (§12.2, D-001 to D-003)', () => {
  it('seedString and rerollSeed follow D-001 and D-003', () => {
    expect(seedString({ SEED_PREFIX: 'p', CONTENT_VERSION: 'v' }, '2026-10-14')).toBe('p:2026-10-14:v');
    expect(rerollSeed('a:b:c', 0)).toBe('a:b:c#0');
    expect(rerollSeed('a:b:c', 7)).toBe('a:b:c#7');
  });
  it('streams are deterministic per (seed, purpose) and independent across purposes and rerolls', () => {
    const first = (seed: string, p: (typeof STREAM_PURPOSES)[number]): number => stream(seed, p).next();
    expect(first(SEED, 'deck')).toBe(first(SEED, 'deck'));
    const firsts = STREAM_PURPOSES.map((p) => first(SEED, p));
    expect(new Set(firsts).size).toBe(STREAM_PURPOSES.length);
    expect(first(rerollSeed('x', 0), 'deck')).not.toBe(first(rerollSeed('x', 1), 'deck'));
  });
  it('configHash depends on content hash and on every global', () => {
    const a = configHash(DC, g);
    expect(configHash(DC, g)).toBe(a);
    expect(configHash(DC, withGlobals({ DECK_MIN_KINDS: 2, APPRAISAL_MIN_POWER: 6 }))).not.toBe(a);
    expect(configHash(DC, withGlobals({ DECK_MIN_KINDS: 2, APPRAISAL_MIN_POWER: 5, FLAGS: { ASCEND: false } }))).not.toBe(a);
    expect(configHash({ hash: 'other' }, g)).not.toBe(a);
  });
});

describe('deck generation (§12.3, D-005, D-006)', () => {
  const deck = generateDeck(DC, g, stream(SEED, 'deck'));
  it('has the right composition, respects MAX_COPIES, and is sorted by (type, element, kind, id)', () => {
    expect(deck).toHaveLength(g.DECK_MONSTERS + g.DECK_SPELLS + g.DECK_TRAPS);
    const count = (t: number): number => deck.filter((d) => DC.type[d] === t).length;
    expect([count(DefType.Monster), count(DefType.Spell), count(DefType.Trap)]).toEqual([15, 5, 4]);
    for (const d of deck) expect(deck.filter((x) => x === d).length).toBeLessThanOrEqual(g.MAX_COPIES);
    expect(sortDeckList(DC, deck)).toEqual(deck);
    expect(monstersAcceptable(DC, g, deck.filter((d) => DC.type[d] === DefType.Monster))).toBe(true);
  });
  it('is deterministic for a seed and differs across rerolls', () => {
    expect(generateDeck(DC, g, stream(SEED, 'deck'))).toEqual(deck);
    const other = generateDeck(DC, g, stream(rerollSeed(seedString(g, '2026-10-14'), 1), 'deck'));
    expect(other).not.toEqual(deck);
  });
  it('rejects and retries, then throws EngineError when no attempt passes', () => {
    const never = withGlobals({ DECK_MIN_KINDS: 9, DECKGEN_MAX_ATTEMPTS: 5 });
    expect(() => generateDeck(DC, never, stream(SEED, 'deck'))).toThrow(EngineError);
  });
  it('pickWithCap: uniform among open entries; throws when the pool cannot supply n cards', () => {
    const rng = Sfc32.from('t');
    const picks = pickWithCap([10, 11, 12], 6, 2, rng);
    expect([10, 11, 12].map((d) => picks.filter((x) => x === d).length)).toEqual([2, 2, 2]);
    expect(() => pickWithCap([10, 11], 5, 2, Sfc32.from('t'))).toThrow(EngineError);
  });
  it('sortDeckList orders by type, then element, kind, id (code-unit order)', () => {
    const i = (id: string): number => DC.index.get(id) as number;
    const sorted = sortDeckList(DC, [i('fx-snare'), i('fx-tide-sprite'), i('fx-ember-whelp'), i('fx-bolt'), i('fx-ember-twin')]);
    expect(sorted.map((d) => DC.ids[d])).toEqual(['fx-ember-twin', 'fx-ember-whelp', 'fx-tide-sprite', 'fx-bolt', 'fx-snare']);
  });
});

describe('shuffles and the opening-hand guarantee (§12.4, D-007, D-008)', () => {
  const cards: Iid[] = Array.from({ length: 24 }, (_, i) => i);
  const isMonster = (iid: Iid): boolean => iid < 15;
  const monstersIn = (o: readonly Iid[], lo: number, hi: number): number => o.slice(lo, hi).filter(isMonster).length;

  it('every opening window has >= OPENING_MIN_MONSTERS monsters; windows = 1 + REDRAWS for the player', () => {
    expect(windowsFor(g, true)).toBe(2);
    expect(windowsFor(g, false)).toBe(1);
    expect(windowsFor(withGlobals({ FLAGS: { REDRAW: false } }), true)).toBe(1);
    fc.assert(
      fc.property(fc.string(), (s) => {
        const o = shuffleDeck(cards, isMonster, g, 2, Sfc32.from(s));
        expect([...o].sort((a, b) => a - b)).toEqual(cards);
        expect(monstersIn(o, 0, 5)).toBeGreaterThanOrEqual(2);
        expect(monstersIn(o, 5, 10)).toBeGreaterThanOrEqual(2);
      }),
      { numRuns: 60 },
    );
  });
  it('deterministic repair when the attempts run out: swap the leftmost non-monster with the first monster after the windows', () => {
    const none = withGlobals({ SHUFFLE_MAX_ATTEMPTS: 0 });
    // 24 cards, monsters are iids >= 14, so the unshuffled order starts with no monsters at all
    const rev = (iid: Iid): boolean => iid >= 14;
    const o = shuffleDeck(cards, rev, none, 2, Sfc32.from('x'));
    // window 0: slots 0 and 1 swap with the first monsters after the windows (14, 15); window 1: slots 5 and 6 (16, 17)
    expect(o).toEqual([14, 15, 2, 3, 4, 16, 17, 7, 8, 9, 10, 11, 12, 13, 0, 1, 5, 6, 18, 19, 20, 21, 22, 23]);
    expect(shuffleDeck(cards, rev, none, 2, Sfc32.from('y'))).toEqual(o); // no randomness involved
  });
  it('throws EngineError when there are not enough monsters', () => {
    expect(() => shuffleDeck([0, 1, 2, 3, 4, 5, 6], () => false, withGlobals({ SHUFFLE_MAX_ATTEMPTS: 2 }), 1, Sfc32.from('z'))).toThrow(EngineError);
  });
});

describe('initial state (§5.1, D-006, D-161)', () => {
  const { state: s, events } = buildInitialState(env, SEED);
  it('is a mulligan-step state with 5 cards in each hand and conservation holds', () => {
    expect(s).toMatchObject({ v: 1, seed: SEED, turn: 0, step: 'mulligan', played: false, redrawsLeft: 1, pending: null, result: null, log: null, nActions: 0, twist: -1 });
    expect(s.sides[0].hand).toHaveLength(5);
    expect(s.sides[1].hand).toHaveLength(5);
    expect(s.sides[0].deck).toHaveLength(19);
    expect(s.sides[1].deck).toHaveLength(15);
    expect(s.sides[0].life).toBe(20);
    expect(s.sides[1].life).toBe(25);
    expect(s.track.round).toEqual(new Array(12).fill(0));
    const all = [...s.sides[0].hand, ...s.sides[0].deck, ...s.sides[1].hand, ...s.sides[1].deck].sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 44 }, (_, i) => i));
  });
  it('player iids 0..23 follow the sorted deck list, Collector iids 24..43 follow collector.json order (D-006)', () => {
    expect(s.inst.slice(0, 24).map((i) => i.def)).toEqual(generateDeck(DC, g, stream(SEED, 'deck')));
    expect(s.inst.slice(24).map((i) => i.def)).toEqual(DC.collector.deck);
    expect(s.inst.every((i, n) => i.owner === (n < 24 ? 0 : 1) && i.chimera === null)).toBe(true);
  });
  it('opening hands and the redraw window hold >= 2 monsters (player), opening hand >= 2 (Collector)', () => {
    const isM = (iid: Iid): boolean => DC.type[s.inst[iid]?.def ?? 0] === DefType.Monster;
    expect(s.sides[0].hand.filter(isM).length).toBeGreaterThanOrEqual(2);
    expect(s.sides[0].deck.slice(0, 5).filter(isM).length).toBeGreaterThanOrEqual(2);
    expect(s.sides[1].hand.filter(isM).length).toBeGreaterThanOrEqual(2);
  });
  it('sets the Collector mood from his life and no intent (D-161)', () => {
    expect(s.collector).toEqual({ mood: 0, intent: null });
    const low = buildInitialState(createEnv(DC, withGlobals({ DECK_MIN_KINDS: 2, COLLECTOR_LIFE: 7 }), compileTraps(DC), true), SEED);
    expect(low.state.collector.mood).toBe(2);
    const off = buildInitialState(createEnv(DC, withGlobals({ DECK_MIN_KINDS: 2, COLLECTOR_LIFE: 7, FLAGS: { MOODS: false } }), compileTraps(DC), true), SEED);
    expect(off.state.collector.mood).toBe(0);
  });
  it('emits GameStarted and one HandDealt per side; no redraw when FLAGS.REDRAW is off', () => {
    expect(events).toEqual([
      { e: 'GameStarted', seed: SEED },
      { e: 'HandDealt', side: 0, cards: s.sides[0].hand },
      { e: 'HandDealt', side: 1, cards: s.sides[1].hand },
    ]);
    const noRedraw = buildInitialState(createEnv(DC, withGlobals({ DECK_MIN_KINDS: 2, FLAGS: { REDRAW: false } }), compileTraps(DC), true), SEED);
    expect(noRedraw.state.redrawsLeft).toBe(0);
  });
  it('is deterministic, takes a twist and a prepared deck', () => {
    expect(buildInitialState(env, SEED).state).toEqual(s);
    expect(buildInitialState(env, SEED, { twist: 3 }).state.twist).toBe(3);
    const list = generateDeck(DC, g, stream(rerollSeed('q', 0), 'deck'));
    const prepared = buildInitialState(env, SEED, { deck: list.slice().reverse() });
    expect(prepared.state.inst.slice(0, 24).map((i) => i.def)).toEqual(list);
  });
});

describe('signature card (§12.5, D-010)', () => {
  it('is a distinct monster of the deck, deterministic per seed', () => {
    const deck = generateDeck(DC, g, stream(SEED, 'deck'));
    const sig = pickSignature(DC, deck, stream(SEED, 'signature'));
    expect(deck).toContain(sig);
    expect(DC.type[sig]).toBe(DefType.Monster);
    expect(pickSignature(DC, deck, stream(SEED, 'signature'))).toBe(sig);
  });
  it('throws without a monster', () => {
    expect(() => pickSignature(DC, [DC.index.get('fx-bolt') as number], Sfc32.from('s'))).toThrow(EngineError);
  });
});

describe('engine newGame uses the same setup', () => {
  it('state from the facade equals buildInitialState (dev freeze aside)', () => {
    const e = duelEngine();
    expect(e.newGame(SEED).state).toEqual(buildInitialState(e.env, SEED).state);
  });
});
