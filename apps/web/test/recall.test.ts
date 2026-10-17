// Grave Recall (D-339): the engine offers `cast` actions whose target sits in a discard pile. The plan routes those to a
// picker instead of the board, and every pick is one of the legal actions.
import { describe, expect, it } from 'vitest';
import type { Action, GameState } from '@vault-duel/engine';
import { memoryStorage } from '../src/persistence/storage';
import { groupLegal } from '../src/view/legal';
import { planFor } from '../src/view/selection';
import { cuesFromEvents } from '../src/visual/cues';
import { started } from './helpers';

const DATE = '2026-10-20';

describe('discard targets', () => {
  it('lists a Grave Recall cast under the discard picker, not on the board', async () => {
    const h = await started(DATE, memoryStorage());
    h.store.getState().act({ t: 'keep' });
    const { rt, state } = h.store.getState();
    if (rt === null || state === null) throw new Error('no duel');
    const recallDef = rt.ctx.content.index.get('grave-recall') as number;
    expect(recallDef).toBeGreaterThanOrEqual(0);
    // a copy of the real state: one hand card becomes Grave Recall, one deck monster sits in the player's discard
    const s = structuredClone(state) as { -readonly [K in keyof GameState]: GameState[K] } & { inst: { def: number }[]; sides: [{ hand: number[]; deck: number[]; discard: number[] }, unknown] };
    const spell = s.sides[0].hand[0] as number;
    const dead = s.sides[0].deck.find((iid) => rt.ctx.content.playerPool.monsters.includes((s.inst[iid] as { def: number }).def)) as number;
    (s.inst[spell] as { def: number }).def = recallDef;
    s.sides[0].deck = s.sides[0].deck.filter((i) => i !== dead);
    s.sides[0].discard = [...s.sides[0].discard, dead];
    const legal = rt.engine.getLegalActions(s as unknown as GameState);
    const casts = legal.filter((a): a is Extract<Action, { t: 'cast' }> => a.t === 'cast' && a.c === spell);
    expect(casts.map((a) => a.target)).toContain(dead);
    const groups = groupLegal(legal);
    const sel = { t: 'hand', iid: spell, faceDown: false, guard: false } as const;
    // the old call (no discard knowledge) would have put it among the board targets
    expect(planFor(groups, sel).targets.has(dead)).toBe(true);
    const plan = planFor(groups, sel, new Set(s.sides[0].discard));
    expect(plan.targets.has(dead)).toBe(false);
    expect(plan.discard.get(dead)).toEqual(casts.find((a) => a.target === dead));
    expect(plan.anything).toBe(true);
    // picking applies one legal action: the card comes back to the hand
    const picked = plan.discard.get(dead) as Action;
    expect(rt.engine.isLegal(s as unknown as GameState, picked)).toBe(true);
    const r = rt.engine.applyAction(s as unknown as GameState, picked);
    expect((r.state as GameState).sides[0].hand).toContain(dead);
    expect((r.state as GameState).sides[0].discard).not.toContain(dead);
  });
});

describe('Riposte and Ambush cues (D-337, D-338)', () => {
  const mon = (iid: number, pos: 0 | 1, faceDown = false) => ({ iid, pos, faceDown }) as unknown as NonNullable<GameState['sides'][0]['board'][number]>;
  const before = { sides: [{ board: [mon(1, 0), null, null] }, { board: [mon(2, 1), mon(3, 0), mon(4, 0, true)] }] } as unknown as GameState;
  const resolved = (defender: number, destroyed: number[]) => ({ e: 'CombatResolved' as const, attacker: 1, defender, aP: 3, dStat: 5, advantage: false, pierce: false, brittle: false, destroyed });
  it('flashes the guard that destroyed the attacker, and only a guard', () => {
    expect(cuesFromEvents([resolved(2, [1])], before).map((c) => c.kind)).toEqual(['riposte']);
    expect(cuesFromEvents([resolved(4, [1])], before).map((c) => c.kind)).toEqual(['riposte']);
    // the defender in attack position won an ordinary fight, a trade and an ordinary win are not Ripostes
    expect(cuesFromEvents([resolved(3, [1])], before).map((c) => c.kind)).toEqual(['hit']);
    expect(cuesFromEvents([resolved(2, [1, 2])], before).map((c) => c.kind)).toEqual(['hit']);
    expect(cuesFromEvents([resolved(2, [2])], before).map((c) => c.kind)).toEqual(['hit']);
  });
  it('springs the Ambush bonus on the monster', () => {
    const cues = cuesFromEvents([{ e: 'Revealed', iid: 4, side: 0 }, { e: 'Repositioned', iid: 4, pos: 0 }, { e: 'Ambushed', iid: 4, p: 2 }]);
    expect(cues).toEqual([{ kind: 'ambush', iid: 4, amount: 2, beat: 0 }]);
  });
});
