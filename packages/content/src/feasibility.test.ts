// checkDeckgen (ARCHITECTURE.md §10.3; D-200): on the synthetic fixture, a deck is generated on every test date when the
// constraints allow it, and one §10.3 record reports the dates that fail. Lax and impossible constraints are set here,
// not read from the live globals, so the test holds for any tuning (D-168).
import { describe, expect, it } from 'vitest';
import { KEYWORDS } from '../keywords/index.gen';
import { compileContent } from './compile';
import { checkDeckgen, FEASIBILITY_DATES } from './feasibility';
import { FIXTURE_GLOBALS, fixtureData } from '../test-utils/fixture';

const data = fixtureData();

describe('checkDeckgen (D-200)', () => {
  it('reports nothing when the fixture pool can build a deck on every test date', () => {
    const g = { ...FIXTURE_GLOBALS, DECK_MIN_ELEMENTS: 1, DECK_MIN_KINDS: 1, CURVE_LOW_MIN_COUNT: 0, CURVE_HIGH_MIN_COUNT: 0 };
    expect(checkDeckgen(compileContent(data, KEYWORDS, g), g)).toEqual([]);
  });

  it('reports one record, counting every failing date, when the constraints cannot be met', () => {
    const g = { ...FIXTURE_GLOBALS, DECK_MIN_KINDS: 9, DECKGEN_MAX_ATTEMPTS: 1 };
    const errors = checkDeckgen(compileContent(data, KEYWORDS, g), g);
    expect(errors).toEqual([
      {
        file: 'cards/player-monsters.json',
        id: 'pool',
        field: '',
        problem: `deck constraints unsatisfiable on ${FEASIBILITY_DATES} of ${FEASIBILITY_DATES} test dates`,
        fix: 'relax DECK_MIN_ELEMENTS, DECK_MIN_KINDS or the CURVE_* globals, or add monsters',
      },
    ]);
  });
});
