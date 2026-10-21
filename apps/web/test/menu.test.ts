import { describe, expect, it } from 'vitest';
import { hashState } from '@vault-duel/engine';
import type { Action } from '@vault-duel/engine';
import { practiceKey, sessionKey } from '../src/daily/session';
import { duelLog } from '../src/view/log';
import { blockedAt, stagesOf, telegraphOf } from '../src/visual/playback';
import { TIMING } from '../src/visual/cues';
import { makeStore, simplePick, started } from './helpers';

const DATE = '2026-10-14';

async function playOut(h: Awaited<ReturnType<typeof started>>, cap = 600): Promise<void> {
  for (let n = 0; h.store.getState().state?.result === null && n < cap; n++) h.store.getState().act(simplePick(h.store.getState().legal));
}

describe('the main menu', () => {
  it('opens over a running daily duel and comes back to the same state, with the session saved', async () => {
    const h = await started(DATE);
    for (let i = 0; i < 4; i++) h.store.getState().act(simplePick(h.store.getState().legal));
    const before = h.store.getState();
    const saved = h.storage.get(sessionKey(DATE));
    before.openMenu();
    expect(h.store.getState().phase.name).toBe('home');
    expect(h.store.getState().state).toBe(before.state);
    expect(h.storage.get(sessionKey(DATE))).toBe(saved);
    h.store.getState().enterDaily();
    expect(h.store.getState().phase.name).toBe('duel');
    expect(h.store.getState().state).toBe(before.state);
    expect(h.store.getState().actions).toBe(before.actions);
  });

  it('begins the duel from the menu when none has started, and shows the result after it ends', async () => {
    const h = makeStore(DATE);
    await h.store.getState().boot();
    expect(h.store.getState().phase.name).toBe('home');
    h.store.getState().enterDaily();
    expect(h.store.getState().phase.name).toBe('duel');
    await playOut(h);
    expect(h.store.getState().phase.name).toBe('result');
    h.store.getState().openMenu();
    expect(h.store.getState().phase.name).toBe('home');
    expect(h.store.getState().dailyDone).toBe(true);
    h.store.getState().enterDaily();
    expect(h.store.getState().phase.name).toBe('result');
  });

  it('keeps Practice resumable from the menu, and leaving it clears it', async () => {
    const h = await started(DATE);
    await playOut(h);
    const daily = h.store.getState();
    h.store.getState().startPractice('today');
    for (let i = 0; i < 5; i++) h.store.getState().act(simplePick(h.store.getState().legal));
    const practiceActions = h.store.getState().actions;
    h.store.getState().openMenu();
    expect(h.store.getState().practiceSaved.today).toBe(true);
    expect(h.storage.get(practiceKey(DATE))).not.toBeNull();
    // the Daily entry goes to the daily result while Practice waits in storage
    h.store.getState().enterDaily();
    expect(h.store.getState().mode).toBe('daily');
    expect(h.store.getState().phase.name).toBe('result');
    expect(h.store.getState().state).toBe(daily.state);
    h.store.getState().openMenu();
    h.store.getState().continuePractice('today');
    expect(h.store.getState().mode).toBe('practice');
    expect(h.store.getState().phase.name).toBe('duel');
    expect(h.store.getState().actions).toEqual(practiceActions);
    // Restart: today's practice duel from the start
    h.store.getState().startPractice();
    expect(h.store.getState().actions).toEqual([]);
    expect(h.store.getState().mode).toBe('practice');
    await playOut(h);
    h.store.getState().leavePractice();
    h.store.getState().openMenu();
    expect(h.store.getState().practiceSaved.today).toBe(false);
    expect(h.store.getState().mode).toBe('daily');
    expect(h.store.getState().phase.name).toBe('home');
    expect(h.storage.get(practiceKey(DATE))).toBeNull();
  });

  it('undo works in Practice and saves to the Practice record only', async () => {
    const h = await started(DATE);
    await playOut(h);
    const daily = h.storage.get(sessionKey(DATE));
    h.store.getState().startPractice('today');
    for (let i = 0; i < 40 && h.store.getState().state?.result === null; i++) {
      const s = h.store.getState();
      s.act(simplePick(s.legal));
      if (h.store.getState().trail.length > 1) {
        const n = h.store.getState().actions.length;
        h.store.getState().undo();
        if (h.store.getState().actions.length < n) {
          expect(JSON.parse(h.storage.get(practiceKey(DATE)) ?? '{}').actions).toHaveLength(h.store.getState().actions.length);
          expect(h.storage.get(sessionKey(DATE))).toBe(daily);
          return;
        }
      }
    }
    throw new Error('never undid anything');
  });
});

describe('Graft un-pick', () => {
  it('takes a picked material out as one change: no events, no animation frames, no cancel in the log', async () => {
    let tested = false;
    for (const date of ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']) {
      const h = await started(date);
      for (let i = 0; i < 300 && h.store.getState().state?.result === null && !tested; i++) {
        const s = h.store.getState();
        if (s.groups?.graftBegin == null) {
          s.act(simplePick(s.legal));
          continue;
        }
        s.act(s.groups.graftBegin);
        const pick = (): void => {
          const g = h.store.getState().groups;
          h.store.getState().act([...(g?.graftPicks.values() ?? [])][0] as Action);
        };
        pick();
        pick();
        const two = h.store.getState();
        const [first, second] = two.state?.pending?.mats as readonly [number, number];
        const logBefore = two.actions.length;
        two.graftUnpick(second);
        const one = h.store.getState();
        expect(one.error).toBeNull();
        expect(one.state?.pending?.mats).toEqual([first]);
        expect(one.state?.pending?.stage).toBe('mat2');
        expect(one.actions).toHaveLength(logBefore - 1);
        expect(one.actions.some((a) => a.t === 'graftCancel')).toBe(false);
        expect(one.events).toEqual([]);
        expect(one.frames).toEqual([]);
        expect(one.trail).toHaveLength(one.actions.length);
        // the first material can also be taken out; the kept one becomes the first pick if the engine allows it
        one.graftUnpick(first);
        const none = h.store.getState();
        expect(none.state?.pending?.mats).toEqual([]);
        expect(none.state?.pending?.stage).toBe('mat1');
        // saved and replayable: a reload resumes the same pending Graft
        const fresh = makeStore(date, h.storage);
        await fresh.store.getState().boot();
        expect(hashState(fresh.store.getState().state as NonNullable<typeof none.state>)).toBe(hashState(none.state as NonNullable<typeof none.state>));
        tested = true;
      }
      if (tested) break;
    }
    expect(tested).toBe(true);
  });
});

describe('the duel log', () => {
  it('is not capped: a long duel keeps every line', async () => {
    const h = await started(DATE);
    await playOut(h);
    const s = h.store.getState();
    const ctx = s.ctx as NonNullable<typeof s.ctx>;
    const state = s.state as NonNullable<typeof s.state>;
    const once = duelLog(ctx, state, s.trail);
    expect(once.length).toBeGreaterThan(10);
    expect(once.filter((l) => l.text.startsWith('Round')).length).toBeGreaterThan(2);
    const long = duelLog(ctx, state, Array.from({ length: 5 }, () => s.trail).flat());
    expect(long.length).toBe(once.length * 5);
    expect(long.length).toBeGreaterThan(40);
  });

  it('drops the lines of an undone action', async () => {
    const h = await started(DATE);
    for (let i = 0; i < 300 && h.store.getState().state?.result === null; i++) {
      const g = h.store.getState();
      const lines = duelLog(g.ctx as NonNullable<typeof g.ctx>, g.state as NonNullable<typeof g.state>, g.trail);
      g.undo();
      const after = h.store.getState();
      if (after.actions.length < g.actions.length) {
        const kept = duelLog(after.ctx as NonNullable<typeof after.ctx>, after.state as NonNullable<typeof after.state>, after.trail);
        expect(kept.length).toBeLessThanOrEqual(lines.length);
        expect(kept).toEqual(lines.slice(0, kept.length));
        return;
      }
      g.act(simplePick(g.legal));
    }
    throw new Error('never undid anything');
  });
});

describe('the Collector as a show (D-266)', () => {
  it('telegraphs each of his moves, plays them one at a time, and ends on the real state', async () => {
    const h = await started(DATE);
    let sawCollector = 0;
    let sawTelegraph = 0;
    for (let i = 0; i < 400 && h.store.getState().state?.result === null; i++) {
      const s = h.store.getState();
      s.act(simplePick(s.legal));
      const { frames, state } = h.store.getState();
      if (frames.length === 0) continue;
      const stages = stagesOf(frames);
      expect(stages.at(-1)?.state).toBe(state);
      frames.forEach((f, j) => {
        if (j > 0) expect(f.before).toBe((frames[j - 1] as (typeof frames)[number]).after);
        if (f.side === 1) {
          sawCollector++;
          const tg = telegraphOf(f);
          if (f.action.t === 'attack') expect(tg).toMatchObject({ kind: 'attack', actor: f.action.a });
          if (f.action.t === 'endTurn') expect(tg).toBeNull();
          if (tg !== null) sawTelegraph++;
        }
      });
      const tStages = stages.filter((x) => x.kind === 'telegraph');
      expect(tStages.every((x) => x.ms === (x.telegraph?.kind === 'levy' ? TIMING.LEVY_MARK_MS : TIMING.TELEGRAPH_MS) && x.cues.length === 0)).toBe(true);
      // every telegraph is followed by the act it announces, on the state that act produced
      stages.forEach((x, j) => {
        if (x.kind === 'telegraph') expect(stages[j + 1]?.kind).toBe('act');
      });
      // input is blocked from the first stage while any Collector move is still to come, and never after the last
      expect(blockedAt(stages, 0)).toBe(frames.some((f) => f.side === 1));
      expect(blockedAt(stages, stages.length)).toBe(false);
    }
    expect(sawCollector).toBeGreaterThan(0);
    expect(sawTelegraph).toBeGreaterThan(0);
  });

  it('leaves the engine result of a step as it was: the final state is the last frame', async () => {
    const h = await started(DATE);
    const s = h.store.getState();
    s.act(simplePick(s.legal));
    for (let i = 0; i < 30 && h.store.getState().state?.result === null; i++) {
      const g = h.store.getState();
      g.act(simplePick(g.legal));
      const { frames, state, actions } = h.store.getState();
      expect(frames.at(-1)?.after).toBe(state);
      expect(actions.slice(-frames.length)).toEqual(frames.map((f) => f.action));
    }
  });
});
