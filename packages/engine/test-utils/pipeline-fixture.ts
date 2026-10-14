// Fixture content for the pipeline tests (turn, summon, combat, destroy): the shared `fx-*` content plus
// recorder/probe keywords and fixture trap hooks. Every id is `fx-` prefixed.
import { defineKeyword } from '../src/hooks/define';
import { createEnv } from '../src/hooks/registry';
import type { Env } from '../src/hooks/registry';
import type { CompiledContent } from '../src/types/content';
import type { Hooks, KeywordDef } from '../src/types/hooks';
import { buildContent } from './content-builder';
import type { DefSpec } from './content-builder';
import { FX_DEFS, FX_KEYWORDS, FX_SPEC } from './fixture';
import { TEST_GLOBALS } from './globals';
import type { Globals } from '../src/types/globals';

/** Log written by the `fx-spy` keyword and the spy trap: `"<hook>@<self>"`, or `"<hook>:<detail>@<self>"`. */
export const SPY: string[] = [];

const kw = (id: string, kind: 'keyword' | 'flaw', hooks: Hooks): KeywordDef =>
  defineKeyword({ id, name: id, kind, icon: 'fx', visual: 'fx', text: 'Fixture.', hooks });

export const PIPE_KEYWORDS: readonly KeywordDef[] = [
  ...FX_KEYWORDS,
  kw('fx-spy', 'keyword', {
    onSummon: (ctx) => void SPY.push(`onSummon:${ctx.evt.covetous}@${ctx.self}`),
    onTurnStart: (ctx) => void SPY.push(`onTurnStart@${ctx.self}`),
    onTurnEnd: (ctx) => void SPY.push(`onTurnEnd@${ctx.self}`),
    onAttackDeclared: (ctx) => void SPY.push(`onAttackDeclared:${ctx.cancelled}@${ctx.self}`),
    beforeCombat: (ctx) => void SPY.push(`beforeCombat@${ctx.self}`),
    onDestroyed: (ctx) => void SPY.push(`onDestroyed:${ctx.evt.iid}/${ctx.evt.power}/${ctx.evt.guard}/${ctx.evt.slot}@${ctx.self}`),
  }),
  // A second replacement keyword: a used Ward must switch off every beforeDestroy bit (D-133).
  kw('fx-ward2', 'keyword', { beforeDestroy: () => 'prevent' }),
  // Attacker destroys its defender through a queued effect (the attack must then fizzle, D-124).
  kw('fx-reaper', 'keyword', {
    beforeCombat: (ctx) => {
      if (ctx.isAttacker(ctx.self)) ctx.effect({ op: 'destroy', target: 'defender' });
    },
  }),
  // Attacker pumps itself in beforeCombat; the snapshot must not change (D-032, D-124).
  kw('fx-pump', 'keyword', {
    beforeCombat: (ctx) => {
      if (ctx.isAttacker(ctx.self)) ctx.effect({ op: 'modifyStats', target: 'attacker', power: 3, duration: 'permanent' });
    },
  }),
  // Tries to write the snapshot (must throw in dev mode, D-141).
  kw('fx-tamper', 'keyword', {
    beforeCombat: (ctx) => {
      (ctx.combat as { aP: number }).aP = 99;
    },
  }),
  // Two independent flag setters, to prove OR-folding is order independent (D-124).
  kw('fx-flag-pierce', 'keyword', { beforeCombat: (ctx) => void (ctx.isAttacker(ctx.self) && ctx.setPierce()) }),
  kw('fx-flag-brittle', 'keyword', { beforeCombat: (ctx) => void (ctx.evt.target === ctx.self && ctx.setBrittleWin()) }),
  // When destroyed, the destroyer is destroyed too (queued effect that destroys a ref).
  kw('fx-avenger', 'keyword', {
    onDestroyed: (ctx) => {
      if (ctx.evt.iid === ctx.self) ctx.effect({ op: 'destroy', target: 'destroyer', if: { onBoard: true } });
    },
  }),
  // When destroyed, the other side takes 99 (ends the game inside onDestroyed).
  kw('fx-bomb', 'keyword', {
    onDestroyed: (ctx) => {
      if (ctx.evt.iid === ctx.self) ctx.effect({ op: 'damage', who: 'opponent', n: 99 });
    },
  }),
  // Covetous variants with different zones (D-137).
  kw('fx-cov-vault', 'flaw', {
    summonRequirement: () => ({ kind: 'sacrifice', appraised: true, zones: ['vault'] }),
  }),
  kw('fx-cov-vb', 'flaw', {
    summonRequirement: () => ({ kind: 'sacrifice', appraised: true, zones: ['vault', 'board'] }),
  }),
  kw('fx-cov-board', 'flaw', {
    summonRequirement: () => ({ kind: 'sacrifice', appraised: true, zones: ['board'] }),
  }),
];

const m = (id: string, power: number, guard: number, element: string, kind: string, kws: string[], pool?: 'collector'): DefSpec =>
  pool === undefined
    ? { id, type: 'monster', power, guard, element, kind, kw: kws }
    : { id, type: 'monster', power, guard, element, kind, kw: kws, pool };

export const PIPE_DEFS: readonly DefSpec[] = [
  ...FX_DEFS,
  m('fx-spy-card', 1, 1, 'fx-ember', 'fx-beast', ['fx-spy']),
  m('fx-ward2-ox', 4, 4, 'fx-umbra', 'fx-beast', ['fx-ward', 'fx-ward2']),
  m('fx-reaper', 3, 3, 'fx-ember', 'fx-beast', ['fx-reaper']),
  m('fx-pump', 3, 3, 'fx-ember', 'fx-beast', ['fx-pump']),
  m('fx-tamper', 3, 3, 'fx-ember', 'fx-beast', ['fx-tamper']),
  m('fx-avenger', 2, 2, 'fx-tide', 'fx-spirit', ['fx-avenger']),
  m('fx-bomb', 1, 1, 'fx-ember', 'fx-beast', ['fx-bomb']),
  m('fx-echo-spy', 2, 2, 'fx-tide', 'fx-spirit', ['fx-echo', 'fx-spy']),
  m('fx-haunt-four', 4, 2, 'fx-ember', 'fx-beast', ['fx-haunt']),
  m('fx-ember-twin', 3, 2, 'fx-ember', 'fx-beast', []),
  m('fx-relic-brittle-ward', 7, 1, 'fx-tide', 'fx-beast', ['fx-ward', 'fx-brittle'], 'collector'),
  m('fx-ace', 10, 8, 'fx-umbra', 'fx-beast', ['fx-covetous'], 'collector'),
  m('fx-relic-cov-vault', 6, 2, 'fx-ember', 'fx-spirit', ['fx-cov-vault'], 'collector'),
  m('fx-relic-cov-vb', 6, 2, 'fx-ember', 'fx-spirit', ['fx-cov-vb'], 'collector'),
  m('fx-relic-cov-board', 6, 2, 'fx-ember', 'fx-spirit', ['fx-cov-board'], 'collector'),
  m('fx-relic-cov-none', 6, 2, 'fx-ember', 'fx-spirit', ['fx-cov-vault', 'fx-cov-board'], 'collector'),
  m('fx-flags', 3, 3, 'fx-ember', 'fx-beast', ['fx-flag-pierce']),
  m('fx-flags-brittle', 2, 5, 'fx-tide', 'fx-beast', ['fx-flag-brittle'], 'collector'),
  { id: 'fx-trap-mirror', type: 'trap', trap: { trigger: 'enemyAttack', effects: [] } },
  { id: 'fx-trap-thorn', type: 'trap', trap: { trigger: 'enemyDirectAttack', effects: [] } },
  { id: 'fx-trap-spy', type: 'trap', trap: { trigger: 'enemyAttack', effects: [] } },
  { id: 'fx-trap-insurance', type: 'trap', trap: { trigger: 'allyDestroyed', effects: [] } },
];

export const PIPE_SPEC = { ...FX_SPEC, keywords: PIPE_KEYWORDS, defs: PIPE_DEFS };
const base = buildContent(PIPE_SPEC);
/** `fx-ace` is the Collector's ace (Track.unpriced). */
export const PC: CompiledContent = { ...base, collector: { ...base.collector, ace: base.index.get('fx-ace') as number } };

const def = (id: string): number => PC.index.get(id) as number;

/** Fixture trap hooks (what traps.ts will compile from the DSL; tests exercise the engine side only). */
export function pipeTrapHooks(): (Hooks | null)[] {
  const t: (Hooks | null)[] = PC.ids.map(() => null);
  t[def('fx-trap-snare')] = { onAttackDeclared: (ctx) => ctx.effect({ op: 'cancelAttack' }) };
  t[def('fx-trap-mirror')] = {
    onAttackDeclared: (ctx) => {
      if (!ctx.cancelled) ctx.effect({ op: 'modifyStats', target: 'attacker', power: -3, duration: 'permanent' });
    },
  };
  t[def('fx-trap-thorn')] = {
    onAttackDeclared: (ctx) => {
      if (ctx.cancelled || ctx.evt.target >= 0) return;
      ctx.effect({ op: 'cancelAttack' });
      ctx.effect({ op: 'changePosition', target: 'attacker', to: 'guard' });
    },
  };
  t[def('fx-trap-spy')] = {
    onAttackDeclared: (ctx) => void SPY.push(`trapSaw:cancelled=${ctx.cancelled}@${ctx.self}`),
  };
  t[def('fx-trap-insurance')] = {
    onDestroyed: (ctx) => {
      if (ctx.evt.side === ctx.side) ctx.effect({ op: 'heal', who: 'self', n: 3 });
    },
  };
  return t;
}

export function pipeEnv(g: Globals = TEST_GLOBALS, dev = true): Env {
  return createEnv(PC, g, pipeTrapHooks(), dev);
}
export const PENV: Env = pipeEnv();
