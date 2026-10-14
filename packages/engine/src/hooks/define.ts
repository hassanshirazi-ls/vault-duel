// ARCHITECTURE.md §8.4, D-123: KeywordDef is declared in types/hooks.ts; re-exported here.
import type { KeywordDef } from '../types/hooks';

export type { KeywordDef };

export const defineKeyword = (k: KeywordDef): KeywordDef => k;
