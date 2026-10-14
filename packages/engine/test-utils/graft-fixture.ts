// Fixture content for graft, trap and reducer tests: the pipeline fixture plus a full recipe table
// (beast+beast, spirit+spirit, beast+spirit), real compiled traps and fixture spells. Every id is `fx-` prefixed.
import { defineKeyword } from '../src/hooks/define';
import { createEnv } from '../src/hooks/registry';
import type { Env } from '../src/hooks/registry';
import { compileTraps } from '../src/traps';
import type { CompiledContent } from '../src/types/content';
import type { KeywordDef } from '../src/types/hooks';
import { buildContent } from './content-builder';
import type { DefSpec } from './content-builder';
import { TEST_GLOBALS } from './globals';
import { PIPE_DEFS, PIPE_KEYWORDS, PIPE_SPEC, SPY } from './pipeline-fixture';
import type { Globals } from '../src/types/globals';

/** Records onGraft dispatches: `"onGraft:<chimera iid>@<self>"`. */
const gspy: KeywordDef = defineKeyword({
  id: 'fx-gspy', name: 'fx-gspy', kind: 'keyword', icon: 'fx', visual: 'fx', text: 'Fixture.',
  hooks: { onGraft: (ctx) => void SPY.push(`onGraft:${ctx.evt.iid}@${ctx.self}`) },
});

const DEFS: readonly DefSpec[] = [
  ...PIPE_DEFS.filter((d) => !d.id.startsWith('fx-trap-')), // the pipeline fixture's hand-hooked traps are replaced by real ones
  { id: 'fx-family-bb', type: 'family', power: 7, guard: 4 },
  { id: 'fx-family-ss', type: 'family', power: 6, guard: 6 },
  { id: 'fx-gspy-card', type: 'monster', power: 2, guard: 2, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-gspy'] },
  { id: 'fx-multi-kw', type: 'monster', power: 2, guard: 2, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-pierce', 'fx-haunt'] },
  // spells
  { id: 'fx-bolt', type: 'spell', spell: {
      target: { side: 'enemy', zone: 'board', where: { all: [{ faceUp: true }, { powerLte: '$UNMAKE_MAX_POWER' }] } },
      effects: [{ op: 'destroy', target: 'chosen' }] } },
  { id: 'fx-bloodlust', type: 'spell', spell: {
      target: { side: 'ally', zone: 'board' },
      effects: [{ op: 'modifyStats', target: 'chosen', power: '$BLOODLUST_POWER', duration: 'thisTurn' }] } },
  { id: 'fx-recall', type: 'spell', spell: {
      target: { side: 'ally', zone: 'discard', where: { type: 'monster' } },
      effects: [{ op: 'returnToHand', target: 'chosen' }] } },
  { id: 'fx-scry', type: 'spell', spell: { effects: [{ op: 'draw', who: 'self', n: '$SCRYING_DRAW' }] } },
  { id: 'fx-siphon', type: 'spell', spell: {
      effects: [{ op: 'damage', who: 'opponent', n: '$SIPHON_DRAIN' }, { op: 'heal', who: 'self', n: '$SIPHON_GAIN' }] } },
  // traps (compiled by traps.ts)
  { id: 'fx-snare', type: 'trap', trap: { trigger: 'enemyAttack', effects: [{ op: 'cancelAttack' }] } },
  { id: 'fx-mirror', type: 'trap', trap: {
      trigger: 'enemyAttack',
      effects: [{ op: 'modifyStats', target: 'attacker', power: '-$MIRROR_SIGIL_PENALTY', duration: 'permanent' }] } },
  { id: 'fx-thornwall', type: 'trap', trap: {
      trigger: 'enemyDirectAttack',
      effects: [{ op: 'cancelAttack' }, { op: 'changePosition', target: 'attacker', to: 'guard' }] } },
  { id: 'fx-display', type: 'trap', trap: {
      trigger: 'enemyAttack',
      effects: [{ op: 'cancelAttack' }, { op: 'changePosition', target: 'attacker', to: 'guard' }] } },
  { id: 'fx-last-rites', type: 'trap', trap: { trigger: 'allyDestroyed', effects: [{ op: 'draw', who: 'self', n: '$LAST_RITES_DRAW' }] } },
  { id: 'fx-insurance', type: 'trap', trap: { trigger: 'allyDestroyed', effects: [{ op: 'heal', who: 'self', n: '$INSURANCE_HEAL' }] } },
  { id: 'fx-counterfeit', type: 'trap', trap: {
      trigger: 'enemyGraft',
      effects: [{ op: 'modifyStats', target: 'grafted', power: '-$COUNTERFEIT_PENALTY', duration: 'permanent' }] } },
  { id: 'fx-snare-strong', type: 'trap', trap: {
      trigger: 'enemyAttack', when: { powerGte: 5 }, effects: [{ op: 'cancelAttack' }] } },
];

const KEYWORDS: readonly KeywordDef[] = [...PIPE_KEYWORDS, gspy];

export const GRAFT_SPEC = {
  ...PIPE_SPEC,
  recipes: [
    { kinds: ['fx-beast', 'fx-spirit'], family: 'fx-family-hybrid' },
    { kinds: ['fx-beast', 'fx-beast'], family: 'fx-family-bb' },
    { kinds: ['fx-spirit', 'fx-spirit'], family: 'fx-family-ss' },
  ],
  keywords: KEYWORDS,
  defs: DEFS,
} as const;

const base = buildContent(GRAFT_SPEC);
/** Content for graft/trap/reducer tests. `fx-ace` is the Collector's ace. */
export const GC: CompiledContent = { ...base, collector: { ...base.collector, ace: base.index.get('fx-ace') as number } };

export function graftEnv(g: Globals = TEST_GLOBALS, c: CompiledContent = GC, dev = true): Env {
  return createEnv(c, g, compileTraps(c), dev);
}
export const GENV: Env = graftEnv();
