// Shared primitives for the content schemas (ARCHITECTURE.md §10.2).
import { z } from 'zod';
import type { Num as EngineNum } from '@vault-duel/engine';

/** Lowercase kebab-case id, e.g. "kiln-whelp" (§10.2). */
export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are kebab-case');

/** A global reference such as "$UNMAKE_MAX_POWER" or "-$MIRROR_SIGIL_PENALTY" (D-074). */
const GlobalRef = z.custom<`$${string}` | `-$${string}`>(
  (value) => typeof value === 'string' && /^-?\$[A-Z0-9_]+$/.test(value),
  { message: 'expected a global reference like "$NAME" or "-$NAME"' },
);

/** A literal integer or a global reference (§9.1 `Num`). Refs are resolved by the engine, not here. */
export const Num: z.ZodType<EngineNum> = z.union([z.int(), GlobalRef]);

/** Printed stat: integer 0 to 20 (§10.2). */
export const Stat = z.int().min(0).max(20);
