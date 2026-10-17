import * as content from '@vault-duel/content';
import { describe, expect, it } from 'vitest';
import { loadGameContent } from '../src/content/load';
import { howToPages, howToQuiz, howToSamples, joinList, keywordGlossary } from '../src/view/howto';
import { makeStore } from './helpers';

const ctxFor = (overrides: readonly string[] = []) => {
  const r = loadGameContent(content, overrides);
  if (!r.ok) throw new Error(r.lines.join('\n'));
  return r.ctx;
};

// The pre-flip rules (the live defaults since 2026-10-16 have lanes, sickness and the bond rules on)
const OFF = ['FLAGS.LANES=false', 'FLAGS.SPLIT=false', 'FLAGS.SYMBIOSIS=false', 'FLAGS.BOND_ACTION=false', 'FLAGS.TURN_SLOTS=false', 'SICKNESS_MODE=classic'];

describe('How to play copy', () => {
  it('has the six pages in order, with no unrendered placeholder', () => {
    const pages = howToPages(ctxFor(OFF));
    expect(pages.map((p) => p.id)).toEqual(['goal', 'cards', 'combat', 'graft', 'appraisal', 'winning', 'keywords']);
    const live = howToPages(ctxFor());
    expect(live.map((p) => p.id)).toEqual(['goal', 'cards', 'combat', 'lanes', 'bonds', 'graft', 'split', 'symbiosis', 'appraisal', 'winning', 'keywords']);
    for (const p of live) for (const l of p.lines) expect(l).not.toMatch(/[{}|]/);
    for (const p of pages) for (const l of p.lines) expect(l).not.toMatch(/[{}|]/);
  });
  it('reads every number from the globals', () => {
    const ctx = ctxFor();
    const g = ctx.globals;
    const text = howToPages(ctx).flatMap((p) => p.lines).join('\n');
    expect(text).toContain(`${g.PLAYER_LIFE} life`);
    expect(text).toContain(`${g.COLLECTOR_LIFE}`);
    expect(text).toContain(`round ${g.MAX_ROUNDS}`);
    expect(text).toContain(`rounds ${joinList(g.APPRAISAL_ROUNDS)}`);
    expect(text).toContain(`Power ${g.APPRAISAL_MIN_POWER} or more`);
    expect(text).toContain(`+${g.ELEMENT_BONUS} Power`);
    expect(text).toContain(`+${g.UNSTABLE_BONUS} Power`);
    expect(text).toContain(`${g.DECK_MONSTERS + g.DECK_SPELLS + g.DECK_TRAPS} cards`);
  });
  it('follows a tuned number', () => {
    const text = howToPages(ctxFor(['PLAYER_LIFE=17', 'APPRAISAL_ROUNDS=[4,8]'])).flatMap((p) => p.lines).join('\n');
    expect(text).toContain('17 life');
    expect(text).toContain('rounds 4 and 8');
  });
  it('drops a page and lines whose feature flag is off', () => {
    const pages = howToPages(ctxFor(['FLAGS.APPRAISAL=false', 'FLAGS.UNSTABLE=false', 'FLAGS.ASCEND=false']));
    expect(pages.some((p) => p.id === 'appraisal')).toBe(false);
    const graft = pages.find((p) => p.id === 'graft')?.lines.join('\n') ?? '';
    expect(graft).not.toContain('Unstable');
    expect(graft).not.toContain('Ascend');
  });
  it('teaches lanes and sickness only when those rules are on', () => {
    // the keyword glossary quotes each keyword's own card text (Sentinel's names lanes), so it is left out here
    const text = (o: readonly string[]) => howToPages(ctxFor(o)).filter((p) => p.id !== 'keywords').flatMap((p) => p.lines).join('\n');
    expect(howToPages(ctxFor(OFF)).some((p) => p.id === 'lanes')).toBe(false);
    expect(text(OFF)).not.toMatch(/lane|just summoned/);
    const on = text([]);
    expect(on).toContain('only attack the monster across');
    expect(on).toContain('up to 1 lane sideways');
    expect(on).toContain('just summoned may attack monsters but not life');
    expect(text(['LANE_MOVE_RANGE=2'])).toContain('up to 2 lanes sideways');
    expect(on).not.toMatch(/[{}|]/);
  });
  it('teaches lanes, the bond turn and every keyword on their own pages', () => {
    const ctx = ctxFor();
    const pages = howToPages(ctx);
    const page = (id: string) => pages.find((p) => p.id === id);
    expect(page('lanes')?.lines.join('\n')).toContain(`within ${ctx.globals.SENTINEL_REACH} lane of it`);
    const bonds = page('bonds')?.lines.join('\n') ?? '';
    expect(bonds).toContain('Graft, Split or Symbiosis');
    expect(bonds).toContain('Attacking closes nothing');
    expect(bonds).toContain('marked Best');
    expect(page('bonds')?.title).toBe('Your turn');
    const keywords = page('keywords');
    expect(keywords?.open).toBe(true);
    expect(keywords?.lines.length).toBe(ctx.content.keywords.length);
    expect(keywords?.lines.join('\n')).toMatch(/^Sentinel: /m);
    expect(keywords?.lines.join('\n')).toMatch(/\(Flaw\): /);
    for (const p of pages) for (const l of [p.summary, ...p.lines]) expect(l).not.toMatch(/[{}|]/);
    expect(howToQuiz(ctx, 'lanes')?.answers.filter((a) => a.right)).toHaveLength(1);
    expect(howToQuiz(ctx, 'bonds')?.answers.filter((a) => a.right)).toHaveLength(1);
    const kq = howToQuiz(ctx, 'keywords');
    expect(kq?.answers.filter((a) => a.right).map((a) => a.label)).toEqual([keywordGlossary(ctx).find((k) => k.flaw)?.name]);
  });
  it('teaches the turn slots (D-335): one monster, one spell or trap, one bond, any order', () => {
    const ctx = ctxFor();
    const text = howToPages(ctx).flatMap((p) => [p.summary, ...p.lines]).join('\n');
    expect(text).toContain('summon one monster and play one spell or trap');
    expect(text).toContain('Monster: summon one monster a turn.');
    expect(text).toContain('Spell/Trap: cast one spell or set one trap a turn.');
    expect(text).toContain('under the Bond button beside End turn');
    expect(text).toContain('not after it has attacked');
    expect(text).toContain('only way an attack goes to the side');
    expect(text).toContain('direct hit on his life needs his whole monster board to be empty');
    expect(text).not.toContain('first attack closes');
    expect(howToQuiz(ctx, 'cards')?.answers.find((a) => a.right)?.label).toBe('Yes, a spell or trap is its own slot');
    expect(howToQuiz(ctx, 'bonds')?.answers.find((a) => a.right)?.label).toBe('Yes, any order');
    const old = howToPages(ctxFor(['FLAGS.TURN_SLOTS=false']));
    expect(old.find((p) => p.id === 'bonds')?.title).toBe('Play and bond');
  });
  it('points the combat page at the in-duel compass', () => {
    const text = howToPages(ctxFor()).find((p) => p.id === 'combat')?.lines.join('\n') ?? '';
    expect(text).toContain('compass beside the hint');
    expect(text).not.toContain('strip');
  });
  it('joins lists', () => {
    expect(joinList([3, 6, 9])).toBe('3, 6 and 9');
    expect(joinList([5])).toBe('5');
  });
  it('finds sample cards and a Graft example in the content', () => {
    const ctx = ctxFor();
    const s = howToSamples(ctx);
    expect(s.monsters.length).toBe(ctx.globals.BOARD_SLOTS);
    expect(s.graft?.result.element?.id).toBe(s.graft?.a.element?.id);
  });
});

describe('How to play in the store', () => {
  it('opens on first Home, closes and stays closed after a reboot, reopens on demand', async () => {
    const h = makeStore('2026-10-14');
    await h.store.getState().boot();
    expect(h.store.getState().howTo).toBe(true);
    h.store.getState().closeHowTo();
    expect(h.store.getState().howTo).toBe(false);
    await h.store.getState().boot();
    expect(h.store.getState().howTo).toBe(false);
    h.store.getState().openHowTo();
    expect(h.store.getState().howTo).toBe(true);
  });
});
