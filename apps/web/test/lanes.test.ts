// Lane support in the web layer (D-281..D-284): the plan maps taps to lanes from the legal list only, the lanes-off board
// is unchanged, an old save under other rules starts over with a notice, and a whole lanes duel plays through the store.
import { describe, expect, it } from 'vitest';
import type { Action, GameState } from '@vault-duel/engine';
import { RULES_NOTICE } from '../src/store/game';
import { loadSession } from '../src/daily/session';
import { memoryStorage } from '../src/persistence/storage';
import { attackNote, coveredLanes, lanesOn, monstersOnly, movedThisTurn } from '../src/view/lanes';
import { groupLegal } from '../src/view/legal';
import { planFor } from '../src/view/selection';
import type { Selection } from '../src/view/selection';
import { telegraphOf } from '../src/visual/playback';
import { cuesFromEvents } from '../src/visual/cues';
import { makeStore, started } from './helpers';

const DATE = '2026-10-14';
const LANES = ['FLAGS.LANES=true'];
type Harness = Awaited<ReturnType<typeof started>>;

const legalOf = (h: Harness): readonly Action[] => h.store.getState().legal;
const stateOf = (h: Harness): GameState => h.store.getState().state as GameState;

/** Plays the player's side by the book until `stop` says so (or a cap), always from the legal list. */
function drive(h: Harness, stop: (legal: readonly Action[]) => boolean, cap = 400): boolean {
  for (let n = 0; n < cap && stateOf(h).result === null; n++) {
    const legal = legalOf(h);
    if (stop(legal)) return true;
    const pick =
      legal.find((a) => a.t === 'keep') ??
      legal.find((a) => a.t === 'attack') ??
      legal.find((a) => a.t === 'summon' && a.mode === 'atk') ??
      legal.find((a) => a.t === 'endTurn') ??
      (legal[0] as Action);
    h.store.getState().act(pick);
    expect(h.store.getState().error).toBeNull();
  }
  return false;
}

describe('lanes on: the plan', () => {
  it('lights one lane per legal summon, from the actions themselves', async () => {
    const h = await started(DATE, memoryStorage(), LANES);
    h.store.getState().act({ t: 'keep' });
    const legal = legalOf(h);
    const groups = groupLegal(legal);
    const [iid, list] = [...groups.summons.entries()][0] as [number, ReturnType<typeof groupLegal>['summons'] extends ReadonlyMap<number, infer V> ? V : never];
    const sel: Selection = { t: 'hand', iid, faceDown: false, guard: false };
    const plan = planFor(groups, sel);
    expect(plan.summon).toBeNull();
    const atkLanes = list.filter((a) => a.mode === 'atk').map((a) => a.lane);
    expect([...plan.lanes.keys()]).toEqual(atkLanes);
    expect(atkLanes.length).toBeGreaterThan(0);
    for (const a of plan.lanes.values()) expect(legal).toContainEqual(a);
    // switching mode changes which action a lane plays, never the lanes offered
    const guard = planFor(groups, { ...sel, guard: true });
    for (const [lane, a] of guard.lanes) expect(a).toMatchObject({ t: 'summon', mode: 'grd', lane });
  });

  it('a monster on the board is offered exactly the lane moves the engine lists', async () => {
    const h = await started(DATE, memoryStorage(), LANES);
    expect(drive(h, (l) => l.some((a) => a.t === 'moveLane'))).toBe(true);
    const legal = legalOf(h);
    const groups = groupLegal(legal);
    const [m, moves] = [...groups.moveLanes.entries()][0] as [number, readonly Extract<Action, { t: 'moveLane' }>[]];
    const plan = planFor(groups, { t: 'board', iid: m });
    expect([...plan.moves.keys()]).toEqual(moves.map((a) => a.to));
    for (const a of plan.moves.values()) expect(legal).toContainEqual(a);
    expect(plan.anything).toBe(true);
    // a lane move is a use of the reposition: the engine stamps it, and the view says so
    h.store.getState().act([...plan.moves.values()][0] as Action);
    const s = stateOf(h);
    const mon = s.sides[0].board.find((x) => x !== null && x.iid === m);
    expect(mon).toBeDefined();
    expect(movedThisTurn(h.store.getState().ctx?.globals as never, s, mon as never)).toBe(true);
    expect(groupLegal(legalOf(h)).moveLanes.has(m)).toBe(false);
    expect(groupLegal(legalOf(h)).repositions.has(m)).toBe(false);
  });

  it('an empty lane across, with monsters elsewhere, is a note and gives no life hit', async () => {
    const h = await started(DATE, memoryStorage(), LANES);
    const g = h.store.getState().ctx?.globals as NonNullable<ReturnType<typeof h.store.getState>['ctx']>['globals'];
    expect(lanesOn(g)).toBe(true);
    let seen = false;
    for (let n = 0; n < 400 && stateOf(h).result === null && !seen; n++) {
      const s = stateOf(h);
      const foes = s.sides[1].board;
      s.sides[0].board.forEach((m, i) => {
        if (m !== null && attackNote(g, s, i) === 'emptyLane') {
          seen = true;
          expect(foes[i]).toBeNull();
          expect(foes.some((f) => f !== null)).toBe(true);
          // whatever the monster may do, none of it is a direct attack
          const direct = legalOf(h).filter((a) => a.t === 'attack' && a.a === m.iid && a.target === -1);
          expect(direct).toEqual([]);
        }
      });
      const pick = legalOf(h).find((a) => a.t === 'keep') ?? legalOf(h).find((a) => a.t === 'summon' && a.mode === 'atk') ?? legalOf(h).find((a) => a.t === 'endTurn') ?? (legalOf(h)[0] as Action);
      h.store.getState().act(pick);
    }
    expect(seen).toBe(true);
  });

  it('covers lanes beside a face-up Sentinel, and no lane when lanes are off', async () => {
    const h = await started(DATE, memoryStorage(), LANES);
    const ctx = h.store.getState().ctx as NonNullable<ReturnType<typeof h.store.getState>['ctx']>;
    const rt = h.store.getState().rt as NonNullable<ReturnType<typeof h.store.getState>['rt']>;
    const s = stateOf(h);
    expect(coveredLanes(ctx.globals, rt.engine, ctx.content.kwBit['sentinel'], s, 0).size).toBe(0);
    const off = await started(DATE);
    const offCtx = off.store.getState().ctx as NonNullable<ReturnType<typeof h.store.getState>['ctx']>;
    expect(coveredLanes(offCtx.globals, rt.engine, offCtx.content.kwBit['sentinel'], stateOf(off), 0).size).toBe(0);
    expect(attackNote(offCtx.globals, stateOf(off), 0)).toBeNull();
  });
});

describe('lanes off: nothing changes', () => {
  it('summons play on any empty slot and no lane or move is offered', async () => {
    const h = await started(DATE);
    h.store.getState().act({ t: 'keep' });
    const groups = groupLegal(legalOf(h));
    const iid = [...groups.summons.keys()][0] as number;
    const plan = planFor(groups, { t: 'hand', iid, faceDown: false, guard: false });
    expect(plan.summon).not.toBeNull();
    expect(plan.lanes.size).toBe(0);
    expect(plan.sacs.size).toBe(0);
    expect(drive(h, (l) => l.some((a) => a.t === 'moveLane'), 200)).toBe(false);
  });

  it('shows no sickness mark (classic sickness)', async () => {
    const h = await started(DATE);
    const ctx = h.store.getState().ctx as NonNullable<ReturnType<typeof h.store.getState>['ctx']>;
    const rt = h.store.getState().rt as NonNullable<ReturnType<typeof h.store.getState>['rt']>;
    drive(h, (l) => l.some((a) => a.t === 'endTurn') && stateOf(h).sides[0].board.some((m) => m !== null));
    const m = stateOf(h).sides[0].board.find((x) => x !== null);
    expect(m).toBeDefined();
    expect(monstersOnly(ctx.globals, rt.engine, stateOf(h), m as never)).toBe(false);
  });
});

describe('sickness mark (D-280)', () => {
  /** Plays a duel and reports whether any monster of yours ever showed the mark, checking it against the engine each step. */
  async function marksSeen(overrides: readonly string[]): Promise<boolean> {
    const h = await started(DATE, memoryStorage(), overrides);
    const ctx = h.store.getState().ctx as NonNullable<ReturnType<typeof h.store.getState>['ctx']>;
    const rt = h.store.getState().rt as NonNullable<ReturnType<typeof h.store.getState>['rt']>;
    let seen = false;
    for (let n = 0; n < 500 && stateOf(h).result === null; n++) {
      const s = stateOf(h);
      for (const m of s.sides[0].board) {
        if (m === null) continue;
        const shown = monstersOnly(ctx.globals, rt.engine, s, m);
        if (shown) {
          seen = true;
          expect(rt.engine.attackPermission(s, m.iid)).toBe('monstersOnly');
        }
      }
      const legal = legalOf(h);
      h.store.getState().act(legal.find((a) => a.t === 'keep') ?? legal.find((a) => a.t === 'summon' && a.mode === 'atk') ?? legal.find((a) => a.t === 'endTurn') ?? (legal[0] as Action));
    }
    return seen;
  }
  it('is shown for a monster that can hit monsters but not life, under monsters-only sickness', async () => {
    expect(await marksSeen([...LANES, 'SICKNESS_MODE=monstersOnly'])).toBe(true);
  });
  it('is never shown under classic sickness', async () => {
    expect(await marksSeen(LANES)).toBe(false);
  });
});

describe('old saves (D-287)', () => {
  it('a duel saved under other rules starts over with the rules notice', async () => {
    const storage = memoryStorage();
    const old = await started(DATE, storage);
    old.store.getState().act({ t: 'keep' });
    expect(loadSession(storage, DATE)?.actions.length).toBe(1);
    const next = makeStore(DATE, storage, LANES);
    await next.store.getState().boot();
    const s = next.store.getState();
    expect(s.notice).toBe(RULES_NOTICE);
    expect(s.phase.name).toBe('duel');
    expect(s.actions).toEqual([]);
    expect(loadSession(storage, DATE)?.actions).toEqual([]);
    expect(loadSession(storage, DATE)?.cfg).toBe(s.state?.cfg);
  });

  it('a duel saved under the same rules resumes with no notice', async () => {
    const storage = memoryStorage();
    const first = await started(DATE, storage, LANES);
    first.store.getState().act({ t: 'keep' });
    const again = makeStore(DATE, storage, LANES);
    await again.store.getState().boot();
    expect(again.store.getState().notice).toBeNull();
    expect(again.store.getState().actions).toEqual([{ t: 'keep' }]);
  });
});

describe('a whole duel with lanes on', () => {
  it('plays to a result through the store, saved after every action, resumable', async () => {
    const storage = memoryStorage();
    const h = await started(DATE, storage, [...LANES, 'SICKNESS_MODE=monstersOnly']);
    let moved = false;
    for (let n = 0; n < 700 && stateOf(h).result === null; n++) {
      const legal = legalOf(h);
      const mv = moved ? undefined : legal.find((a) => a.t === 'moveLane');
      if (mv !== undefined) moved = true;
      const pick =
        mv ?? legal.find((a) => a.t === 'keep') ?? legal.find((a) => a.t === 'summon' && a.mode === 'grd') ?? legal.find((a) => a.t === 'endTurn') ??
        (legal[0] as Action);
      h.store.getState().act(pick);
      expect(h.store.getState().error).toBeNull();
      expect(loadSession(storage, DATE)?.actions).toEqual(h.store.getState().actions);
    }
    expect(stateOf(h).result).not.toBeNull();
    expect(moved).toBe(true);
    const again = makeStore(DATE, storage, [...LANES, 'SICKNESS_MODE=monstersOnly']);
    await again.store.getState().boot();
    expect(again.store.getState().notice).toBeNull();
    expect(again.store.getState().phase.name).toBe('result');
  });
});

describe('engine events drive the show', () => {
  it('a lane move is a flash cue on the mover, and the Collector announces it', async () => {
    const h = await started(DATE, memoryStorage(), LANES);
    expect(drive(h, (l) => l.some((a) => a.t === 'moveLane'))).toBe(true);
    const a = legalOf(h).find((x) => x.t === 'moveLane') as Extract<Action, { t: 'moveLane' }>;
    h.store.getState().act(a);
    const events = h.store.getState().events;
    expect(events.some((e) => e.e === 'LaneMoved')).toBe(true);
    expect(cuesFromEvents(events).some((c) => c.kind === 'flash' && c.iid === a.m)).toBe(true);
    const frame = { action: a, side: 1 as const, before: stateOf(h), after: stateOf(h), events };
    expect(telegraphOf(frame)).toMatchObject({ kind: 'moveLane', actor: a.m, slot: { index: a.to } });
  });
});
