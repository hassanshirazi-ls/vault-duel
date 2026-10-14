// Hand-made fixture content. Every id is prefixed `fx-` so it can never be mistaken for real card data.
import { defineKeyword } from '../src/hooks/define';
import { createEnv } from '../src/hooks/registry';
import type { Env } from '../src/hooks/registry';
import type { CompiledContent } from '../src/types/content';
import type { KeywordDef } from '../src/types/hooks';
import { buildContent } from './content-builder';
import { dslFillerSpec } from './content-builder';
import type { ContentSpec, DefSpec } from './content-builder';
import { TEST_GLOBALS } from './globals';
import type { Globals } from '../src/types/globals';

const k = (id: string, kind: 'keyword' | 'flaw', hooks: KeywordDef['hooks']): KeywordDef =>
  defineKeyword({ id, name: id, kind, icon: 'fx', visual: 'fx', text: 'Fixture.', hooks });

export const FX_KEYWORDS: readonly KeywordDef[] = [
  k('fx-brittle', 'flaw', {
    beforeCombat: (ctx) => {
      if (ctx.evt.target === ctx.self && ctx.combat.advantage) ctx.setBrittleWin();
    },
  }),
  k('fx-echo', 'keyword', {
    onDestroyed: (ctx) => {
      if (ctx.evt.iid === ctx.self) ctx.effect({ op: 'returnToHand', target: 'self' });
    },
  }),
  k('fx-haunt', 'keyword', {
    onDestroyed: (ctx) => {
      if (ctx.evt.iid !== ctx.self || ctx.evt.by < 0) return;
      ctx.effect({ op: 'modifyStats', target: 'destroyer', power: '-$HAUNT_PENALTY', duration: 'permanent', if: { onBoard: true } });
    },
  }),
  k('fx-pierce', 'keyword', {
    beforeCombat: (ctx) => {
      if (ctx.isAttacker(ctx.self) && ctx.combat.defPos === 1) ctx.setPierce();
    },
  }),
  k('fx-sentinel', 'keyword', { restrictTargets: () => true }),
  k('fx-swift', 'keyword', {
    attackPermission: (q) => (q.enteredThisTurn(q.self) ? { grant: 'monstersOnly' } : {}),
  }),
  k('fx-ward', 'keyword', { beforeDestroy: () => 'prevent' }),
  k('fx-covetous', 'flaw', {
    summonRequirement: () => ({ kind: 'sacrifice', appraised: true, zones: ['board', 'vault'] }),
  }),
  k('fx-slow', 'flaw', {
    attackPermission: (q) => (q.ownTurnsSinceEntered(q.self) < q.g.SLOW_TURNS ? { restrict: 'none' } : {}),
  }),
  k('fx-tethered', 'flaw', {
    staticPower: (q) => (q.monsters(q.side).length === 1 ? -q.g.TETHERED_PENALTY : 0),
  }),
  k('fx-vain', 'flaw', { mustAttack: () => true }),
];

export const FX_DEFS: readonly DefSpec[] = [
  dslFillerSpec({ elements: [{ id: 'fx-ember', beats: [] }], kinds: ['fx-beast'] }), // D-193: the board DSL's inert filler (first element and kind of FX_SPEC)
  { id: 'fx-ember-whelp', type: 'monster', power: 3, guard: 2, element: 'fx-ember', kind: 'fx-beast' },
  { id: 'fx-tide-sprite', type: 'monster', power: 2, guard: 4, element: 'fx-tide', kind: 'fx-spirit' },
  { id: 'fx-umbra-beast', type: 'monster', power: 5, guard: 3, element: 'fx-umbra', kind: 'fx-beast' },
  { id: 'fx-lumen-seer', type: 'monster', power: 4, guard: 4, element: 'fx-lumen', kind: 'fx-spirit' },
  { id: 'fx-swift-scout', type: 'monster', power: 2, guard: 2, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-swift'] },
  { id: 'fx-sentinel-wall', type: 'monster', power: 2, guard: 6, element: 'fx-tide', kind: 'fx-spirit', kw: ['fx-sentinel'] },
  { id: 'fx-warded-ox', type: 'monster', power: 4, guard: 4, element: 'fx-umbra', kind: 'fx-beast', kw: ['fx-ward'] },
  { id: 'fx-pierce-fang', type: 'monster', power: 4, guard: 2, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-pierce'] },
  { id: 'fx-echo-moth', type: 'monster', power: 2, guard: 2, element: 'fx-tide', kind: 'fx-spirit', kw: ['fx-echo'] },
  { id: 'fx-haunt-shade', type: 'monster', power: 3, guard: 3, element: 'fx-umbra', kind: 'fx-spirit', kw: ['fx-haunt'] },
  { id: 'fx-relic-brittle', type: 'monster', pool: 'collector', power: 7, guard: 1, element: 'fx-tide', kind: 'fx-beast', kw: ['fx-brittle'] },
  { id: 'fx-relic-tether', type: 'monster', pool: 'collector', power: 6, guard: 3, element: 'fx-ember', kind: 'fx-spirit', kw: ['fx-tethered'] },
  { id: 'fx-relic-vain', type: 'monster', pool: 'collector', power: 5, guard: 3, element: 'fx-umbra', kind: 'fx-beast', kw: ['fx-vain'] },
  { id: 'fx-relic-slow', type: 'monster', pool: 'collector', power: 5, guard: 5, element: 'fx-lumen', kind: 'fx-spirit', kw: ['fx-slow'] },
  { id: 'fx-relic-covetous', type: 'monster', pool: 'collector', power: 6, guard: 2, element: 'fx-ember', kind: 'fx-spirit', kw: ['fx-covetous'] },
  { id: 'fx-family-hybrid', type: 'family', power: 7, guard: 5 },
  {
    id: 'fx-spell-bolt', type: 'spell',
    spell: {
      target: { side: 'enemy', zone: 'board', where: { all: [{ faceUp: true }, { powerLte: '$UNMAKE_MAX_POWER' }] } },
      effects: [{ op: 'destroy', target: 'chosen' }],
    },
  },
  {
    id: 'fx-trap-snare', type: 'trap',
    trap: { trigger: 'enemyAttack', effects: [{ op: 'cancelAttack' }] },
  },
];

export const FX_SPEC: ContentSpec = {
  elements: [
    { id: 'fx-ember', beats: ['fx-tide'] },
    { id: 'fx-tide', beats: ['fx-umbra'] },
    { id: 'fx-umbra', beats: ['fx-lumen'] },
    { id: 'fx-lumen', beats: ['fx-umbra'] },
  ],
  kinds: ['fx-beast', 'fx-spirit'],
  recipes: [{ kinds: ['fx-beast', 'fx-spirit'], family: 'fx-family-hybrid' }],
  keywords: FX_KEYWORDS,
  defs: FX_DEFS,
};

export const FX: CompiledContent = buildContent(FX_SPEC);
export const FX_ENV: Env = createEnv(FX, TEST_GLOBALS, [], true);

export function fxEnv(g: Globals = TEST_GLOBALS, c: CompiledContent = FX): Env {
  return createEnv(c, g, [], true);
}

/** Bit mask of fixture keywords by id. */
export function fxKw(c: CompiledContent, ...ids: string[]): number {
  let m = 0;
  for (const id of ids) {
    const bit = c.kwBit[id];
    if (bit === undefined) throw new Error(`fixture: unknown keyword ${id}`);
    m |= 1 << bit;
  }
  return m >>> 0;
}
