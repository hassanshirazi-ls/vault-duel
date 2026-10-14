// Keyword and Flaw files (ARCHITECTURE.md §8.4, §8.5, §20 KW-1…KW-10, FL-1…FL-5, D-111): the registry is complete,
// the barrel is current, and each hook does what §8.5 and the section E decisions say.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CombatCtx, DestroyedEvt, GameEvent, HookCtx, KeywordDef, QueryCtx, Effect } from '@vault-duel/engine';
import { DEFAULT_GLOBALS } from './globals';
import { KEYWORDS } from '../keywords/index.gen';
import {
  BARREL_FILE,
  checkKeywordBarrel,
  checkKeywordSources,
  loadKeywordFiles,
  renderKeywordBarrel,
  sortKeywords,
  type KeywordSource,
} from './keyword-files';

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture: ${what} is missing`);
  return value;
}

const byId = (id: string): KeywordDef => need(KEYWORDS.find((keyword) => keyword.id === id), `keyword ${id}`);

/** A query context whose fields the test sets; the rest are unused by the hooks under test. */
function queryCtx(over: Partial<Record<keyof QueryCtx, unknown>> = {}): QueryCtx {
  return {
    self: 4,
    side: 0,
    g: DEFAULT_GLOBALS,
    monsters: () => [],
    enteredThisTurn: () => false,
    ...over,
  } as unknown as QueryCtx;
}

const EXPECTED: readonly { id: string; kind: 'keyword' | 'flaw'; hooks: readonly string[] }[] = [
  { id: 'echo', kind: 'keyword', hooks: ['onDestroyed'] },
  { id: 'haunt', kind: 'keyword', hooks: ['onDestroyed'] },
  { id: 'pierce', kind: 'keyword', hooks: ['beforeCombat'] },
  { id: 'sentinel', kind: 'keyword', hooks: ['restrictTargets'] },
  { id: 'swift', kind: 'keyword', hooks: ['attackPermission'] },
  { id: 'ward', kind: 'keyword', hooks: ['beforeDestroy'] },
  { id: 'brittle', kind: 'flaw', hooks: ['beforeCombat'] },
  { id: 'covetous', kind: 'flaw', hooks: ['summonRequirement'] },
  { id: 'slow', kind: 'flaw', hooks: ['attackPermission'] },
  { id: 'tethered', kind: 'flaw', hooks: ['staticPower'] },
  { id: 'vain', kind: 'flaw', hooks: ['mustAttack'] },
];

describe('registry (KW-1, FL-1, D-111)', () => {
  it('has 6 keywords and 5 Flaws, in bit order (keywords by id, then Flaws by id)', () => {
    expect(KEYWORDS.map((keyword) => keyword.id)).toEqual(EXPECTED.map((entry) => entry.id));
    expect(KEYWORDS.map((keyword) => keyword.kind)).toEqual(EXPECTED.map((entry) => entry.kind));
  });

  it('uses exactly the hook names of ARCHITECTURE.md §8.5 for each keyword and Flaw', () => {
    for (const entry of EXPECTED) {
      const hooks = Object.keys(byId(entry.id).hooks).sort();
      expect(hooks, entry.id).toEqual([...entry.hooks].sort());
    }
  });

  it('has a text of one sentence and non-empty display fields for every entry', () => {
    for (const keyword of KEYWORDS) {
      expect(keyword.text.split(/(?<=[.!?])\s+/), keyword.id).toHaveLength(1);
      expect(keyword.name.trim(), keyword.id).not.toBe('');
      expect(keyword.icon.trim(), keyword.id).not.toBe('');
      expect(keyword.visual.trim(), keyword.id).not.toBe('');
    }
  });

  it('has no card ids in any keyword file (examples would reference cards)', () => {
    for (const keyword of KEYWORDS) expect(keyword.examples ?? [], keyword.id).toEqual([]);
  });

  it('passes the file-level checks and has a current barrel', async () => {
    const loaded = await loadKeywordFiles();
    expect(loaded.errors).toEqual([]);
    expect(checkKeywordSources(loaded.sources)).toEqual([]);
    expect(checkKeywordBarrel(loaded.sources)).toEqual([]);
  });
});

describe('hooks match DESIGN.md and the section E decisions', () => {
  it('Swift grants monsters-only attacks on its summon turn and nothing later (D-041)', () => {
    const hook = need(byId('swift').hooks.attackPermission, 'swift.attackPermission');
    expect(hook(queryCtx({ enteredThisTurn: () => true }))).toEqual({ grant: 'monstersOnly' });
    expect(hook(queryCtx({ enteredThisTurn: () => false }))).toEqual({});
  });

  it('Slow restricts attacks to none on its summon turn (D-053)', () => {
    const hook = need(byId('slow').hooks.attackPermission, 'slow.attackPermission');
    expect(hook(queryCtx({ enteredThisTurn: () => true }))).toEqual({ restrict: 'none' });
    expect(hook(queryCtx({ enteredThisTurn: () => false }))).toEqual({});
  });

  it('Sentinel marks its monster as a mandatory target (D-038)', () => {
    const hook = need(byId('sentinel').hooks.restrictTargets, 'sentinel.restrictTargets');
    expect(hook(queryCtx() as Parameters<typeof hook>[0])).toBe(true);
  });

  it('Vain must attack (D-052)', () => {
    const hook = need(byId('vain').hooks.mustAttack, 'vain.mustAttack');
    expect(hook(queryCtx())).toBe(true);
  });

  it('Ward prevents the first destruction (D-044)', () => {
    const hook = need(byId('ward').hooks.beforeDestroy, 'ward.beforeDestroy');
    expect(hook({} as Parameters<typeof hook>[0])).toBe('prevent');
  });

  it('Tethered is −TETHERED_PENALTY only while it is the only monster on its board (D-051)', () => {
    const hook = need(byId('tethered').hooks.staticPower, 'tethered.staticPower');
    expect(hook(queryCtx({ monsters: () => [4] }))).toBe(-DEFAULT_GLOBALS.TETHERED_PENALTY);
    expect(hook(queryCtx({ monsters: () => [4, 5] }))).toBe(0);
  });

  it('Covetous summons only by sacrificing an appraised monster from board or vault (D-054)', () => {
    const hook = need(byId('covetous').hooks.summonRequirement, 'covetous.summonRequirement');
    expect(hook(queryCtx())).toEqual({ kind: 'sacrifice', appraised: true, zones: ['board', 'vault'] });
  });

  it('Pierce applies only when the attacker faces a guard-position defender (D-039)', () => {
    const hook = need(byId('pierce').hooks.beforeCombat, 'pierce.beforeCombat');
    const run = (defPos: 0 | 1): number => {
      let pierce = 0;
      const ctx = {
        self: 4,
        evt: { attacker: 4, target: 9 },
        combat: { defPos },
        setPierce: () => (pierce += 1),
      } as unknown as CombatCtx;
      hook(ctx);
      return pierce;
    };
    expect(run(1)).toBe(1);
    expect(run(0)).toBe(0);
  });

  it('Brittle wins the fight only as the defender against an element advantage (D-049)', () => {
    const hook = need(byId('brittle').hooks.beforeCombat, 'brittle.beforeCombat');
    const run = (target: number, advantage: boolean): number => {
      let wins = 0;
      const ctx = {
        self: 4,
        evt: { attacker: 9, target },
        combat: { advantage },
        setBrittleWin: () => (wins += 1),
      } as unknown as CombatCtx;
      hook(ctx);
      return wins;
    };
    expect(run(4, true)).toBe(1);
    expect(run(4, false)).toBe(0);
    expect(run(9, true)).toBe(0);
  });

  describe('destruction hooks use the last-known event (D-043, D-045, D-046)', () => {
    const destroyedCtx = (evt: Partial<DestroyedEvt>, effects: Effect[], events: GameEvent[] = []) =>
      ({
        self: 4,
        evt: { iid: 4, side: 0, slot: 0, cause: 'combat', by: 7, power: 3, guard: 2, kw: 0, ...evt },
        effect: (e: Effect) => effects.push(e),
        emit: (e: GameEvent) => events.push(e),
      }) as unknown as HookCtx<DestroyedEvt>;

    it('Haunt costs the destroyer HAUNT_PENALTY permanently, only for its own destruction with a destroyer', () => {
      const hook = need(byId('haunt').hooks.onDestroyed, 'haunt.onDestroyed');
      const effects: Effect[] = [];
      hook(destroyedCtx({ iid: 4, by: 7 }, effects));
      expect(effects).toEqual([
        { op: 'modifyStats', target: 'destroyer', power: '-$HAUNT_PENALTY', duration: 'permanent', if: { onBoard: true } },
      ]);

      const none: Effect[] = [];
      hook(destroyedCtx({ iid: 4, by: -1 }, none));
      hook(destroyedCtx({ iid: 9, by: 7 }, none));
      expect(none).toEqual([]);
    });

    it('Echo returns itself from the discard to its owner, only for its own destruction (D-046)', () => {
      const hook = need(byId('echo').hooks.onDestroyed, 'echo.onDestroyed');
      const effects: Effect[] = [];
      hook(destroyedCtx({ iid: 4 }, effects));
      hook(destroyedCtx({ iid: 9 }, effects));
      expect(effects).toEqual([{ op: 'returnToHand', target: 'self' }]);
    });
  });
});

describe('file checks (§8.4, §10.3 keyword file problems)', () => {
  const source = (stem: string, def: Partial<KeywordDef>): KeywordSource => ({
    file: `keywords/${stem}.ts`,
    stem,
    def: { ...byId('swift'), ...def } as KeywordDef,
  });

  it('reports an id that differs from the file name', () => {
    expect(checkKeywordSources([source('haunt', { id: 'haunted' })]).map((error) => error.problem)).toEqual([
      'id "haunted" ≠ file name',
    ]);
  });

  it('reports two files with one id', () => {
    const problems = checkKeywordSources([source('swift', {}), source('swift', {})]);
    expect(problems.map((error) => error.problem)).toEqual(['duplicate id (also in keywords/swift.ts)']);
  });

  it('reports more than 32 keywords and Flaws', () => {
    const many = Array.from({ length: 33 }, (_, i) => source(`k${i}`, { id: `k${i}` }));
    expect(checkKeywordSources(many).map((error) => error.problem)).toEqual([
      '33 keywords and Flaws, the bit mask holds 32',
    ]);
  });

  it('reports text longer than one sentence', () => {
    const problems = checkKeywordSources([source('swift', { text: 'One. Two.' })]);
    expect(problems.map((error) => error.problem)).toEqual(['text has 2 sentences']);
  });

  it('renders the barrel in bit order whatever order the sources arrive in', () => {
    const shuffled: KeywordSource[] = [...KEYWORDS]
      .reverse()
      .map((def) => ({ file: `keywords/${def.id}.ts`, stem: def.id, def }));
    const sorted = sortKeywords(shuffled).map((entry) => entry.def.id);
    expect(sorted).toEqual(KEYWORDS.map((keyword) => keyword.id));
    expect(renderKeywordBarrel(shuffled)).toContain('kw_echo');
    expect(renderKeywordBarrel([])).toContain('export const KEYWORDS: readonly KeywordDef[] = [];');
  });
});

describe('barrel and loader on a scratch copy', () => {
  let scratch: string;

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'vault-duel-kw-'));
    mkdirSync(join(scratch, 'keywords'));
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('reports a missing barrel', () => {
    const problems = checkKeywordBarrel([], scratch);
    expect(problems.map((error) => `${error.file} › ${error.problem}`)).toEqual([`${BARREL_FILE} › missing`]);
  });

  it('reports a stale barrel', () => {
    writeFileSync(join(scratch, BARREL_FILE), '// old\n');
    expect(checkKeywordBarrel([], scratch).map((error) => error.problem)).toEqual([
      'stale, does not match keywords/*.ts',
    ]);
  });

  it('reports a keyword file with no default export', async () => {
    writeFileSync(join(scratch, 'keywords', 'bare.ts'), 'export const notDefault = 1;\n');
    const loaded = await loadKeywordFiles(scratch);
    expect(loaded.sources).toEqual([]);
    expect(loaded.errors.map((error) => `${error.file} › ${error.problem}`)).toEqual([
      'keywords/bare.ts › no default export from defineKeyword({ id, name, kind, icon, visual, text, hooks })',
    ]);
  });
});
