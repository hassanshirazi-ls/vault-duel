import { describe, expect, it } from 'vitest';
import { hashState } from '@vault-duel/engine';
import type { Action, GameEvent } from '@vault-duel/engine';
import { checkpointOf, turnStart, undoStatus, UNDO_WHY } from '../src/view/undo';
import type { ActionRecord } from '../src/view/undo';
import { simplePick, started } from './helpers';

const turnStarted: GameEvent = { e: 'TurnStarted', turn: 1, round: 1, side: 0 };
const rec = (action: Action, events: GameEvent[] = [], collectorTraps = 0): ActionRecord => ({ action, events, collectorTraps });
const keep = rec({ t: 'keep' }, [turnStarted]);
const summon = rec({ t: 'summon', c: 4, mode: 'atk' });
const attack = rec({ t: 'attack', a: 2, target: 9 });

describe('undo checkpoints (D-265)', () => {
  it('a plain action is not a checkpoint', () => {
    expect(checkpointOf(summon)).toBeNull();
    expect(checkpointOf(attack)).toBeNull();
    expect(checkpointOf(rec({ t: 'setTrap', c: 5 }, [], 2))).toBeNull();
  });
  it.each([
    ['Revealed', { e: 'Revealed', iid: 9, side: 1 }, 'revealed'],
    ['TrapTriggered', { e: 'TrapTriggered', side: 1, iid: 7, slot: 0 }, 'trap'],
    ['AttackCancelled', { e: 'AttackCancelled', attacker: 2, by: 7 }, 'trap'],
    ['CardDrawn', { e: 'CardDrawn', side: 0, iid: 3, byEffect: true }, 'drawn'],
    ['Redrawn', { e: 'Redrawn', returned: [1], drawn: [2] }, 'drawn'],
    ['HandDealt', { e: 'HandDealt', side: 0, cards: [1, 2] }, 'drawn'],
  ] as const)('an action whose events include %s is a checkpoint', (_name, event, why) => {
    expect(checkpointOf(rec({ t: 'cast', c: 1, target: -1 }, [event as GameEvent]))).toBe(why);
  });
  it.each(['attack', 'summon', 'summonCovetous', 'cast', 'graftPosition'] as const)('%s while the Collector has a set trap is a checkpoint', (t) => {
    const action = { attack, summon, summonCovetous: rec({ t: 'summonCovetous', c: 1, sac: 2, mode: 'atk' }), cast: rec({ t: 'cast', c: 1, target: 3 }), graftPosition: rec({ t: 'graftPosition', pos: 0 }) }[t].action;
    expect(checkpointOf(rec(action, [], 1))).toBe('trapSet');
    expect(checkpointOf(rec(action, [], 0))).toBeNull();
  });
  it('the mulligan keep and redraw are checkpoints', () => {
    expect(checkpointOf(rec({ t: 'keep' }))).toBe('mulligan');
    expect(checkpointOf(rec({ t: 'redraw' }))).toBe('mulligan');
  });
});

describe('undo status', () => {
  it('has nothing to undo before the first action of the turn', () => {
    expect(undoStatus([])).toEqual({ ok: false, why: 'nothing' });
    expect(undoStatus([keep])).toEqual({ ok: false, why: 'nothing' });
    expect(turnStart([keep])).toBe(1);
  });
  it('removes the last player action only', () => {
    expect(undoStatus([keep, summon])).toEqual({ ok: true, to: 1 });
    expect(undoStatus([keep, summon, attack])).toEqual({ ok: true, to: 2 });
  });
  it('never goes past the start of the current turn', () => {
    const collectorTurn = [rec({ t: 'endTurn' }, [{ e: 'TurnEnded', turn: 1 }, { e: 'TurnStarted', turn: 2, round: 1, side: 1 }]), rec({ t: 'endTurn' }, [turnStarted])];
    const trail = [keep, summon, ...collectorTurn];
    expect(undoStatus(trail)).toEqual({ ok: false, why: 'nothing' });
    expect(undoStatus([...trail, attack])).toEqual({ ok: true, to: trail.length });
  });
  it('is blocked when the last action is a checkpoint, and says why', () => {
    const revealed = rec({ t: 'attack', a: 2, target: 9 }, [{ e: 'Revealed', iid: 9, side: 1 }]);
    expect(undoStatus([keep, summon, revealed])).toEqual({ ok: false, why: 'revealed' });
    expect(UNDO_WHY.revealed).toMatch(/^Can't undo/);
    expect(UNDO_WHY.trap).toBe("Can't undo: a trap was revealed.");
    expect(undoStatus([keep, rec({ t: 'attack', a: 2, target: -1 }, [], 1)])).toEqual({ ok: false, why: 'trapSet' });
  });
  it('an action before a checkpoint stays undoable only down to the checkpoint', () => {
    const revealed = rec({ t: 'attack', a: 2, target: 9 }, [{ e: 'Revealed', iid: 9, side: 1 }]);
    expect(undoStatus([keep, revealed, summon])).toEqual({ ok: true, to: 2 });
    expect(undoStatus([keep, revealed, summon].slice(0, 2))).toEqual({ ok: false, why: 'revealed' });
  });
  it('never offers endTurn', () => {
    expect(undoStatus([keep, summon, rec({ t: 'endTurn' })])).toEqual({ ok: false, why: 'endTurn' });
  });
  it('takes a whole Graft back as one action', () => {
    const graft = [rec({ t: 'graftBegin' }), rec({ t: 'graftPick', m: 1 }), rec({ t: 'graftPick', m: 2 }), rec({ t: 'graftSkipAscend' }), rec({ t: 'graftPosition', pos: 0 }, [{ e: 'Grafted', side: 0, iid: 30, ascended: false } as GameEvent])];
    expect(undoStatus([keep, summon, ...graft])).toEqual({ ok: true, to: 2 });
    expect(undoStatus([keep, summon, ...graft.slice(0, 3)])).toEqual({ ok: true, to: 2 });
    expect(undoStatus([keep, summon, ...graft.slice(0, 2), rec({ t: 'graftCancel' })])).toEqual({ ok: true, to: 2 });
    expect(undoStatus([keep, summon, ...graft.slice(0, 1)])).toEqual({ ok: true, to: 2 });
  });
});

describe('undo through the store', () => {
  it('rebuilds the same state a replay of the shorter log gives, saves it, and the undone action can be played again', async () => {
    let undone = 0;
    for (const date of ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']) {
      const h = await started(date);
      for (let i = 0; i < 400 && h.store.getState().state?.result === null; i++) {
        const before = h.store.getState();
        const status = before.trail.length === before.actions.length ? undoStatus(before.trail) : null;
        expect(before.trail).toHaveLength(before.actions.length);
        if (status?.ok === true && before.state !== null) {
          const hash = hashState(before.state);
          const removed = before.actions.slice(status.to);
          before.undo();
          const after = h.store.getState();
          expect(after.error).toBeNull();
          expect(after.actions).toHaveLength(status.to);
          expect(after.events).toEqual([]);
          expect(after.frames).toEqual([]);
          const replayed = after.rt?.engine.replay(after.state?.seed ?? '', after.actions, { twist: after.setup?.twist ?? -1 });
          expect(hashState(after.state as NonNullable<typeof after.state>)).toBe(hashState(replayed as NonNullable<typeof replayed>));
          // it is still the same turn of the same player
          expect(after.state?.turn).toBe(before.state.turn);
          expect(JSON.parse(h.storage.get(`vd:session:${date}`) ?? '{}').actions).toHaveLength(status.to);
          for (const a of removed) h.store.getState().act(a);
          expect(hashState(h.store.getState().state as NonNullable<typeof after.state>)).toBe(hash);
          undone++;
        }
        h.store.getState().act(simplePick(h.store.getState().legal));
      }
    }
    expect(undone).toBeGreaterThan(5);
  });

  it('refuses at a checkpoint without changing the duel', async () => {
    const h = await started('2026-10-14');
    const s = h.store.getState();
    s.act(s.groups?.keep as Action);
    const before = h.store.getState();
    before.undo(); // nothing to undo yet: only the keep
    expect(h.store.getState().actions).toEqual(before.actions);
    expect(h.store.getState().error).toBe(UNDO_WHY.nothing);
  });
});
