// The raw-content overrides (--ring, --collector): parse, apply, reach the workers, and leave the default path alone.
import { afterAll, describe, expect, it } from 'vitest';
import { RAW_CONTENT } from '@vault-duel/content';
import { checkKey } from '@vault-duel/ai';
import { stableJson } from '../src/aggregate';
import { parseArgs } from '../src/args';
import { applyContentOverrides, ContentOverrideError, NAMED_RINGS, parseCollectorSet, parseRing } from '../src/overrides';
import { balanceJobs } from '../src/plan';
import { Pool } from '../src/pool';
import { loadContext } from '../src/world';

const IDS = ['ember', 'gale', 'tide', 'lumen', 'umbra'];
const DATES = ['2026-01-05', '2026-01-06'];
const pools: Pool[] = [];
afterAll(async () => {
  await Promise.all(pools.map((p) => p.close()));
});

describe('parseArgs content flags', () => {
  it('reads --ring, --collector and --collector-reposition', () => {
    const o = parseArgs(['quick', '--ring', 'A', '--collector', 'ai.allowFaceDown=true', '--collector-reposition', 'laneAware', '--seed-check']);
    expect(o.ring).toBe('A');
    expect(o.collector).toEqual(['ai.allowFaceDown=true', 'ai.reposition="laneAware"']);
    expect(o.seedCheck).toBe(true);
  });
  it('defaults to no content overrides', () => {
    const o = parseArgs(['quick']);
    expect(o.ring).toBeUndefined();
    expect(o.collector).toEqual([]);
    expect(o.seedCheck).toBe(false);
  });
});

describe('parseRing', () => {
  it('accepts the named rings and any permutation', () => {
    expect(parseRing('A', IDS)).toEqual(['ember', 'gale', 'tide', 'lumen', 'umbra']);
    expect(parseRing('umbra,ember,gale,tide,lumen', IDS)).toHaveLength(5);
  });
  it.each(['ember,gale,tide,lumen', 'ember,gale,tide,lumen,lumen', 'ember,gale,tide,lumen,nope', ''])('rejects "%s"', (text) => {
    expect(() => parseRing(text, IDS)).toThrow(ContentOverrideError);
  });
});

describe('parseCollectorSet', () => {
  it('parses JSON and bare words under ai', () => {
    expect(parseCollectorSet('ai.reposition="laneAware"')).toEqual({ path: ['ai', 'reposition'], value: 'laneAware' });
    expect(parseCollectorSet('ai.reposition=laneAware').value).toBe('laneAware');
    expect(parseCollectorSet('ai.allowFaceDown=true').value).toBe(true);
  });
  it.each(['reposition=x', 'ai=1', 'ai..x=1', 'ai.__proto__.x=1', 'noequals'])('rejects "%s"', (text) => {
    expect(() => parseCollectorSet(text)).toThrow(ContentOverrideError);
  });
});

describe('applyContentOverrides', () => {
  it('returns the raw content itself when there is nothing to apply', () => {
    expect(applyContentOverrides(RAW_CONTENT, {})).toBe(RAW_CONTENT);
    expect(applyContentOverrides(RAW_CONTENT, { collector: [] })).toBe(RAW_CONTENT);
  });

  it('rewrites beats into a single cycle and leaves the original untouched', () => {
    const before = JSON.stringify(RAW_CONTENT.elements);
    const out = applyContentOverrides(RAW_CONTENT, { ring: 'B' });
    const beats = Object.fromEntries((out.elements as { id: string; beats: string[] }[]).map((e) => [e.id, e.beats]));
    expect(beats).toEqual({ ember: ['gale'], gale: ['tide'], tide: ['umbra'], umbra: ['lumen'], lumen: ['ember'] });
    expect(JSON.stringify(RAW_CONTENT.elements)).toBe(before);
  });

  it('sets collector ai fields without touching the original', () => {
    const before = JSON.stringify(RAW_CONTENT.collector);
    const out = applyContentOverrides(RAW_CONTENT, { collector: ['ai.reposition="laneAware"'] });
    expect((out.collector as { ai: { reposition: string } }).ai.reposition).toBe('laneAware');
    expect(JSON.stringify(RAW_CONTENT.collector)).toBe(before);
  });

  it('refuses a path that is not a collector field', () => {
    expect(() => applyContentOverrides(RAW_CONTENT, { collector: ['ai.nothing.deeper=1'] })).toThrow(ContentOverrideError);
  });
});

describe('loadContext with content overrides', () => {
  it('changes the compiled matrix and the content hash, not the globals hash', () => {
    const base = loadContext([]);
    const ringA = loadContext([], { ring: 'A' });
    const n = ringA.content.elementIds.length;
    const idx = (id: string): number => ringA.content.elementIds.indexOf(id);
    expect(ringA.content.beats[idx('tide') * n + idx('lumen')]).toBe(1);
    expect(ringA.content.beats[idx('tide') * n + idx('ember')] ?? 0).toBe(0);
    expect(ringA.content.hash).not.toBe(base.content.hash);
    expect(checkKey(ringA).globalsHash).toBe(checkKey(base).globalsHash);
    expect(ringA.contentOverrides).toEqual([`ring=${NAMED_RINGS['A']}`]);
  });

  it('A spelled out equals A by name', () => {
    expect(loadContext([], { ring: NAMED_RINGS['A'] as string }).content.hash).toBe(loadContext([], { ring: 'A' }).content.hash);
  });

  it('a collector override changes the content hash, and the default path is the same as before', () => {
    const base = loadContext([]);
    expect(loadContext([], { collector: ['ai.reposition="laneAware"'] }).content.hash).not.toBe(base.content.hash);
    expect(loadContext([], {}).content.hash).toBe(base.content.hash);
    expect(base.contentOverrides).toEqual([]);
  });

  it('rejects a collector value the schema does not accept', () => {
    expect(() => loadContext([], { collector: ['ai.reposition="nope"'] })).toThrow();
  });
});

describe('workers get the same overridden content', () => {
  it('1 and 2 workers agree with each other and differ from the default ring', async () => {
    const content = { ring: 'C', collector: ['ai.reposition="laneAware"'] };
    const sets = ['FLAGS.LANES=true'];
    const ctx = loadContext(sets, content);
    const jobs = balanceJobs(ctx, 'expert', 6, DATES);
    const make = async (size: number, c: typeof content | undefined): Promise<Pool> => {
      const p = await Pool.create(size, sets, c);
      pools.push(p);
      return p;
    };
    const one = await (await make(1, content)).duels(jobs);
    const two = await (await make(2, content)).duels(jobs);
    expect(stableJson(two.aggregate)).toBe(stableJson(one.aggregate));
    const plain = await (await make(1, undefined)).duels(jobs);
    expect(stableJson(plain.aggregate)).not.toBe(stableJson(one.aggregate));
  }, 120_000);
});
