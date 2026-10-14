// Deck-generation feasibility (ARCHITECTURE.md §10.3, §12.3; D-005, D-168, D-200). Runs the shipping generator,
// deckForSeed, on 1,000 consecutive test dates and reports any date whose deck constraints cannot be met. Pure and
// browser-safe: the same seed strings the game uses (seedString + rerollSeed, D-003), no clock and no Node API.
import { deckForSeed, EngineError, rerollSeed, seedString } from '@vault-duel/engine';
import type { CompiledContent, Globals } from '@vault-duel/engine';
import type { ContentError } from './files';

/** The first test date (ISO, UTC). A check parameter, not a rule number (D-200). */
export const FEASIBILITY_START_DATE = '2026-01-01';
/** How many consecutive dates are checked (D-200). A check parameter, not a rule number. */
export const FEASIBILITY_DATES = 1000;

const DAY_MS = 86_400_000;

/** The ISO date `offset` days after `start`, in UTC. */
function isoDateAfter(start: string, offset: number): string {
  const base = Date.parse(`${start}T00:00:00Z`);
  return new Date(base + offset * DAY_MS).toISOString().slice(0, 10);
}

/**
 * One §10.3 error when deckForSeed throws EngineError on any test date, otherwise none. Only EngineError is caught:
 * any other exception is a bug and propagates. Callers skip this check when the pool-capacity rule has failed,
 * because every date would then fail for that same reason (D-200).
 */
export function checkDeckgen(c: CompiledContent, g: Globals): ContentError[] {
  let failing = 0;
  for (let offset = 0; offset < FEASIBILITY_DATES; offset++) {
    const seed = rerollSeed(seedString(g, isoDateAfter(FEASIBILITY_START_DATE, offset)), 0);
    try {
      deckForSeed(c, g, seed);
    } catch (cause) {
      if (cause instanceof EngineError) failing++;
      else throw cause;
    }
  }
  if (failing === 0) return [];
  return [
    {
      file: 'cards/player-monsters.json',
      id: 'pool',
      field: '',
      problem: `deck constraints unsatisfiable on ${failing} of ${FEASIBILITY_DATES} test dates`,
      fix: 'relax DECK_MIN_ELEMENTS, DECK_MIN_KINDS or the CURVE_* globals, or add monsters',
    },
  ];
}
