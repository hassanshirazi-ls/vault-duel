import * as content from '@vault-duel/content';
import { describe, expect, it } from 'vitest';
import { loadGameContent } from '../src/content/load';
import { renderToString } from 'react-dom/server';
import { App } from '../src/ui/App';
import { StoreContext } from '../src/ui/context';
import { shareText } from '../src/view/share';
import { howToPages } from '../src/view/howto';
import { makeStore, simplePick } from './helpers';

const OFF = ['FLAGS.BONUS_OBJECTIVES=false'];
const ctxFor = (o: readonly string[] = []) => {
  const r = loadGameContent(content, o);
  if (!r.ok) throw new Error(r.lines.join('\n'));
  return r.ctx;
};
type Booted = ReturnType<typeof makeStore>;
const html = (h: Booted): string =>
  renderToString(
    <StoreContext.Provider value={{ ...h.store, getInitialState: h.store.getState }}>
      <App />
    </StoreContext.Provider>,
  );

const base = { date: '2026-10-20', won: true, rounds: 9, maxRounds: 12, par: 8, life: 9, stars: 1, starsMax: 2, row: 'ROW', url: 'U' };

describe('FLAGS.BONUS_OBJECTIVES', () => {
  it('keeps the share line as-is when on, and drops the stars when off', () => {
    expect(shareText(base).split('\n')[2]).toBe('❤️ 9 life · par 8 · ★☆');
    expect(shareText({ ...base, showStars: true }).split('\n')[2]).toBe('❤️ 9 life · par 8 · ★☆');
    expect(shareText({ ...base, showStars: false }).split('\n')[2]).toBe('❤️ 9 life · par 8');
  });

  it('leaves the objectives line out of How to play when off', () => {
    const text = (c: ReturnType<typeof ctxFor>) => howToPages(c).flatMap((p) => p.lines).join('\n');
    expect(text(ctxFor())).toContain('bonus objective');
    expect(text(ctxFor(OFF))).not.toMatch(/bonus objective|a star for/i);
  });

  it('shows objectives on Home, Result and Stats only when on, and records 0 stars when off', async () => {
    for (const on of [true, false]) {
      const h = makeStore('2026-10-14', undefined, on ? [] : OFF);
      await h.store.getState().boot();
      h.store.getState().closeHowTo();
      expect(html(h).includes('Bonus</b>')).toBe(on);
      h.store.getState().start();
      for (let i = 0; i < 600 && h.store.getState().state?.result === null; i++) h.store.getState().act(simplePick(h.store.getState().legal));
      const result = html(h);
      expect(result.includes('receipt-objectives')).toBe(on);
      const day = h.store.getState().stats.days['2026-10-14'];
      if (!on) expect(day?.stars).toBe(0);
      h.store.getState().openScreen('stats');
      expect(html(h).includes('Bonus stars')).toBe(on);
    }
  });
});
