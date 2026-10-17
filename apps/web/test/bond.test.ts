// The bond rules in the web layer (D-305..D-320): taps and options come from the legal list only, an option performs
// through legal steps, the options model folds Graft duplicates, the log and cues know the new events, and the How to
// play copy follows the three switches. With every switch off nothing of this shows.
import * as content from '@vault-duel/content';
import { describe, expect, it } from 'vitest';
import type { Action, GameEvent, GameState } from '@vault-duel/engine';
import { loadGameContent } from '../src/content/load';
import { memoryStorage } from '../src/persistence/storage';
import { bondView, sameAction } from '../src/view/bond';
import { howToPages, howToQuiz } from '../src/view/howto';
import { groupLegal } from '../src/view/legal';
import { logLines, undoLabel } from '../src/view/log';
import { bondRanking, NO_RANKING } from '../src/view/rank';
import { planFor } from '../src/view/selection';
import { cuesFromEvents } from '../src/visual/cues';
import { started } from './helpers';

const DATE = '2026-10-20';
const ALL = ['FLAGS.SPLIT=true', 'FLAGS.SYMBIOSIS=true', 'FLAGS.BOND_ACTION=true'];
// The pre-flip rules (the live defaults since 2026-10-16 have every switch on)
const OFF = ['FLAGS.SPLIT=false', 'FLAGS.SYMBIOSIS=false', 'FLAGS.BOND_ACTION=false'];
type Harness = Awaited<ReturnType<typeof started>>;

const ctxFor = (overrides: readonly string[] = []) => {
  const r = loadGameContent(content, overrides);
  if (!r.ok) throw new Error(r.lines.join('\n'));
  return r.ctx;
};
const stateOf = (h: Harness): GameState => h.store.getState().state as GameState;
const legalOf = (h: Harness): readonly Action[] => h.store.getState().legal;

describe('bond groups and the plan', () => {
  it('sorts split and symbiose actions, and offers Attach and Split from them only', () => {
    const split: Action = { t: 'split', m: 7 };
    const sym1: Action = { t: 'symbiose', c: 3, host: 7 };
    const sym2: Action = { t: 'symbiose', c: 3, host: 8 };
    const groups = groupLegal([split, sym1, sym2, { t: 'endTurn' }]);
    expect(groups.splits.get(7)).toEqual(split);
    expect(groups.symbioses.get(3)).toEqual([sym1, sym2]);
    const hand = planFor(groups, { t: 'hand', iid: 3, faceDown: false, guard: false });
    expect(hand.canAttach).toBe(true);
    expect(hand.targets.size).toBe(0);
    const attach = planFor(groups, { t: 'hand', iid: 3, faceDown: false, guard: false, attach: true });
    expect([...attach.targets.keys()]).toEqual([7, 8]);
    expect(attach.targets.get(8)).toEqual(sym2);
    const board = planFor(groups, { t: 'board', iid: 7 });
    expect(board.split).toEqual(split);
    expect(planFor(groups, { t: 'board', iid: 8 }).split).toBeNull();
  });
  it('with no bond action in the legal list nothing is offered', () => {
    const groups = groupLegal([{ t: 'endTurn' }]);
    expect(groups.splits.size + groups.symbioses.size).toBe(0);
    expect(planFor(groups, { t: 'hand', iid: 1, faceDown: false, guard: false }).canAttach).toBe(false);
  });
  it('compares actions by value', () => {
    expect(sameAction({ t: 'graftPick', m: 4 }, { t: 'graftPick', m: 4 })).toBe(true);
    expect(sameAction({ t: 'graftPick', m: 4 }, { t: 'graftPick', m: 5 })).toBe(false);
    expect(sameAction({ t: 'endTurn' }, { t: 'keep' })).toBe(false);
  });
});

describe('options through the store', () => {
  it('lists the engine options, folds Graft duplicates, and performs one through legal steps', async () => {
    const h = await started(DATE, memoryStorage(), ALL);
    h.store.getState().act({ t: 'keep' });
    const { ctx, rt } = h.store.getState();
    if (ctx === null || rt === null) throw new Error('not booted');
    const preview = rt.engine.bondOptions(stateOf(h));
    expect(preview.available).toBe(true);
    const view = bondView(ctx, rt.engine, stateOf(h), preview, NO_RANKING);
    const rows = view.groups.flatMap((g) => g.families).flatMap((f) => f.rows);
    expect(rows.length).toBe(preview.options.length);
    const families = view.groups.flatMap((g) => g.families);
    expect(families.length).toBeLessThanOrEqual(rows.length);
    for (const g of view.groups) expect(g.families.reduce((n, f) => n + f.rows.length, 0)).toBe(g.count);
    // every row's first step is in the legal list; the options panel never invents an action
    for (const r of rows) expect(legalOf(h).some((a) => sameAction(a, r.option.steps[0] as Action))).toBe(true);
    const graft = view.groups.find((g) => g.kind === 'graft');
    expect(graft).toBeDefined();
    const pick = (graft?.families[0]?.head ?? rows[0]) as (typeof rows)[number];
    h.store.getState().performBond(pick.option.steps);
    expect(h.store.getState().error).toBeNull();
    expect(stateOf(h).pending?.stage).toBe('position');
    // finish the Graft the way the workbench does, from the legal list, and the bond is used
    const commit = legalOf(h).find((a) => a.t === 'graftPosition') as Action;
    h.store.getState().act(commit);
    expect(stateOf(h).bond).toBe(1);
    expect(stateOf(h).played).toBe(false);
  });
  it('refuses a step that is not legal', async () => {
    const h = await started(DATE, memoryStorage(), ALL);
    h.store.getState().act({ t: 'keep' });
    h.store.getState().performBond([{ t: 'split', m: 9999 }]);
    expect(h.store.getState().error).toBe('That option is no longer available.');
    expect(stateOf(h).pending).toBeNull();
  });
  it('ranks through the ai hint and names the best option', async () => {
    const h = await started(DATE, memoryStorage(), ALL);
    h.store.getState().act({ t: 'keep' });
    const { ctx, rt } = h.store.getState();
    if (ctx === null || rt === null) throw new Error('not booted');
    const preview = rt.engine.bondOptions(stateOf(h));
    const ranking = bondRanking(ctx, rt.engine, stateOf(h), preview);
    expect(ranking.scores.size).toBe(preview.options.length);
    if (ranking.bestId !== null) expect(preview.options.some((o) => o.id === ranking.bestId)).toBe(true);
    const view = bondView(ctx, rt.engine, stateOf(h), preview, ranking);
    expect(view.best?.id ?? null).toBe(ranking.bestId);
  });
  it('plays a whole duel with the bond rules and lanes on, from the legal list alone', async () => {
    const h = await started(DATE, memoryStorage(), [...ALL, 'FLAGS.LANES=true']);
    for (let n = 0; n < 500 && stateOf(h).result === null; n++) {
      const legal = legalOf(h);
      const pick =
        legal.find((a) => a.t === 'keep') ??
        legal.find((a) => a.t === 'split') ??
        legal.find((a) => a.t === 'symbiose') ??
        legal.find((a) => a.t === 'attack') ??
        legal.find((a) => a.t === 'summon' && a.mode === 'atk') ??
        legal.find((a) => a.t === 'endTurn') ??
        (legal[0] as Action);
      h.store.getState().act(pick);
      expect(h.store.getState().error).toBeNull();
    }
    expect(stateOf(h).result).not.toBeNull();
  });
  it('shows no bond action with every switch off', async () => {
    const h = await started(DATE);
    h.store.getState().act({ t: 'keep' });
    const groups = groupLegal(legalOf(h));
    expect(groups.splits.size + groups.symbioses.size).toBe(0);
    expect(stateOf(h).bond).toBe(0);
  });
});

describe('log, cues and undo label for the new events', () => {
  const ev = (...e: GameEvent[]): GameEvent[] => e;
  it('writes a line for each event, with an icon', async () => {
    const h = await started(DATE, memoryStorage(), ALL);
    const { ctx } = h.store.getState();
    if (ctx === null) throw new Error('not booted');
    const s = stateOf(h);
    const lines = logLines(
      ctx,
      s,
      ev(
        { e: 'Split', side: 0, iid: 0, parts: [1, 2], slots: [0, -1], pos: 0 },
        { e: 'Bonded', side: 0, host: 1, symbiote: 2, kw: 0, guard: 4 },
        { e: 'SymbioteEmerged', side: 0, iid: 2, host: 1, slot: 0, cause: 'destroyed' },
        { e: 'Appraised', iid: 1, fromSlot: 0, to: 'vault', toSlot: -1, sym: 2 },
      ),
    );
    expect(lines.map((l) => l.icon)).toEqual(['split', 'link', 'link', 'gavel']);
    expect(lines[0]?.text).toMatch(/split .* into .* and .*\(1 to hand\)/);
    expect(lines[1]?.text).toMatch(/attached .* under /);
    expect(lines[3]?.text).toMatch(/ and .* were taken/);
    expect(undoLabel(ctx, s, [{ action: { t: 'split', m: 1 }, events: [] }])).toMatch(/^Split /);
    expect(undoLabel(ctx, s, [{ action: { t: 'symbiose', c: 1, host: 2 }, events: [] }])).toMatch(/^Attach .* under /);
  });
  it('turns them into cues', () => {
    const cues = cuesFromEvents([
      { e: 'Split', side: 0, iid: 0, parts: [1, 2], slots: [0, 1], pos: 0 },
      { e: 'Bonded', side: 0, host: 1, symbiote: 2, kw: 0, guard: 4 },
      { e: 'SymbioteEmerged', side: 0, iid: 2, host: 1, slot: 0, cause: 'returned' },
    ]);
    expect(cues.map((c) => c.kind)).toEqual(['split', 'split', 'bond', 'enter']);
    expect(cues[0]?.beat).toBe(cues[1]?.beat);
    expect((cues[2]?.beat ?? 0)).toBeGreaterThan(cues[0]?.beat ?? 0);
  });
});

describe('How to play follows the bond switches', () => {
  const text = (o: readonly string[]) => howToPages(ctxFor(o)).flatMap((p) => [p.summary, ...p.lines]).join('\n');
  it('is today\'s copy with every switch off', () => {
    const pages = howToPages(ctxFor(OFF));
    expect(pages.map((p) => p.id)).toEqual(['goal', 'cards', 'combat', 'graft', 'appraisal', 'winning']);
    const t = text(OFF);
    expect(t).toContain('set a trap, or Graft.');
    expect(t).toContain('It is your card play for the turn');
    expect(t).not.toMatch(/Split|Symbiosis|bond/);
  });
  it('adds Split and Symbiosis pages only for their switch, with numbers from the globals', () => {
    const ids = (o: readonly string[]) => howToPages(ctxFor(o)).map((p) => p.id);
    const only = (on: string) => [...OFF.filter((o) => !o.startsWith(`FLAGS.${on}=`)), `FLAGS.${on}=true`];
    expect(ids(only('SPLIT'))).toContain('split');
    expect(ids(only('SPLIT'))).not.toContain('symbiosis');
    expect(ids(only('SYMBIOSIS'))).toContain('symbiosis');
    expect(ids(only('SYMBIOSIS'))).not.toContain('split');
    expect(ids([])).toEqual(expect.arrayContaining(['split', 'symbiosis']));
    const g = ctxFor().globals;
    expect(text([])).toContain(`+${g.SYMBIOSIS_GUARD_BONUS} Guard`);
    expect(text(['SYMBIOSIS_GUARD_BONUS=3'])).toContain('+3 Guard');
    expect(text([])).toContain('any monster attached under it');
  });
  it('names the bond actions in the play sentence without the bond turn, and drops them with it', () => {
    expect(text([...OFF.filter((o) => o.includes('BOND_ACTION')), 'FLAGS.SPLIT=true', 'FLAGS.SYMBIOSIS=true'])).toContain('or use Graft, Split or Symbiosis');
    const on = text(ALL);
    expect(on).toContain('summon a monster, cast a spell or set a trap.');
    expect(on).toContain('Before your first attack you may also make 1 bond action: Graft, Split or Symbiosis, in either order.');
    expect(on).toContain('Your first attack ends the bond for the turn.');
    expect(on).toContain('It is a bond action, so it does not use up your card play');
    expect(on).not.toContain('It is your card play for the turn');
    expect(on).not.toMatch(/[{}|]/);
  });
  it('quizzes the new pages from the globals', () => {
    const ctx = ctxFor(ALL);
    const q = howToQuiz(ctx, 'symbiosis');
    expect(q?.answers.find((a) => a.right)?.label).toBe(String(ctx.globals.SYMBIOSIS_GUARD_BONUS));
    expect(howToQuiz(ctx, 'split')?.answers.filter((a) => a.right)).toHaveLength(1);
    expect(howToQuiz(ctx, 'cards')?.why).toContain('bond actions');
  });
});
