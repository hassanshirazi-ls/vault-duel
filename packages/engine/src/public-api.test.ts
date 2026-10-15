// The public turn helpers and the signature pick (D-010) agree with the internals they expose.
import { describe, expect, it } from 'vitest';
import { DC, DUEL_GLOBALS, duelEngine } from '../test-utils/duel-fixture';
import { activeSide, deckForSeed, pickSignature, rerollSeed, roundOf, seedString, Sfc32, signatureForSeed } from './index';
import type { GameState } from './index';
import { stream } from './setup/seed';

describe('public turn helpers', () => {
  it('roundOf and activeSide follow the turn index', () => {
    const base = duelEngine().newGame(rerollSeed(seedString(DUEL_GLOBALS, '2026-10-14'), 0)).state;
    for (let turn = 0; turn < 12; turn++) {
      const s: GameState = { ...base, turn };
      expect(roundOf(s)).toBe(Math.floor(turn / 2) + 1);
      expect(activeSide(s)).toBe(turn % 2);
    }
  });
});

describe('public signature pick', () => {
  it('signatureForSeed is pickSignature on the seed signature stream', () => {
    for (const day of ['2026-10-14', '2026-10-15', '2026-11-01']) {
      const seed = rerollSeed(seedString(DUEL_GLOBALS, day), 0);
      const deck = deckForSeed(DC, DUEL_GLOBALS, seed);
      expect(signatureForSeed(DC, deck, seed)).toBe(pickSignature(DC, deck, stream(seed, 'signature')));
      expect(signatureForSeed(DC, deck, seed)).toBe(pickSignature(DC, deck, Sfc32.from(`${seed}/signature`)));
    }
  });
});
