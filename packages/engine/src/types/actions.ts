// ARCHITECTURE.md §6.1.
import type { KwMask } from './content';
import type { Iid, Pos } from './state';

export type SummonMode = 'atk' | 'grd' | 'down'; // face-up attack, face-up guard, face-down guard

export type Action =
  | { readonly t: 'redraw' }
  | { readonly t: 'keep' }
  | { readonly t: 'reposition'; readonly m: Iid }
  | { readonly t: 'moveLane'; readonly m: Iid; readonly to: number } // FLAGS.LANES only (D-282)
  | { readonly t: 'summon'; readonly c: Iid; readonly mode: SummonMode; readonly lane?: number } // lane: required with FLAGS.LANES, absent = leftmost free (D-284)
  | { readonly t: 'summonCovetous'; readonly c: Iid; readonly sac: Iid; readonly mode: 'atk' | 'grd'; readonly lane?: number }
  | { readonly t: 'cast'; readonly c: Iid; readonly target: Iid | -1 }
  | { readonly t: 'setTrap'; readonly c: Iid }
  | { readonly t: 'graftBegin' }
  | { readonly t: 'graftPick'; readonly m: Iid }
  | { readonly t: 'graftSkipAscend' }
  | { readonly t: 'graftKeywords'; readonly kw: KwMask }
  | { readonly t: 'graftPosition'; readonly pos: Pos; readonly lane?: number }
  | { readonly t: 'graftCancel' }
  | { readonly t: 'split'; readonly m: Iid } // FLAGS.SPLIT: unbind own face-up Chimera m (D-307)
  | { readonly t: 'symbiose'; readonly c: Iid; readonly host: Iid } // FLAGS.SYMBIOSIS: attach hand monster c under face-up own host (D-308)
  | { readonly t: 'attack'; readonly a: Iid; readonly target: Iid | -1 }
  | { readonly t: 'endTurn' };

/** Visitor for `forEachLegal` (§6.2): return `true` to stop the enumeration early. */
export type ActionVisitor = (a: Action) => boolean;
