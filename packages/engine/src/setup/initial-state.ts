// Initial state (ARCHITECTURE.md §5.1, §12; D-006, D-007, D-008, D-161). `buildInitialState` is pure:
// the deck list, both shuffles and the opening hands come from the seed's streams. The result is in
// `step: 'mulligan'` at turn 0; skipping the mulligan when FLAGS.REDRAW is off is the engine facade's job
// (it runs the same start-of-round-1 code as the `keep` action).
import type { Env } from '../hooks/registry';
import { moodOf } from '../mood';
import { emptyTrack } from '../track';
import { DefType } from '../types/content';
import type { DefIdx } from '../types/content';
import type { GameEvent } from '../types/events';
import type { GameState, Iid, Instance, SideState } from '../types/state';
import { generateDeck, sortDeckList } from './deckgen';
import { configHash, stream } from './seed';
import { shuffleDeck, windowsFor } from './shuffle';

export interface NewGameOptions {
  /** weekly twist index or -1 (D-103: chosen outside the engine from the ISO week) */
  readonly twist?: number;
  /** a prepared player deck list (e.g. from DailySetup); generated from the seed's 'deck' stream when absent */
  readonly deck?: readonly DefIdx[];
}

export interface InitialSetup {
  readonly state: GameState;
  readonly events: GameEvent[];
}

/** `seed` is the full seed string including `#k` (D-003). */
export function buildInitialState(env: Env, seed: string, opts: NewGameOptions = {}): InitialSetup {
  const { c, g } = env;
  const list = opts.deck === undefined ? generateDeck(c, g, stream(seed, 'deck')) : sortDeckList(c, opts.deck);

  // D-006: player cards get iids 0..n-1 in deck-list order; Collector cards follow in collector.json order.
  const inst: Instance[] = [];
  for (const def of list) inst.push({ def, owner: 0, chimera: null });
  const nPlayer = inst.length;
  for (const def of c.collector.deck) inst.push({ def, owner: 1, chimera: null });

  const isMonster = (iid: Iid): boolean => {
    const t = c.type[inst[iid]?.def ?? 0];
    return t === DefType.Monster || t === DefType.Family;
  };
  const range = (from: number, to: number): Iid[] => Array.from({ length: to - from }, (_, i) => from + i);
  const p = shuffleDeck(range(0, nPlayer), isMonster, g, windowsFor(g, true), stream(seed, 'shuffle-player'));
  const col = shuffleDeck(range(nPlayer, inst.length), isMonster, g, windowsFor(g, false), stream(seed, 'shuffle-collector'));

  const side = (life: number, order: readonly Iid[]): SideState => ({
    life,
    deck: order.slice(g.OPENING_HAND),
    hand: order.slice(0, g.OPENING_HAND),
    discard: [],
    board: Array.from({ length: g.BOARD_SLOTS }, () => null),
    traps: Array.from({ length: g.TRAP_SLOTS }, () => null),
    vault: [],
  });
  const sides: [SideState, SideState] = [side(g.PLAYER_LIFE, p), side(g.COLLECTOR_LIFE, col)];

  const state: GameState = {
    v: 1,
    cfg: configHash(c, g),
    seed,
    rng: stream(seed, 'engine').state(),
    turn: 0,
    step: 'mulligan',
    played: false,
    redrawsLeft: g.FLAGS.REDRAW ? g.REDRAWS : 0,
    pending: null,
    sides,
    inst,
    appraisal: { attempts: 0, successes: 0, taken: [] },
    collector: { mood: moodOf(sides[1].life, g), intent: null }, // D-161: only setup and lifeChanged write the mood
    twist: opts.twist ?? -1,
    track: emptyTrack(g),
    result: null,
    log: null,
    nActions: 0,
  };
  const events: GameEvent[] = [
    { e: 'GameStarted', seed },
    { e: 'HandDealt', side: 0, cards: sides[0].hand },
    { e: 'HandDealt', side: 1, cards: sides[1].hand },
  ];
  return { state, events };
}
