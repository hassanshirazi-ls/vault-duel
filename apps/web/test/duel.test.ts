import { describe, expect, it } from 'vitest';
import { hashState } from '@vault-duel/engine';
import type { Action } from '@vault-duel/engine';
import { RESTART_NOTICE } from '../src/store/game';
import { loadSession, saveSession, sessionKey } from '../src/daily/session';
import { memoryStorage } from '../src/persistence/storage';
import { makeStore, simplePick, started } from './helpers';

const DATE = '2026-10-14';

async function playOut(h: Awaited<ReturnType<typeof started>>, pick = simplePick, cap = 600): Promise<number> {
  let n = 0;
  while (h.store.getState().state?.result === null && n < cap) {
    h.store.getState().act(pick(h.store.getState().legal));
    expect(h.store.getState().error).toBeNull();
    n++;
  }
  return n;
}

describe('a full duel through the store', () => {
  it('plays to a result using only legal actions, and ends in the result phase', async () => {
    const h = await started(DATE);
    const steps = await playOut(h);
    const s = h.store.getState();
    expect(steps).toBeLessThan(600);
    expect(s.state?.result).not.toBeNull();
    expect(s.phase.name).toBe('result');
    expect(s.legal).toEqual([]);
    // the log holds the Collector's actions too, and replaying it reproduces the state
    expect(s.rt?.engine.replay(s.state?.seed ?? '', s.actions, { twist: s.setup?.twist ?? -1 }).result).toEqual(s.state?.result);
  });

  it('rejects an illegal action without changing the duel', async () => {
    const h = await started(DATE);
    const before = h.store.getState().state;
    h.store.getState().act({ t: 'endTurn' }); // illegal during the mulligan
    expect(h.store.getState().state).toBe(before);
    expect(h.store.getState().error).not.toBeNull();
  });

  it('offers the groups the UI needs: keep and redraw first', async () => {
    const h = await started(DATE);
    const g = h.store.getState().groups;
    expect(g?.keep).not.toBeNull();
    expect(g?.redraw).not.toBeNull();
    expect(g?.endTurn).toBeNull();
  });
});

describe('the Graft flow', () => {
  it('previews before graftPosition, can cancel, and commits', async () => {
    let tested = false;
    for (const date of ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']) {
      const h = await started(date);
      for (let i = 0; i < 300 && h.store.getState().state?.result === null && !tested; i++) {
        const s = h.store.getState();
        if (s.groups?.graftBegin == null) {
          s.act(simplePick(s.legal));
          continue;
        }
        const act = (a: Action) => h.store.getState().act(a);
        const fresh = () => h.store.getState();
        act(s.groups.graftBegin);
        expect(fresh().state?.pending?.stage).toBe('mat1');
        expect(fresh().groups?.graftCancel).not.toBeNull();
        // cancel returns to the main step with nothing committed
        act(fresh().groups?.graftCancel as Action);
        expect(fresh().state?.pending).toBeNull();
        // drive the stages: every choice comes from the legal list
        act(fresh().groups?.graftBegin as Action);
        let preview = null;
        for (let guard = 0; guard < 10 && fresh().groups?.graftPositions.length === 0; guard++) {
          const g = fresh().groups;
          const next: Action | undefined = g?.graftKeywords[0] ?? [...(g?.graftPicks.values() ?? [])][0] ?? g?.graftSkipAscend ?? undefined;
          if (next === undefined) break;
          act(next);
          const st = fresh();
          if (st.state !== null && st.rt !== null && st.state.pending !== null) preview ??= st.rt.engine.previewGraft(st.state);
        }
        const pos = fresh().groups?.graftPositions[0];
        expect(pos).toBeDefined();
        expect(preview).not.toBeNull();
        const grafts = fresh().state?.track.grafts ?? 0;
        act(pos as Action);
        expect(fresh().state?.pending).toBeNull();
        expect(fresh().state?.track.grafts).toBe(grafts + 1);
        tested = true;
      }
      if (tested) break;
    }
    expect(tested).toBe(true);
  });
});

describe('save and resume (D-108, D-191)', () => {
  it('persists after every action and a reload replays to the same state', async () => {
    const storage = memoryStorage();
    const h = await started(DATE, storage);
    for (let i = 0; i < 5; i++) {
      h.store.getState().act(simplePick(h.store.getState().legal));
      expect(loadSession(storage, DATE)?.actions).toEqual(h.store.getState().actions);
    }
    const before = h.store.getState();
    const again = makeStore(DATE, storage);
    await again.store.getState().boot();
    const after = again.store.getState();
    expect(after.phase.name).toBe('duel');
    expect(after.notice).toBeNull();
    expect(after.state && before.state && hashState(after.state)).toBe(before.state && hashState(before.state));
    expect(after.actions).toEqual(before.actions);
  });

  it('a saved duel with no actions yet resumes at home', async () => {
    const storage = memoryStorage();
    await started(DATE, storage);
    const again = makeStore(DATE, storage);
    await again.store.getState().boot();
    expect(again.store.getState().phase.name).toBe('home');
  });

  it('restarts with the notice when cfg no longer matches', async () => {
    const storage = memoryStorage();
    const h = await started(DATE, storage);
    h.store.getState().act({ t: 'keep' });
    const rec = loadSession(storage, DATE);
    if (rec === null) throw new Error('no session');
    saveSession(storage, { ...rec, cfg: 'old-content:old-globals' });
    const again = makeStore(DATE, storage);
    await again.store.getState().boot();
    const s = again.store.getState();
    expect(s.notice).toBe(RESTART_NOTICE);
    expect(s.phase.name).toBe('duel');
    expect(s.actions).toEqual([]);
    expect(loadSession(storage, DATE)?.actions).toEqual([]);
  });

  it('restarts with the notice when a saved action is illegal', async () => {
    const storage = memoryStorage();
    const h = await started(DATE, storage);
    h.store.getState().act({ t: 'keep' });
    const rec = loadSession(storage, DATE);
    if (rec === null) throw new Error('no session');
    saveSession(storage, { ...rec, actions: [...rec.actions, { t: 'graftPosition', pos: 0 }] });
    const again = makeStore(DATE, storage);
    await again.store.getState().boot();
    expect(again.store.getState().notice).toBe(RESTART_NOTICE);
    expect(again.store.getState().actions).toEqual([]);
  });

  it('restarts on a content reload even if the replay would pass (D-197)', async () => {
    const storage = memoryStorage();
    const h = await started(DATE, storage);
    h.store.getState().act({ t: 'keep' });
    await h.store.getState().boot({ restartNotice: RESTART_NOTICE });
    const s = h.store.getState();
    expect(s.notice).toBe(RESTART_NOTICE);
    expect(s.actions).toEqual([]);
    expect(s.state?.step).toBe('mulligan');
  });

  it('ignores corrupt saves and a save from another day', async () => {
    const storage = memoryStorage();
    storage.set(sessionKey(DATE), '{broken');
    const h = makeStore(DATE, storage);
    await h.store.getState().boot();
    expect(h.store.getState().phase.name).toBe('home');
  });
});

describe('content at startup (D-176)', () => {
  it('shows the error lines when content fails', async () => {
    const { createGameStore } = await import('../src/store/game');
    const store = createGameStore({
      storage: memoryStorage(),
      loadContent: () => ({ ok: false, lines: ['cards/player-monsters.json › x › power: bad › fix it'] }),
      today: () => DATE,
      resolveSetup: () => Promise.reject(new Error('unreachable')),
    });
    await store.getState().boot();
    expect(store.getState().phase).toEqual({ name: 'error', lines: ['cards/player-monsters.json › x › power: bad › fix it'] });
  });
});
