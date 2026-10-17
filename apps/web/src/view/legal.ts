// Action-to-UI mapping. Everything the player can do is a member of `getLegalActions(state)`; this file only sorts
// that list into the places the UI offers them (a card, a monster, a stage button). It decides nothing about rules.
import type { Action, Iid, SummonMode } from '@vault-duel/engine';

export interface LegalGroups {
  readonly keep: Action | null;
  readonly redraw: Action | null;
  readonly endTurn: Action | null;
  readonly graftBegin: Action | null;
  readonly graftCancel: Action | null;
  readonly graftSkipAscend: Action | null;
  /** hand card -> its summon actions (one per mode) */
  readonly summons: ReadonlyMap<Iid, readonly Extract<Action, { t: 'summon' }>[]>;
  readonly summonCovetous: ReadonlyMap<Iid, readonly Extract<Action, { t: 'summonCovetous' }>[]>;
  readonly casts: ReadonlyMap<Iid, readonly Extract<Action, { t: 'cast' }>[]>;
  readonly setTraps: ReadonlyMap<Iid, Action>;
  /** board monster -> reposition / attacks */
  readonly repositions: ReadonlyMap<Iid, Action>;
  /** board monster -> its lane moves, one per destination lane (FLAGS.LANES only, D-282) */
  readonly moveLanes: ReadonlyMap<Iid, readonly Extract<Action, { t: 'moveLane' }>[]>;
  readonly attacks: ReadonlyMap<Iid, readonly Extract<Action, { t: 'attack' }>[]>;
  readonly graftPicks: ReadonlyMap<Iid, Action>;
  readonly graftKeywords: readonly Extract<Action, { t: 'graftKeywords' }>[];
  readonly graftPositions: readonly Extract<Action, { t: 'graftPosition' }>[];
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

export function groupLegal(legal: readonly Action[]): LegalGroups {
  let keep: Action | null = null;
  let redraw: Action | null = null;
  let endTurn: Action | null = null;
  let graftBegin: Action | null = null;
  let graftCancel: Action | null = null;
  let graftSkipAscend: Action | null = null;
  const summons = new Map<Iid, Extract<Action, { t: 'summon' }>[]>();
  const summonCovetous = new Map<Iid, Extract<Action, { t: 'summonCovetous' }>[]>();
  const casts = new Map<Iid, Extract<Action, { t: 'cast' }>[]>();
  const setTraps = new Map<Iid, Action>();
  const repositions = new Map<Iid, Action>();
  const moveLanes = new Map<Iid, Extract<Action, { t: 'moveLane' }>[]>();
  const attacks = new Map<Iid, Extract<Action, { t: 'attack' }>[]>();
  const graftPicks = new Map<Iid, Action>();
  const graftKeywords: Extract<Action, { t: 'graftKeywords' }>[] = [];
  const graftPositions: Extract<Action, { t: 'graftPosition' }>[] = [];
  for (const a of legal) {
    switch (a.t) {
      case 'keep': keep = a; break;
      case 'redraw': redraw = a; break;
      case 'endTurn': endTurn = a; break;
      case 'graftBegin': graftBegin = a; break;
      case 'graftCancel': graftCancel = a; break;
      case 'graftSkipAscend': graftSkipAscend = a; break;
      case 'summon': push(summons, a.c, a); break;
      case 'summonCovetous': push(summonCovetous, a.c, a); break;
      case 'cast': push(casts, a.c, a); break;
      case 'setTrap': setTraps.set(a.c, a); break;
      case 'reposition': repositions.set(a.m, a); break;
      case 'moveLane': push(moveLanes, a.m, a); break;
      case 'attack': push(attacks, a.a, a); break;
      case 'graftPick': graftPicks.set(a.m, a); break;
      case 'graftKeywords': graftKeywords.push(a); break;
      case 'graftPosition': graftPositions.push(a); break;
    }
  }
  return {
    keep, redraw, endTurn, graftBegin, graftCancel, graftSkipAscend, summons, summonCovetous, casts, setTraps, repositions, moveLanes,
    attacks, graftPicks, graftKeywords, graftPositions,
  };
}

export const MODE_LABEL: Readonly<Record<SummonMode, string>> = {
  atk: 'Attack position',
  grd: 'Guard position',
  down: 'Face-down guard',
};

export const POSITION_LABEL = ['Attack position', 'Guard position'] as const;
