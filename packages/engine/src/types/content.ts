// ARCHITECTURE.md §3.
import type { SpellDef, TrapDef, Cond } from './effects';
import type { HookName, KeywordDef } from './hooks';

export type DefIdx = number; // index into defs (base cards AND Chimera families)
export type ElemIdx = number;
export type KindIdx = number;
export type KwMask = number; // bit i = keyword/Flaw registry index i (<= 32)

export const DefType = { Monster: 0, Spell: 1, Trap: 2, Family: 3 } as const;
export const Pool = { Player: 0, Collector: 1 } as const;

/** Compiled spell/trap: the DSL definitions of §9.1 (Num refs stay symbolic; resolved against Globals at run time). */
export type CompiledSpell = SpellDef;
export type CompiledTrap = TrapDef;

/** twists.json entry (§10.1): `{ id, text, isoWeek?, modifiers: [{ where, power?, guard? }] }`. */
export interface CompiledTwist {
  readonly id: string;
  readonly text: string;
  readonly isoWeek?: string;
  readonly modifiers: readonly { readonly where: Cond; readonly power?: number; readonly guard?: number }[];
}

export interface CompiledContent {
  readonly version: string;
  readonly hash: string;
  readonly ids: readonly string[];
  readonly index: ReadonlyMap<string, DefIdx>;
  readonly type: Uint8Array;
  readonly pool: Uint8Array;
  readonly power: Int8Array;
  readonly guard: Int8Array;
  readonly element: Int8Array;
  readonly kind: Int8Array;
  readonly kw: Uint32Array;
  readonly spell: readonly (CompiledSpell | null)[];
  readonly trap: readonly (CompiledTrap | null)[];
  readonly nElements: number;
  readonly nKinds: number;
  readonly beats: Uint8Array;
  readonly opposes: Uint8Array;
  readonly recipe: Int16Array;
  readonly keywords: readonly KeywordDef[];
  readonly kwBit: Readonly<Record<string, number>>;
  readonly hookMask: Readonly<Record<HookName, KwMask>>;
  readonly playerPool: {
    readonly monsters: readonly DefIdx[];
    readonly spells: readonly DefIdx[];
    readonly traps: readonly DefIdx[];
  };
  readonly collector: { readonly deck: readonly DefIdx[]; readonly ace: DefIdx; readonly canGraft: boolean };
  readonly twists: readonly CompiledTwist[];
}
