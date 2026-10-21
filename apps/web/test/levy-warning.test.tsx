// The Levy warning (D-372): the forecast comes from the engine's own endTurn, the mark and label render from it.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Action, Engine, GameState } from '@vault-duel/engine';
import { roundOfState } from '../src/duel/turn';
import { levyForecast } from '../src/view/levy';
import { App } from '../src/ui/App';
import { StoreContext } from '../src/ui/context';
import { memoryStorage } from '../src/persistence/storage';
import { cardView } from '../src/view/cards';
import { started } from './helpers';

function need<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('missing');
  return v;
}

type Harness = Awaited<ReturnType<typeof started>>;
const html = (h: Harness): string =>
  renderToString(
    <StoreContext.Provider value={{ ...h.store, getInitialState: h.store.getState }}>
      <App />
    </StoreContext.Provider>,
  );

const DATES = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'];

/** keep, then summon the strongest monster each turn and end it: a board that is worth a Levy */
function strongPick(h: Harness): Action {
  const { legal, ctx, rt, state } = h.store.getState();
  const keep = legal.find((a) => a.t === 'keep');
  if (keep !== undefined) return keep;
  let best: Action | null = null;
  let bestPower = -1;
  for (const a of legal) {
    if (a.t !== 'summon' || a.mode !== 'atk') continue;
    const p = cardView(need(ctx), need(rt).engine, need(state), a.c).power ?? 0;
    if (p > bestPower) {
      best = a;
      bestPower = p;
    }
  }
  return best ?? legal.find((a) => a.t === 'endTurn') ?? (legal[0] as Action);
}

/** play the simple player until a state where ending the turn is followed by a Levy; `want` picks the kind */
async function untilLevy(want: 'takes' | 'none' | 'any', date: string, storage = memoryStorage()): Promise<Harness | null> {
  const h = await started(date, storage);
  for (let i = 0; i < 400; i++) {
    const s = h.store.getState();
    if (s.state === null || s.state.result !== null || s.rt === null) return null;
    const f = levyForecast(s.rt.engine, s.state, s.groups?.endTurn ?? null);
    if (f !== null && (want === 'any' || f.kind === want)) return h;
    s.act(strongPick(h));
  }
  return null;
}

interface Fixture {
  readonly h: Harness;
  readonly state: GameState;
  readonly engine: Engine;
  readonly endTurn: Action;
}

/**
 * A real duel played to the first Levy turn and one summon in. The Monarch kills your monsters every turn in these
 * seeds, so the board is then made worth a Levy: the summoned monster gets +30 Power (the engine reads permP) and a
 * second one, a copy standing in for a card from the hand, +25. Only the state object is patched; the engine decides.
 */
async function find(): Promise<Fixture> {
  for (const d of DATES) {
    const h = await untilLevy('any', d);
    if (h === null) continue;
    h.store.getState().act(strongPick(h));
    const { state, rt, groups } = h.store.getState();
    if (state === null || rt === null || groups?.endTurn == null) continue;
    const first = state.sides[0].board.find((m) => m !== null);
    const spare = state.sides[0].hand[0];
    if (first === undefined || first === null || spare === undefined) continue;
    const board = state.sides[0].board.map((m, i) => (i === 0 ? { ...first, permP: 30 } : i === 1 ? { ...first, iid: spare, permP: 25 } : m));
    const side = { ...state.sides[0], board, hand: state.sides[0].hand.slice(1) };
    return { h, state: { ...state, sides: [side, state.sides[1]] } as unknown as GameState, engine: rt.engine, endTurn: groups.endTurn };
  }
  throw new Error('no Levy fixture');
}

const withBoard = (state: GameState, board: GameState['sides'][0]['board']): GameState =>
  ({ ...state, sides: [{ ...state.sides[0], board }, state.sides[1]] }) as unknown as GameState;

/** render the duel screen as if `state` were the store's live state */
function renderWith(h: Harness, state: GameState): string {
  const live = (): ReturnType<Harness['store']['getState']> => ({ ...h.store.getState(), state });
  const fake = { ...h.store, getState: live, getInitialState: live };
  return renderToString(
    <StoreContext.Provider value={fake as unknown as Harness['store']}>
      <App />
    </StoreContext.Provider>,
  );
}

describe('levyForecast', () => {
  it('never throws: an engine whose applyAction throws gives null', async () => {
    const { state, engine, endTurn } = await find();
    const broken = { ...engine, applyAction: () => { throw new Error('boom'); } } as unknown as Engine;
    expect(() => levyForecast(broken, state, endTurn)).not.toThrow();
    expect(levyForecast(broken, state, endTurn)).toBeNull();
  });

  it('names the taken monster, matches what the engine does, and leaves the state untouched', async () => {
    const { state, engine, endTurn } = await find();
    const before = JSON.stringify(state);
    const f = levyForecast(engine, state, endTurn);
    expect(f?.kind).toBe('takes');
    expect(JSON.stringify(state)).toBe(before);
    expect(levyForecast(engine, state, endTurn)).toBe(f); // memoised per state object
    const real = engine.applyAction(state, endTurn).events.find((e) => e.e === 'Appraised');
    expect(real?.e === 'Appraised' && f?.kind === 'takes' && real.iid === f.iid).toBe(true);
    expect(state.sides[0].board.some((m) => m !== null && f?.kind === 'takes' && m.iid === f.iid)).toBe(true);
  });

  it('does not change a deep-frozen state', async () => {
    const { state, engine, endTurn } = await find();
    const freeze = (o: unknown): void => {
      if (typeof o !== 'object' || o === null || Object.isFrozen(o)) return;
      Object.freeze(o);
      Object.values(o).forEach(freeze);
    };
    freeze(state);
    expect(() => levyForecast(engine, state, endTurn)).not.toThrow();
  });

  it('is null with no Levy this turn, without an endTurn action, on a mulligan, and with the flag off', async () => {
    const h = await started('2026-10-14');
    const s0 = h.store.getState();
    const engine = need(s0.rt).engine;
    expect(levyForecast(engine, need(s0.state), s0.groups?.endTurn ?? null)).toBeNull(); // mulligan
    s0.act(need(s0.legal.find((a) => a.t === 'keep')));
    const s1 = h.store.getState();
    expect(s1.groups?.endTurn).not.toBeNull();
    expect(roundOfState(need(s1.state))).toBe(1);
    expect(levyForecast(engine, need(s1.state), need(s1.groups).endTurn)).toBeNull(); // round 1: no Levy follows
    expect(levyForecast(engine, need(s1.state), null)).toBeNull();

    const { state, engine: e2, endTurn } = await find();
    expect(levyForecast(e2, state, endTurn)).not.toBeNull();
    const off = { ...e2, globals: { ...e2.globals, FLAGS: { ...e2.globals.FLAGS, APPRAISAL: false } } };
    expect(levyForecast(off, state, endTurn)).toBeNull();
    expect(levyForecast(e2, { ...state, pending: {} as GameState['pending'] }, endTurn)).toBeNull(); // a Graft is pending
    expect(levyForecast(e2, { ...state, result: {} as GameState['result'] }, endTurn)).toBeNull(); // game over
  });

  it('is null on his turn', async () => {
    const { state, engine, endTurn } = await find();
    expect(levyForecast(engine, { ...state, turn: state.turn + 1 }, endTurn)).toBeNull();
  });

  it('says there is nothing to take when the Levy would fail', async () => {
    const { state, engine, endTurn } = await find();
    expect(levyForecast(engine, withBoard(state, state.sides[0].board.map(() => null)), endTurn)).toEqual({ kind: 'none' });
  });

  it('follows the engine when an Unstable Chimera expiring at the end of the turn changes the target', async () => {
    const { state, engine, endTurn } = await find();
    const f = levyForecast(engine, state, endTurn);
    if (f?.kind !== 'takes') throw new Error('fixture');
    // the engine's choice is Unstable and expires at the end of this very turn, so the other monster is taken instead
    const patched = withBoard(state, state.sides[0].board.map((m) => (m !== null && m.iid === f.iid ? { ...m, unstableUntil: state.turn } : m)));
    const g = levyForecast(engine, patched, endTurn);
    const real = engine.applyAction(patched, endTurn).events.find((e) => e.e === 'Appraised');
    expect(g?.kind).toBe('takes');
    expect(g).not.toEqual(f);
    expect(real?.e === 'Appraised' && g?.kind === 'takes' && real.iid === g.iid).toBe(true);
  });
});

describe('the Levy warning on screen', () => {
  it('marks the taken card and labels End turn', async () => {
    const { h, state, engine, endTurn } = await find();
    const f = levyForecast(engine, state, endTurn);
    if (f?.kind !== 'takes') throw new Error('fixture');
    const out = renderWith(h, state);
    expect(out).toContain('The Levy will take this');
    expect(out.match(/data-levy-risk/g)).toHaveLength(1);
    expect(out).toContain('class="end-levy"');
    expect(out).toMatch(/data-levy="takes"/);
    // the mark sits on the card of the taken monster
    const m = state.sides[0].board.find((x) => x !== null && x.iid === f.iid);
    const ctx = need(h.store.getState().ctx);
    const name = cardView(ctx, engine, state, f.iid).name;
    expect(m).toBeDefined();
    const card = out.split('<button').find((c) => c.includes('data-levy-risk'));
    expect(card).toContain(`aria-label="${name}`);
    expect(card).toContain('The Levy will take this');
  });

  it('shows "nothing to take" and no mark when the Levy would fail', async () => {
    const { h, state } = await find();
    const out = renderWith(h, withBoard(state, state.sides[0].board.map(() => null)));
    expect(out).toContain('Levy · none');
    expect(out).toMatch(/data-levy="none"/);
    expect(out).not.toContain('data-levy-risk');
  });

  it('has no label and no mark on a turn without a Levy', async () => {
    const h = await started('2026-10-14');
    h.store.getState().act(need(h.store.getState().legal.find((a) => a.t === 'keep')));
    const out = html(h);
    expect(out).not.toContain('end-levy');
    expect(out).not.toContain('data-levy-risk');
  });

  it('echoes the Monarch intent above the hand on your turn', async () => {
    const h = await started('2026-10-14');
    h.store.getState().act(need(h.store.getState().legal.find((a) => a.t === 'keep')));
    const intent = need(h.store.getState().state).collector.intent;
    expect(intent).not.toBeNull();
    const label = { attack: 'He will attack', appraise: 'He will levy', guard: 'He will guard', scheme: 'He is scheming' }[need(intent)];
    const out = html(h);
    expect(out.split('intent-echo')[1]).toContain(label);
  });
});
