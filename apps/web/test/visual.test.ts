import { describe, expect, it } from 'vitest';
import * as content from '@vault-duel/content';
import { loadGameContent } from '../src/content/load';
import { definitionView, keywordViews } from '../src/view/cards';
import type { KeywordView } from '../src/view/cards';
import { objectiveMet } from '../src/view/objectives';
import { planFor } from '../src/view/selection';
import { elementColorVar, elementInkVar } from '../src/visual/elements';
import { readFileSync } from 'node:fs';
import { cueDurationMs, cuesFromEvents, quipMood, TIMING } from '../src/visual/cues';
import { frameFor } from '../src/visual/keywordFrame';
import { logLines } from '../src/view/log';
import { roundTrack } from '../src/visual/roundTrack';
import { hasGlyph } from '../src/visual/glyphs';
import { started } from './helpers';

const loaded = loadGameContent(content);
if (!loaded.ok) throw new Error(loaded.lines.join('\n'));
const ctx = loaded.ctx;

const kw = (id: string, flaw = false): KeywordView => ({ id, name: id, icon: id, visual: `${id}-v`, flaw, text: '' });

describe('element tokens', () => {
  it('keys the color token by element id and falls back to neutral', () => {
    expect(elementColorVar('ember')).toBe('var(--el-ember, var(--el-neutral))');
    expect(elementInkVar('ember')).toBe('var(--el-on-ember, var(--el-on-neutral))');
    expect(elementColorVar(null)).toBe('var(--el-neutral)');
    expect(elementColorVar('not a safe id;')).toBe('var(--el-neutral)');
  });
  it('has a token for every element in content', () => {
    for (const e of ctx.elements.values()) expect(elementColorVar(e.id)).toContain(`--el-${e.id}`);
  });
});

describe('keyword frame priority (D-238)', () => {
  it('shows Sentinel over Ward over the rest, with both glyphs', () => {
    expect(frameFor([kw('swift'), kw('sentinel')]).visual).toBe('sentinel-v');
    expect(frameFor([kw('pierce'), kw('ward')]).visual).toBe('ward-v');
    expect(frameFor([kw('ward'), kw('sentinel')]).glyphs.map((k) => k.id)).toEqual(['sentinel', 'ward']);
    expect(frameFor([kw('swift'), kw('echo')]).visual).toBe('swift-v');
  });
  it('gives a Flaw its own frame only when no keyword competes, and no frame for none', () => {
    expect(frameFor([kw('slow', true)])).toMatchObject({ visual: null, flawVisual: 'slow-v' });
    expect(frameFor([])).toMatchObject({ visual: null, flawVisual: null });
  });
  it('has a glyph for every keyword and Flaw icon in content, or falls back safely', () => {
    const missing = ctx.content.keywords.filter((k) => !hasGlyph(k.icon)).map((k) => k.icon);
    expect(missing).toEqual([]);
    expect(hasGlyph('nonexistent-icon')).toBe(false);
  });
  it('carries the visual id from content', () => {
    const bit = ctx.content.kwBit['sentinel'] as number;
    expect(keywordViews(ctx, 1 << bit)[0]?.visual).toBe('iron-shield-border');
  });
});

describe('round track from content', () => {
  it('marks Appraisal rounds from APPRAISAL_ROUNDS and the vault on the last round', () => {
    const marks = roundTrack(ctx.globals, 4);
    expect(marks).toHaveLength(ctx.globals.MAX_ROUNDS);
    expect(marks.filter((m) => m.appraisal).map((m) => m.round)).toEqual([...ctx.globals.APPRAISAL_ROUNDS]);
    expect(marks.filter((m) => m.vault).map((m) => m.round)).toEqual([ctx.globals.MAX_ROUNDS]);
    expect(marks.filter((m) => m.current).map((m) => m.round)).toEqual([4]);
  });
  it('follows an edited globals object and the APPRAISAL flag', () => {
    const g = { ...ctx.globals, APPRAISAL_ROUNDS: [2, 5], MAX_ROUNDS: 8 };
    expect(roundTrack(g, 1).filter((m) => m.appraisal).map((m) => m.round)).toEqual([2, 5]);
    expect(roundTrack(g, 1)).toHaveLength(8);
    const off = { ...ctx.globals, FLAGS: { ...ctx.globals.FLAGS, APPRAISAL: false } };
    expect(roundTrack(off, 1).some((m) => m.appraisal)).toBe(false);
  });
});

describe('cues from events', () => {
  it('maps events to beats, one after the other, with no cap', () => {
    const cues = cuesFromEvents([
      { e: 'Summoned', side: 0, iid: 3, slot: 0, pos: 0, faceDown: false },
      { e: 'AttackDeclared', attacker: 3, target: 9 },
      { e: 'Damage', side: 1, amount: 4, source: 3, lifeAfter: 20 },
    ]);
    expect(cues.map((c) => c.kind)).toEqual(['enter', 'lunge', 'damage']);
    expect(cues.map((c) => c.beat)).toEqual([0, 1, 2]);
    const many = cuesFromEvents(Array.from({ length: 20 }, (_, i) => ({ e: 'Summoned' as const, side: 1 as const, iid: i, slot: 0, pos: 0 as const, faceDown: false })));
    expect(many.map((c) => c.beat)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(cueDurationMs(many)).toBe(20 * TIMING.BEAT_MS + TIMING.TAIL_MS);
  });
  it('keeps CSS and JS on the same beat (tokens.css --cue)', () => {
    const css = readFileSync(new URL('../src/style/tokens.css', import.meta.url), 'utf8');
    expect(css).toContain(`--cue: ${TIMING.BEAT_MS}ms;`);
  });
  it('gives the slow animations room before the next beat', () => {
    const cues = cuesFromEvents([
      { e: 'Destroyed', iid: 4, side: 1, cause: 'combat', by: 2 },
      { e: 'Summoned', side: 0, iid: 3, slot: 0, pos: 0, faceDown: false },
    ]);
    expect(cues.map((c) => c.beat)).toEqual([0, 2]);
  });
  it('burns destroyed cards and has a shadow hand take appraised ones', () => {
    const cues = cuesFromEvents([
      { e: 'Destroyed', iid: 4, side: 1, cause: 'combat', by: 2 },
      { e: 'Appraised', iid: 7, fromSlot: 1, to: 'board', toSlot: 0 },
    ]);
    expect(cues.map((c) => c.kind)).toEqual(['burn', 'taken', 'arrive']);
    // the hand lifts it at once; the card arrives on his side one beat later
    expect(cues[2]?.beat).toBe((cues[1]?.beat ?? 0) + 1);
  });
  it('speaks on a mood shift or a levy attempt, not otherwise', () => {
    expect(quipMood([{ e: 'MoodChanged', from: 0, to: 2 }], 2)).toBe(2);
    expect(quipMood([{ e: 'AppraisalAttempt', round: 3 }], 1)).toBe(1);
    expect(quipMood([{ e: 'TurnEnded', turn: 1 }], 0)).toBeNull();
  });
});

describe('duel log lines', () => {
  it('describes events with names from content and numbers from the events', async () => {
    const h = await started('2026-10-14');
    const state = h.store.getState().state as NonNullable<ReturnType<typeof h.store.getState>['state']>;
    const lines = logLines(ctx, state, [
      { e: 'Damage', side: 0, amount: 3, source: -1, lifeAfter: 17 },
      { e: 'AppraisalAttempt', round: 3 },
      { e: 'CardDrawn', side: 0, iid: 0, byEffect: false },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['You took 3 damage', 'The Monarch levies']);
    expect(lines.every((l) => hasGlyph(l.icon))).toBe(true);
  });
});

describe('selection plan', () => {
  it('only offers actions that are in the legal list', async () => {
    const h = await started('2026-10-14');
    h.store.getState().act({ t: 'keep' });
    const s = h.store.getState();
    const groups = s.groups as NonNullable<typeof s.groups>;
    const hand = s.state?.sides[0].hand ?? [];
    for (const iid of hand) {
      const plan = planFor(groups, { t: 'hand', iid, faceDown: false, guard: false });
      for (const a of [plan.summon, plan.cast, plan.setTrap, ...plan.targets.values()]) {
        if (a !== null) expect(s.legal).toContainEqual(a);
      }
    }
    expect(planFor(groups, null).anything).toBe(false);
  });
});

describe('bill of sale', () => {
  it('evaluates objectives from content data against the finished state', async () => {
    const h = await started('2026-10-14');
    const s = h.store.getState();
    const state = s.state as NonNullable<typeof s.state>;
    const o = ctx.objectives.get('win-without-grafting');
    expect(o).toBeDefined();
    expect(objectiveMet(o as NonNullable<typeof o>, state, ctx.globals)).toBe(false); // no result yet
  });
  it('builds a static view for a definition id', () => {
    const id = ctx.cards.keys().next().value as string;
    expect(definitionView(ctx, id)?.name.length).toBeGreaterThan(0);
  });
});
