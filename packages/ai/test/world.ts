// Scenario world for rule tests: synthetic cards (every id starts with "c-" for the Collector pool or "p-" for the player
// pool), the real keywords (rules, not tuning), engine fixture globals, and a test-owned copy of the AI block. Nothing
// here depends on the live card values, so tuning collector.json or the card files cannot break a rule test.
import { CollectorAi, KEYWORDS } from '@vault-duel/content';
import type { GameContent } from '@vault-duel/content';
import { createEngine } from '@vault-duel/engine';
import type { Action, GameState, Globals, Iid, Mood } from '@vault-duel/engine';
import { buildContent } from '@vault-duel/engine/test-utils/content-builder';
import type { DefSpec } from '@vault-duel/engine/test-utils/content-builder';
import { withGlobals } from '@vault-duel/engine/test-utils/globals';
import { StateBuilder } from '@vault-duel/engine/test-utils/state';
import { ATTACK_RULES, createCollector, PLAY_RULES } from '../src';
import { effectiveAi } from '../src/collector/moods';
import type { AttackRuleId, PlayRuleId } from '../src/collector/config';
import type { RuleCtx } from '../src/collector/rules/context';
import type { AiConfig, Collector } from '../src';

export const ELEMENTS = [
  { id: 'fire', beats: ['air'] },
  { id: 'air', beats: ['water'] },
  { id: 'water', beats: ['fire'] },
  { id: 'void', beats: [] },
] as const;

type Elem = (typeof ELEMENTS)[number]['id'];

/** A monster. `pool` P = player, C = Collector (a Relic). */
export function mon(id: string, pool: 'P' | 'C', power: number, guard: number, element: Elem = 'void', kw: readonly string[] = []): DefSpec {
  return { id, type: 'monster', pool: pool === 'P' ? 'player' : 'collector', power, guard, element, kind: 'beast', kw };
}

export const SPELLS: readonly DefSpec[] = [
  { id: 'c-ledger', type: 'spell', pool: 'collector', spell: { effects: [{ op: 'draw', who: 'self', n: 2 }] } },
  {
    id: 'c-restoration',
    type: 'spell',
    pool: 'collector',
    spell: {
      target: { side: 'ally', zone: 'discard', where: { all: [{ type: 'monster' }, { relic: true }] } },
      effects: [{ op: 'returnToHand', target: 'chosen' }],
    },
  },
  {
    id: 'c-gilt',
    type: 'spell',
    pool: 'collector',
    spell: {
      target: { side: 'ally', zone: 'board', where: { faceUp: true } },
      effects: [{ op: 'modifyStats', target: 'chosen', power: '$T_GILT_POWER', guard: 2, duration: 'untilEndOfYourNextTurn' }],
    },
  },
  {
    id: 'c-forfeit',
    type: 'spell',
    pool: 'collector',
    spell: {
      target: { side: 'enemy', zone: 'board', where: { all: [{ faceUp: true }, { powerLte: '$T_FORFEIT_MAX' }] } },
      effects: [{ op: 'destroy', target: 'chosen' }],
    },
  },
  {
    id: 'c-smite',
    type: 'spell',
    pool: 'collector',
    spell: { target: { side: 'enemy', zone: 'board', where: { faceUp: true } }, effects: [{ op: 'destroy', target: 'chosen' }] },
  },
  {
    // Power only for a fire target: the effect has an `if`, which the cast on the redacted copy honours (D-219)
    id: 'c-gilt-fire',
    type: 'spell',
    pool: 'collector',
    spell: {
      target: { side: 'ally', zone: 'board', where: { faceUp: true } },
      effects: [{ op: 'modifyStats', target: 'chosen', power: 4, duration: 'untilEndOfYourNextTurn', if: { element: 'fire' } }],
    },
  },
  {
    id: 'c-blank',
    type: 'spell',
    pool: 'collector',
    spell: { target: { side: 'ally', zone: 'board', where: { faceUp: true } }, effects: [{ op: 'heal', who: 'self', n: 1 }] },
  },
];

export const TRAPS: readonly DefSpec[] = [
  { id: 'c-case', type: 'trap', pool: 'collector', trap: { trigger: 'enemyAttack', effects: [{ op: 'cancelAttack' }] } },
  { id: 'c-claim', type: 'trap', pool: 'collector', trap: { trigger: 'allyDestroyed', effects: [{ op: 'heal', who: 'self', n: 3 }] } },
  { id: 'c-counter', type: 'trap', pool: 'collector', trap: { trigger: 'enemyGraft', effects: [{ op: 'modifyStats', target: 'grafted', power: -3, duration: 'permanent' }] } },
  { id: 'c-extra-trap', type: 'trap', pool: 'collector', trap: { trigger: 'enemyAttack', effects: [{ op: 'cancelAttack' }] } },
];

export const GLOBALS: Globals = withGlobals({
  CONTENT_NUMBERS: { T_GILT_POWER: 2, T_FORFEIT_MAX: 4, AI_FACEDOWN_ATTACK_MIN_POWER: 7 },
});

/** A test-owned copy of the launch AI block, with this world's spell and trap ids. Parsed by the real schema. */
export const BASE_AI: AiConfig = CollectorAi.parse({
  allowFaceDown: false,
  reposition: 'toAttackIfUsable',
  play: ['winThisTurn', 'summonAce', 'summonBeater', 'setTrapWhenBehind', 'castHighValueSpell', 'summonFallback', 'utility'],
  attack: ['lethal', 'killWithoutLoss', 'faceDownIfStrong', 'directIfEmpty', 'holdExceptVain'],
  params: {
    setTrapWhenBehind: { compare: 'fewer' },
    summonFallback: { position: 'attack', slowPosition: 'guard', slowPick: 'highestGuard' },
    faceDownIfStrong: { minPower: '$AI_FACEDOWN_ATTACK_MIN_POWER' },
    killWithoutLoss: { allowTrades: false },
    castHighValueSpell: {
      'c-forfeit': { pick: 'highestPower' },
      'c-restoration': { pick: 'highestPower' },
      'c-gilt': { when: 'contestedAttack' },
    },
    summonBeater: { compare: 'previewAttack', skipBrittleCountered: false },
    utility: { order: ['castDrawSpell', 'setTrap', 'pass'] },
    summonLane: ['sentinelCenter', 'facingBeatable', 'facingEmpty', 'leftmostFree'],
  },
  moods: {
    composed: {
      params: { setTrapWhenBehind: { compare: 'fewerOrEqual' }, summonFallback: { position: 'guardUnlessBeater' } },
      attack: ['lethal', 'killWithoutLoss', 'directIfEmpty', 'holdExceptVain'],
    },
    agitated: {
      play: ['winThisTurn', 'summonAce', 'castHighValueSpell', 'summonBeater', 'setTrapWhenBehind', 'summonFallback', 'utility'],
      params: { killWithoutLoss: { allowTrades: true } },
    },
    desperate: {
      attack: ['lethal', 'attackAnything'],
      params: { faceDownIfStrong: { minPower: 0 } },
      reposition: 'allAttack',
    },
  },
  trapPreference: ['c-case', 'c-claim', 'c-counter'],
  tieBreak: ['leftmostSlot', 'cardId', 'instanceId'],
});

/** The same block with edits; used by tests that vary the data. */
export function withAi(edit: (ai: Record<string, unknown>) => void): AiConfig {
  const copy = JSON.parse(JSON.stringify(BASE_AI)) as Record<string, unknown>;
  edit(copy);
  return CollectorAi.parse(copy);
}

export interface World {
  readonly content: GameContent;
  readonly globals: Globals;
  readonly collector: Collector;
}

export function createWorld(cards: readonly DefSpec[], ai: AiConfig = BASE_AI, globals: Globals = GLOBALS): World {
  const defs: DefSpec[] = [mon('c-ace', 'C', 9, 5, 'void', ['covetous']), ...cards, ...SPELLS, ...TRAPS];
  const built = buildContent({
    elements: ELEMENTS,
    kinds: ['beast'],
    keywords: KEYWORDS,
    defs,
  });
  const content: GameContent = { ...built, collector: { deck: [], ace: built.index.get('c-ace') as number, canGraft: false, ai } };
  return { content, globals, collector: createCollector({ content, globals }) };
}

export interface MonsterOver {
  readonly pos?: 0 | 1;
  readonly faceDown?: boolean;
  readonly entered?: number;
  readonly attacked?: number;
  readonly wardUsed?: boolean;
  readonly permP?: number;
  readonly shroudUntil?: number;
  readonly unstableUntil?: number;
  readonly appraised?: boolean;
}

/** Builds a state with the Collector to move (turn 7 = round 4) and runs his policy on it. */
export class Scene {
  readonly b: StateBuilder;
  private moodIdx: Mood = 0;
  private readonly ids = new Map<string, Iid>();

  constructor(
    readonly world: World,
    turn = 7,
  ) {
    this.b = new StateBuilder(world.content, world.globals.BOARD_SLOTS, world.globals.TRAP_SLOTS).turn(turn);
  }

  private card(id: string, side: 0 | 1): Iid {
    const iid = this.b.card(id, side);
    this.ids.set(`${side}:${id}`, iid);
    return iid;
  }

  hand(side: 0 | 1, ...ids: string[]): this {
    for (const id of ids) this.b.hand(side, this.card(id, side));
    return this;
  }
  board(side: 0 | 1, slot: number, id: string, over: MonsterOver = {}): this {
    const iid = this.card(id, side);
    const o = { ...over };
    if (o.faceDown === true && o.pos === undefined) return this.place(side, slot, iid, { ...o, pos: 1 });
    return this.place(side, slot, iid, o);
  }
  private place(side: 0 | 1, slot: number, iid: Iid, over: MonsterOver): this {
    this.b.place(side, slot, iid, over);
    return this;
  }
  trap(side: 0 | 1, slot: number, id: string): this {
    this.b.setTrap(side, slot, this.card(id, side));
    return this;
  }
  discard(side: 0 | 1, ...ids: string[]): this {
    for (const id of ids) this.b.discard(side, this.card(id, side));
    return this;
  }
  vault(side: 0 | 1, ...ids: string[]): this {
    for (const id of ids) this.b.vault(side, this.card(id, side));
    return this;
  }
  life(side: 0 | 1, n: number): this {
    this.b.life(side, n);
    return this;
  }
  /** Sets the mood and a Collector life that agrees with it (the engine recomputes the mood from life after any damage). */
  mood(m: Mood): this {
    this.moodIdx = m;
    const g = this.world.globals;
    this.b.life(1, [g.COLLECTOR_LIFE, g.MOOD_AGITATED_AT, g.MOOD_DESPERATE_AT][m] as number);
    return this;
  }
  step(s: 'main' | 'attack'): this {
    this.b.step(s);
    return this;
  }

  state(): GameState {
    const s = this.b.build();
    return { ...s, collector: { mood: this.moodIdx, intent: null } };
  }

  /** Name of a card instance. */
  name(s: GameState, iid: Iid): string {
    return this.world.content.ids[(s.inst[iid] as { def: number }).def] as string;
  }

  fmt(s: GameState, a: Action): string {
    const n = (iid: Iid): string => (iid < 0 ? '-' : this.name(s, iid));
    switch (a.t) {
      case 'reposition':
        return `repos ${n(a.m)}`;
      case 'moveLane':
        return `move ${n(a.m)} > ${a.to}`;
      case 'summon':
        return `summon ${n(a.c)} ${a.mode}${a.lane === undefined ? '' : ` @${a.lane}`}`;
      case 'summonCovetous':
        return `covetous ${n(a.c)} sac ${n(a.sac)} ${a.mode}${a.lane === undefined ? '' : ` @${a.lane}`}`;
      case 'cast':
        return `cast ${n(a.c)} > ${n(a.target)}`;
      case 'setTrap':
        return `trap ${n(a.c)}`;
      case 'attack':
        return `attack ${n(a.a)} > ${a.target < 0 ? 'face' : n(a.target)}`;
      case 'endTurn':
        return 'end';
      default:
        return a.t;
    }
  }

  /** What the Collector does next in this scene, as text. */
  decide(collector: Collector = this.world.collector): string {
    const s = this.state();
    return this.fmt(s, collector.act(s));
  }

  /** Plays the Collector's whole turn through the engine and returns his actions. */
  turn(collector: Collector = this.world.collector): string[] {
    const engine = createEngine(this.world.content, this.world.globals, { intent: collector.intentPolicy }, { log: false });
    let s = this.state();
    const out: string[] = [];
    for (let i = 0; i < 40 && s.result === null && (s.turn & 1) === 1; i++) {
      const a = collector.act(s);
      out.push(this.fmt(s, a));
      s = engine.applyAction(s, a).state;
    }
    return out;
  }
}

/** Collector for this world with edited AI data (D-210: the block travels in the content; the spread leaves the hash stale, so tests only). */
export function collectorWith(world: World, ai: AiConfig): Collector {
  return createCollector({ content: { ...world.content, collector: { ...world.content.collector, ai } }, globals: world.globals });
}

// ---- rule runners: one rule in isolation -------------------------------------------------------------------------

export function ruleCtx(sc: Scene, ai: AiConfig = BASE_AI, collector: Collector = sc.world.collector): { ctx: RuleCtx; state: GameState } {
  const state = sc.state();
  const aceId = sc.world.content.ids[sc.world.content.collector.ace] as string;
  return { ctx: { view: collector.view(state), ai: effectiveAi(ai, state.collector.mood), globals: sc.world.globals, aceId }, state };
}

/** What one play rule picks in `sc` as text, or null. */
export function playRule(sc: Scene, id: PlayRuleId, ai: AiConfig = BASE_AI): string | null {
  const { ctx, state } = ruleCtx(sc, ai);
  const choice = PLAY_RULES[id](ctx);
  if (choice === null) return null;
  const legal = sc.world.collector.brain.engine.getLegalActions(state);
  return sc.fmt(state, legal[choice.index] as Action);
}

/** The attacks one attack rule lists in `sc`, best first. */
export function attackRule(sc: Scene, id: AttackRuleId, ai: AiConfig = BASE_AI): string[] {
  const { ctx, state } = ruleCtx(sc, ai);
  const legal = sc.world.collector.brain.engine.getLegalActions(state);
  return ATTACK_RULES[id](ctx).map((c) => sc.fmt(state, legal[c.index] as Action));
}
