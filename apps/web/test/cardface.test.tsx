// The card face (D-360): the art fills the card; name, element, keywords, turn marks and stats are lettered on top,
// and the stat in play is marked instead of an Attack/Guard badge. Inspect draws the same card, large.
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as content from '@vault-duel/content';
import type { Monster } from '@vault-duel/engine';
import { loadGameContent } from '../src/content/load';
import { definitionView } from '../src/view/cards';
import { MiniCard } from '../src/ui/MiniCard';
import { InspectCard } from '../src/ui/Inspect';
import { StoreContext } from '../src/ui/context';
import { started } from './helpers';

const loaded = loadGameContent(content);
if (!loaded.ok) throw new Error(loaded.lines.join('\n'));
const ctx = loaded.ctx;
const noop = (): void => undefined;
const monster = (pos: 0 | 1, faceDown = false): Monster => ({
  iid: 1, pos, faceDown, entered: 0, repositioned: -1, attacked: -1, wardUsed: false, permP: 0, permG: 0, timed: [], unstableUntil: -1, shroudUntil: -1, appraised: false, sym: -1,
});
const firstMonster = (): string => {
  for (const info of ctx.cards.values()) if (info.type === 'monster' && info.flaw === null && info.keywords.length > 0) return info.id;
  throw new Error('no monster with a keyword');
};
const view = definitionView(ctx, firstMonster());
if (view === null) throw new Error('no view');
const html = (m?: Monster): string => renderToString(<MiniCard view={view} monster={m} side="me" onTap={noop} onLong={noop} />);
const onStat = (out: string): string | null => /<span class="stat (p|g)" data-on=""/.exec(out)?.[1] ?? null;

describe('card face (D-360)', () => {
  it('letters the name, icons and stats on the art, with no shade over it', () => {
    const out = html(monster(0));
    for (const part of ['mini-name', 'mini-icons', 'mini-stats', 'kw-glyph', 'class="gem"']) expect(out).toContain(part);
    expect(out).not.toContain('mini-shade');
    expect(out).not.toContain('mini-col');
    expect(out.indexOf('mini-clip')).toBeLessThan(out.indexOf('mini-name'));
  });
  it('marks the stat in play instead of drawing an Attack/Guard badge', () => {
    expect(onStat(html(monster(0)))).toBe('p');
    expect(onStat(html(monster(1)))).toBe('g');
    expect(onStat(html(monster(1, true)))).toBe('g');
    // a card in the hand, the Bestiary or the primer has no position, so neither stat is marked
    expect(onStat(html())).toBeNull();
    for (const out of [html(monster(0)), html(monster(1))]) expect(out).not.toMatch(/class="tag" title="(Attack|Guard) position"/);
    // the position is still spoken
    expect(html(monster(1))).toContain('Guard position');
  });
  it('shows turn marks only when there is one', () => {
    expect(html(monster(0))).not.toContain('mini-marks');
    const marked = renderToString(<MiniCard view={view} monster={monster(0)} side="me" moved attacked onTap={noop} onLong={noop} />);
    expect(marked).toContain('mini-marks');
    expect(marked).toContain('data-moved');
    expect(marked).toContain('data-attacked');
  });
  it('keeps the whole name on one line, never shortened (owner: one line, like Yu-Gi-Oh)', () => {
    const out = html(monster(0));
    expect(out).toContain(`<span class="mini-name"><span class="mini-name-text">${view.name}</span></span>`);
    const css = readFileSync(new URL('../src/style/card.css', import.meta.url), 'utf8');
    const rule = /\.mini-name \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('white-space: nowrap');
    expect(css).not.toMatch(/\.mini-name[^{]*\{[^}]*(text-overflow|line-clamp)/);
  });
  it('outlines the lettering in paper, and reverses the stat in play', () => {
    const css = readFileSync(new URL('../src/style/card.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.mini-name,\s*\.mini-stats b \{\s*text-shadow:/);
    expect(css).toMatch(/\.mini-stats \.stat\[data-on\] \{\s*--fc: var\(--card\);\s*--hc: var\(--ink\);/);
  });
  it('draws the card large at the top of Inspect', async () => {
    const h = await started('2026-10-14');
    const state = h.store.getState().state;
    if (state === null) throw new Error('no state');
    const iid = state.sides[0].hand[0];
    if (iid === undefined) throw new Error('no hand');
    const out = renderToString(<StoreContext.Provider value={{ ...h.store, getInitialState: h.store.getState }}><InspectCard iid={iid} /></StoreContext.Provider>);
    expect(out).toContain('class="inspect-hero"');
    expect(out).toMatch(/class="inspect-hero"[^>]*><button type="button" class="mini large"/);
    expect(out.indexOf('inspect-hero')).toBeLessThan(out.indexOf('inspect-title'));
  });
});
