// The royal court reskin (D-349..D-353): levy lines, the crown badge and its inspect line, the ink-pattern element
// tokens, the words, and a guard that no gilt-era token or CDN font is left behind.
import { readFileSync, readdirSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as content from '@vault-duel/content';
import type { GameEvent } from '@vault-duel/engine';
import { MOOD_NAMES } from '@vault-duel/ai';
import { loadGameContent } from '../src/content/load';
import { HOWTO_VERSION } from '../src/persistence/howto';
import { isCrowned } from '../src/view/cards';
import { CROWN_LINE } from '../src/view/copy';
import { howToPages } from '../src/view/howto';
import { quipLines } from '../src/visual/cues';
import { elementPatternVar, elementStyle } from '../src/visual/elements';
import { App } from '../src/ui/App';
import { StoreContext } from '../src/ui/context';
import { InspectCard } from '../src/ui/Inspect';
import { simplePick, started } from './helpers';

const loaded = loadGameContent(content);
if (!loaded.ok) throw new Error(loaded.lines.join('\n'));
const ctx = loaded.ctx;
const css = (name: string): string => readFileSync(new URL(`../src/style/${name}`, import.meta.url), 'utf8');

const DIALOGUE = { composed: ['calm one', 'calm two'], agitated: ['sharp'], desperate: ['wild'], levy: ['levy one', 'levy two', 'levy three'] };
const lines = (events: GameEvent[], dialogue: Parameters<typeof quipLines>[2] = DIALOGUE, mood = 0) => quipLines(events, mood, dialogue, MOOD_NAMES);

describe('levy lines (D-352)', () => {
  const attempt: GameEvent = { e: 'AppraisalAttempt', round: 3 };
  const taken: GameEvent = { e: 'Appraised', iid: 7, fromSlot: 1, to: 'board', toSlot: 0 };

  it('uses the levy list when the step took a monster', () => {
    expect(lines([attempt, taken])).toEqual(DIALOGUE.levy);
  });
  it('keeps the mood list for a failed levy, a mood shift and the start of the duel', () => {
    expect(lines([attempt])).toEqual(DIALOGUE.composed);
    expect(lines([{ e: 'MoodChanged', from: 0, to: 2 }])).toEqual(DIALOGUE.desperate);
    expect(lines([{ e: 'GameStarted' } as GameEvent], DIALOGUE, 1)).toEqual(DIALOGUE.agitated);
  });
  it('falls back to the mood list when levy is missing or empty', () => {
    const noLevy = { composed: DIALOGUE.composed, agitated: DIALOGUE.agitated, desperate: DIALOGUE.desperate };
    expect(lines([attempt, taken], noLevy)).toEqual(DIALOGUE.composed);
    expect(lines([attempt, taken], { ...DIALOGUE, levy: [] })).toEqual(DIALOGUE.composed);
  });
  it('says nothing when there is nothing to say', () => {
    expect(lines([{ e: 'TurnEnded', turn: 1 }])).toBeUndefined();
    expect(lines([attempt], {})).toBeUndefined();
  });
  it('is deterministic: the caller indexes by the action count, so the same step always speaks the same line', () => {
    const pick = (n: number): string => {
      const l = lines([attempt, taken]) as readonly string[];
      return l[n % l.length] as string;
    };
    expect([0, 1, 2, 3, 4].map(pick)).toEqual(['levy one', 'levy two', 'levy three', 'levy one', 'levy two']);
    expect(pick(7)).toBe(pick(7));
  });
  it('the shipped collector.json has a levy list and every line renders', () => {
    const levy = ctx.dialogue['levy'];
    expect(levy?.length).toBeGreaterThan(0);
    for (const l of levy ?? []) expect(ctx.render(l)).not.toMatch(/[{}]/);
  });
});

describe('the crown (D-349)', () => {
  const g = ctx.globals;
  const flagOff = { ...g, FLAGS: { ...g.FLAGS, CROWNED: false } };
  const m = { appraised: true } as Parameters<typeof isCrowned>[2];
  it('is shown only for a levied monster on the Monarch board while the flag is on', () => {
    expect(g.FLAGS.CROWNED).toBe(true);
    expect(isCrowned(g, 1, m)).toBe(true);
    expect(isCrowned(g, 0, m)).toBe(false);
    expect(isCrowned(g, 1, { appraised: false } as Parameters<typeof isCrowned>[2])).toBe(false);
    expect(isCrowned(g, 1, null)).toBe(false);
    expect(isCrowned(flagOff, 1, m)).toBe(false);
  });
  it('renders the line from CROWN_POWER, never a typed number', () => {
    expect(CROWN_LINE).toContain('{CROWN_POWER}');
    expect(ctx.render(CROWN_LINE)).toBe(`Crowned: +${g.CROWN_POWER} Power while it serves the Monarch`);
  });

  /** A real duel run until the Monarch has a monster, which is then marked as levied. */
  async function crownedDuel() {
    const h = await started('2026-10-14');
    for (let i = 0; i < 300; i++) {
      const s = h.store.getState();
      const board = s.state?.sides[1].board ?? [];
      if (board.some((b) => b !== null && !b.faceDown)) break;
      s.act(simplePick(s.legal));
    }
    const state = h.store.getState().state;
    if (state === null) throw new Error('no state');
    const slot = state.sides[1].board.findIndex((b) => b !== null && !b.faceDown);
    expect(slot).toBeGreaterThanOrEqual(0);
    const mon = state.sides[1].board[slot];
    if (mon === null || mon === undefined) throw new Error('no monster');
    const board = state.sides[1].board.map((b, i) => (i === slot ? { ...b, appraised: true } : b));
    const patched = { ...state, sides: [state.sides[0], { ...state.sides[1], board }] as unknown as typeof state.sides };
    return { h, state, patched, iid: mon.iid };
  }
  const render = (h: Awaited<ReturnType<typeof started>>, node: React.ReactNode): string =>
    renderToString(<StoreContext.Provider value={{ ...h.store, getInitialState: h.store.getState }}>{node}</StoreContext.Provider>);

  it('shows the badge on the mini card and the inspect line, and the Power already includes the crown', async () => {
    const { h, state, patched, iid } = await crownedDuel();
    const rt = h.store.getState().rt;
    if (rt === null) throw new Error('no runtime');
    const plain = render(h, <App />);
    expect(plain).not.toContain('data-crown');

    h.store.setState({ state: patched });
    const duel = render(h, <App />);
    expect(duel).toContain('data-crown');
    expect(duel).toContain('Crowned');
    const inspect = render(h, <InspectCard iid={iid} />);
    expect(inspect).toContain(`Crowned: +${ctx.globals.CROWN_POWER} Power while it serves the Monarch`);
    expect(rt.engine.effectivePower(patched, iid)).toBe(rt.engine.effectivePower(state, iid) + ctx.globals.CROWN_POWER);

    h.store.setState({ state, ctx: { ...ctx, globals: withoutCrown(ctx.globals) } });
    expect(render(h, <InspectCard iid={iid} />)).not.toContain('Crowned:');
  });
});

function withoutCrown(g: typeof ctx.globals): typeof ctx.globals {
  return { ...g, FLAGS: { ...g.FLAGS, CROWNED: false } };
}

describe('element ink patterns (D-351, behind the placeholder art)', () => {
  it('keys a pattern per element id, with a neutral fallback', () => {
    expect(elementPatternVar('tide')).toBe('var(--el-pat-tide, var(--el-pat-neutral))');
    expect(elementPatternVar(null)).toBe('var(--el-pat-neutral)');
    expect(elementPatternVar('x;y')).toBe('var(--el-pat-neutral)');
    expect(elementStyle('gale')).toMatchObject({ '--elp': 'var(--el-pat-gale, var(--el-pat-neutral))' });
  });
  it('tokens.css defines a pattern for every element in the content and the neutral one', () => {
    const tokens = css('tokens.css');
    expect(tokens).toContain('--el-pat-neutral:');
    for (const e of ctx.elements.values()) expect(tokens, e.id).toContain(`--el-pat-${e.id}:`);
  });
});

describe('element badge tones (D-361)', () => {
  // WCAG relative luminance of a #rrggbb token, and the contrast ratio of two of them
  const lum = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const token = (tokens: string, name: string): string => {
    const hex = new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(tokens)?.[1];
    if (hex === undefined) throw new Error(`no --${name} hex token`);
    return hex;
  };
  it('every element in the content and the neutral one has a tone, with its icon ink at 3:1 or more', () => {
    const tokens = css('tokens.css');
    for (const id of [...[...ctx.elements.values()].map((e) => e.id), 'neutral']) {
      expect(contrast(token(tokens, `el-${id}`), token(tokens, `el-on-${id}`)), id).toBeGreaterThanOrEqual(3);
    }
  });
  it('the badge is filled with the tone and drawn in its ink', () => {
    expect(css('base.css')).toMatch(/\.gem \{[^}]*background: var\(--el, var\(--el-neutral\)\);[^}]*color: var\(--el-on, var\(--el-on-neutral\)\);/);
  });
});

describe('words and look (D-350, D-351, D-353)', () => {
  const OLD = /Collector|Apprais|Relic|Unpriced|Binder|Signature|auction|catalog|gavel|Insurance Claim|Bill of sale|Forfeit/;
  it('How to play uses only the court words and the crown sentence, at version 5', () => {
    const pages = howToPages(ctx);
    const text = JSON.stringify(pages);
    expect(text).not.toMatch(OLD);
    const levy = pages.find((p) => p.id === 'appraisal');
    expect(levy?.title).toBe('Levy');
    expect(levy?.summary).toContain(`+${ctx.globals.CROWN_POWER} Power while it serves him`);
    expect(HOWTO_VERSION).toBe(5);
  });
  it('the web manifest and the page carry the tagline', () => {
    const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8')) as { description: string; name: string };
    expect(manifest.description).toBe('Defy the Monarch, a few minutes a day.');
    expect(manifest.name).toBe('Vault Duel');
    expect(readFileSync(new URL('../index.html', import.meta.url), 'utf8')).toContain('content="Defy the Monarch, a few minutes a day."');
  });
  it('no gilt, velvet or jewel token is left in the stylesheets, and fonts are self-hosted', () => {
    const dir = new URL('../src/style/', import.meta.url);
    for (const f of readdirSync(dir)) {
      const text = readFileSync(new URL(f, dir), 'utf8');
      expect(text, f).not.toMatch(/var\(--(gold|bone|soot|oxblood|brass|iron|gilt|moth|thorns|rivets)/);
      expect(text, f).not.toMatch(/https?:\/\//);
    }
    const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
    for (const font of ['grenze-gotisch', 'spectral', 'ibm-plex-sans-condensed']) expect(main).toContain(`@fontsource/${font}/`);
    const tokens = css('tokens.css');
    expect(tokens).toContain("'Grenze Gotisch'");
    expect(tokens).toContain("'Spectral'");
    expect(tokens).toContain("'IBM Plex Sans Condensed'");
  });
  it('the board drift and the spiral stop with the animations flag and under reduced motion, and never take input', () => {
    const ink = css('ink.css');
    expect(ink).toContain("[data-anim='off'] .drift");
    expect(ink).toContain('prefers-reduced-motion: reduce');
    expect(ink).toMatch(/\.spiral-wrap \{[^}]*pointer-events: none/);
    expect(css('tokens.css')).toContain('--drift: 5.5s');
  });
});

describe('drift wrapper and slot glow (D-355, QA 2026-10-18)', () => {
  it('no stylesheet targets a niche child directly, since every niche child sits inside .drift', () => {
    for (const name of readdirSync(new URL('../src/style/', import.meta.url)).filter((f) => f.endsWith('.css'))) {
      expect(css(name), name).not.toMatch(/\.niche:has\(\s*>/);
    }
  });
});

