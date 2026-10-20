// The Levy as a non-blocking beat (D-362): the card marked in your slot, then the gavel, the hand and the arrival.
import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState } from '@vault-duel/engine';
import type { Frame } from '../src/duel/runtime';
import { stagesOf, telegraphOf } from '../src/visual/playback';
import { cueDurationMs, TIMING } from '../src/visual/cues';
import { telegraphLine } from '../src/view/telegraph';

const st = (n: number): GameState => ({ n }) as unknown as GameState;
const frame = (events: GameEvent[]): Frame => ({ action: { t: 'endTurn' }, side: 0, before: st(1), after: st(2), events });
const names = (iid: number): string => (iid === 7 ? 'Kiln Whelp' : '?');

describe('the Levy beat', () => {
  const taken: GameEvent[] = [{ e: 'AppraisalAttempt', round: 3 }, { e: 'Appraised', iid: 7, fromSlot: 1, to: 'board', toSlot: 0 }];
  it('marks the card on the old board first, then plays the act with the plaque still up', () => {
    const [mark, act] = stagesOf([frame(taken)]);
    expect(mark).toMatchObject({ kind: 'telegraph', ms: TIMING.LEVY_MARK_MS, telegraph: { kind: 'levy', target: 7 } });
    expect(mark?.state).toEqual(st(1));
    expect(act?.telegraph).toMatchObject({ kind: 'levy', done: true });
    expect(act?.cues.map((c) => c.kind)).toEqual(['gavel', 'taken', 'arrive']);
    const total = (mark?.ms ?? 0) + (act?.ms ?? 0);
    expect(total).toBeGreaterThanOrEqual(2500);
    expect(total).toBeLessThanOrEqual(3000);
  });
  it('names the card from the content, and says so when nothing qualifies', () => {
    expect(telegraphLine({ kind: 'levy', target: 7 }, names).text).toBe('Levy · takes Kiln Whelp');
    expect(telegraphLine({ kind: 'levy', target: 7, done: true }, names).text).toBe('Levy · took Kiln Whelp');
    const none = frame([{ e: 'AppraisalAttempt', round: 3 }, { e: 'AppraisalFailed', round: 3, reason: 'noTarget' }]);
    expect(telegraphOf(none)).toEqual({ kind: 'levyNone' });
    expect(telegraphLine({ kind: 'levyNone' }, names).text).toBe('Levy · nothing to take');
    expect(cueDurationMs(stagesOf([none])[1]?.cues ?? [])).toBeGreaterThan(0);
  });
  it('does not touch a step without a levy', () => {
    expect(stagesOf([frame([])]).map((s) => s.kind)).toEqual(['act']);
  });
});
