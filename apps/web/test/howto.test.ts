import * as content from '@vault-duel/content';
import { describe, expect, it } from 'vitest';
import { loadGameContent } from '../src/content/load';
import { howToPages, howToSamples, joinList } from '../src/view/howto';
import { makeStore } from './helpers';

const ctxFor = (overrides: readonly string[] = []) => {
  const r = loadGameContent(content, overrides);
  if (!r.ok) throw new Error(r.lines.join('\n'));
  return r.ctx;
};

describe('How to play copy', () => {
  it('has the six pages in order, with no unrendered placeholder', () => {
    const pages = howToPages(ctxFor());
    expect(pages.map((p) => p.id)).toEqual(['goal', 'cards', 'combat', 'graft', 'appraisal', 'winning']);
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
    const text = (o: readonly string[]) => howToPages(ctxFor(o)).flatMap((p) => p.lines).join('\n');
    expect(text([])).not.toMatch(/lane|just summoned/);
    const on = text(['FLAGS.LANES=true', 'SICKNESS_MODE=monstersOnly']);
    expect(on).toContain('only attack the monster across');
    expect(on).toContain('up to 1 lane sideways');
    expect(on).toContain('just summoned may attack monsters but not life');
    expect(text(['FLAGS.LANES=true', 'LANE_MOVE_RANGE=2'])).toContain('up to 2 lanes sideways');
    expect(on).not.toMatch(/[{}|]/);
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
