// ARCHITECTURE.md §6.1.
import type { KwMask } from './content';
import type { Iid, Pos } from './state';

export type SummonMode = 'atk' | 'grd' | 'down'; // face-up attack, face-up guard, face-down guard

export type Action =
  | { readonly t: 'redraw' }
  | { readonly t: 'keep' }
  | { readonly t: 'reposition'; readonly m: Iid }
  | { readonly t: 'summon'; readonly c: Iid; readonly mode: SummonMode }
  | { readonly t: 'summonCovetous'; readonly c: Iid; readonly sac: Iid; readonly mode: 'atk' | 'grd' }
  | { readonly t: 'cast'; readonly c: Iid; readonly target: Iid | -1 }
  | { readonly t: 'setTrap'; readonly c: Iid }
  | { readonly t: 'graftBegin' }
  | { readonly t: 'graftPick'; readonly m: Iid }
  | { readonly t: 'graftSkipAscend' }
  | { readonly t: 'graftKeywords'; readonly kw: KwMask }
  | { readonly t: 'graftPosition'; readonly pos: Pos }
  | { readonly t: 'graftCancel' }
  | { readonly t: 'attack'; readonly a: Iid; readonly target: Iid | -1 }
  | { readonly t: 'endTurn' };

/** Visitor for `forEachLegal` (§6.2): return `true` to stop the enumeration early. */
export type ActionVisitor = (a: Action) => boolean;
