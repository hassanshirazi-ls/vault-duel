// The --card override (M-05, M-11): parse, apply to monsters/relics/recipes, report line, errors, and no-flag identity.
import { describe, expect, it } from 'vitest';
import { RAW_CONTENT } from '@vault-duel/content';
import { parseArgs } from '../src/args';
import { applyContentOverrides, ContentOverrideError, describeOverrides, parseCardSet } from '../src/overrides';
import { loadContext } from '../src/world';

const find = (rows: unknown, id: string): Record<string, unknown> => (rows as Record<string, unknown>[]).find((r) => r['id'] === id) as Record<string, unknown>;

describe('--card parsing', () => {
  it('is repeatable and defaults to empty', () => {
    expect(parseArgs(['quick']).card).toEqual([]);
    expect(parseArgs(['quick', '--card', 'bastion-warden.power=7', '--card=bastion-warden.guard=8']).card).toEqual(['bastion-warden.power=7', 'bastion-warden.guard=8']);
  });
  it('splits id, field and JSON value', () => {
    expect(parseCardSet('the-unpriced.keywords=[]')).toEqual({ id: 'the-unpriced', field: 'keywords', value: [] });
    expect(parseCardSet('bastion-warden.power=7')).toEqual({ id: 'bastion-warden', field: 'power', value: 7 });
  });
  it.each(['nope', 'a=1', 'a.b', 'a.b=notjson'])('rejects "%s"', (t) => {
    expect(() => parseCardSet(t)).toThrow(ContentOverrideError);
  });
});

describe('--card applied to raw content', () => {
  it('rewrites a relic without touching the original', () => {
    const out = applyContentOverrides(RAW_CONTENT, { card: ['the-unpriced.keywords=[]'] });
    expect(find(out.relics, 'the-unpriced')['keywords']).toEqual([]);
    expect(find(RAW_CONTENT.relics, 'the-unpriced')['keywords']).toEqual(['ward']);
    expect(out.recipes).toBe(RAW_CONTENT.recipes);
  });
  it('compiles Bastion Warden as 7/8', () => {
    const ctx = loadContext([], { card: ['bastion-warden.power=7', 'bastion-warden.guard=8'] });
    const raw = find(applyContentOverrides(RAW_CONTENT, { card: ['bastion-warden.power=7', 'bastion-warden.guard=8'] }).recipes, 'bastion-warden');
    expect([raw['power'], raw['guard']]).toEqual([7, 8]);
    expect(JSON.stringify(ctx.content)).toContain('bastion-warden');
    expect(ctx.content.hash).not.toBe(loadContext([]).content.hash);
  });
  it('compiles The Hollow Heir without Ward', () => {
    const ctx = loadContext([], { card: ['the-unpriced.keywords=[]'] });
    expect(ctx.content.hash).not.toBe(loadContext([]).content.hash);
  });
  it('rejects unknown ids and fields, naming the valid ones', () => {
    expect(() => applyContentOverrides(RAW_CONTENT, { card: ['no-such.power=1'] })).toThrow(/unknown card id "no-such".*the-unpriced/);
    expect(() => applyContentOverrides(RAW_CONTENT, { card: ['the-unpriced.name="x"'] })).toThrow(/valid: power, guard, keywords/);
    expect(() => applyContentOverrides(RAW_CONTENT, { card: ['bastion-warden.keywords=[]'] })).toThrow(/valid: power, guard/);
  });
  it('still validates the result', () => {
    expect(() => loadContext([], { card: ['the-unpriced.power="big"'] })).toThrow();
    expect(() => loadContext([], { card: ['the-unpriced.keywords=["nope"]'] })).toThrow();
  });
  it('lists the overrides in the report line', () => {
    const ctx = loadContext([], { card: ['bastion-warden.power=7'] });
    expect(ctx.contentOverrides).toEqual(['card.bastion-warden.power=7']);
    expect(describeOverrides({ card: ['a.power=1'] })).toEqual(['card.a.power=1']);
  });
  it('no flag is identical to today', () => {
    expect(applyContentOverrides(RAW_CONTENT, {})).toBe(RAW_CONTENT);
    expect(applyContentOverrides(RAW_CONTENT, { card: [] })).toBe(RAW_CONTENT);
    expect(loadContext([], { card: [] }).content.hash).toBe(loadContext([]).content.hash);
  });
});
