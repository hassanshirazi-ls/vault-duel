import { describe, expect, it } from 'vitest';
import * as content from '@vault-duel/content';
import { loadGameContent } from '../src/content/load';
import { cardView, keywordViews } from '../src/view/cards';
import { appraisalCountdown } from '../src/view/status';
import { groupLegal } from '../src/view/legal';
import { started } from './helpers';

const loaded = loadGameContent(content);
if (!loaded.ok) throw new Error(loaded.lines.join('\n'));
const ctx = loaded.ctx;

describe('content text (D-172)', () => {
  it('renders every keyword and card text with no placeholder left', () => {
    for (const k of ctx.content.keywords) expect(ctx.render(k.text)).not.toMatch(/[{}]/);
    for (const c of ctx.cards.values()) if (c.text !== null) expect(ctx.render(c.text)).not.toMatch(/[{}]/);
  });
  it('keyword views follow the mask bit order', () => {
    const bit = ctx.content.kwBit['haunt'] as number;
    expect(keywordViews(ctx, 1 << bit).map((k) => k.id)).toEqual(['haunt']);
  });
});

describe('appraisal countdown', () => {
  it('points at the next appraisal round from the globals', async () => {
    const h = await started('2026-10-14');
    const s = h.store.getState();
    const first = ctx.globals.APPRAISAL_ROUNDS[0] as number;
    const c = appraisalCountdown(ctx.globals, s.state as NonNullable<typeof s.state>);
    expect(c).toEqual({ round: first, roundsAway: first - 1 });
  });
});

describe('legal grouping', () => {
  it('puts every legal action in exactly one place', async () => {
    const h = await started('2026-10-14');
    const s = h.store.getState();
    s.act({ t: 'keep' });
    const legal = h.store.getState().legal;
    const g = groupLegal(legal);
    let count = (g.endTurn ? 1 : 0) + (g.graftBegin ? 1 : 0) + (g.graftCancel ? 1 : 0) + g.graftKeywords.length + g.graftPositions.length;
    for (const m of [g.summons, g.summonCovetous, g.casts, g.attacks]) for (const list of m.values()) count += list.length;
    count += g.setTraps.size + g.repositions.size + g.graftPicks.size + (g.graftSkipAscend ? 1 : 0) + (g.keep ? 1 : 0) + (g.redraw ? 1 : 0);
    expect(count).toBe(legal.length);
  });
  it('builds a card view for a hand card', async () => {
    const h = await started('2026-10-14');
    const { state, rt } = h.store.getState();
    const iid = state?.sides[0].hand[0] as number;
    const v = cardView(ctx, rt?.engine as NonNullable<typeof rt>['engine'], state as NonNullable<typeof state>, iid);
    expect(v.name.length).toBeGreaterThan(0);
  });
});
