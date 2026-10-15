// Card schemas (ARCHITECTURE.md §10.1 and §10.2). Spell and trap bodies are DSL data (§9.2).
import { z } from 'zod';
import type { SpellDef as EngineSpellDef, TrapDef as EngineTrapDef } from '@vault-duel/engine';
import { Id, Stat } from './common';
import { Effect, Cond, TargetSpec, TrapTrigger } from './effect';

/** Base player monster (cards/player-monsters.json). */
export const PlayerMonster = z
  .object({
    id: Id,
    type: z.literal('monster'),
    name: z.string().min(1),
    element: Id,
    kind: Id,
    power: Stat,
    guard: Stat,
    // The count is checked by validate.ts against MAX_BASE_KEYWORDS (D-201), not here.
    keywords: z.array(Id).default([]),
    text: z.exactOptional(z.string()),
  })
  .strict();

/** Collector Relic (cards/relics.json): a monster with exactly one Flaw. */
export const Relic = PlayerMonster.extend({ flaw: Id }).strict();

/** Spell (player or Collector). Effects use the §9.2 DSL. */
export const Spell = z
  .object({
    id: Id,
    type: z.literal('spell'),
    name: z.string(),
    text: z.string(),
    target: z.exactOptional(TargetSpec),
    effects: z.array(Effect).min(1),
  })
  .strict();

/** Trap (player or Collector). */
export const Trap = z
  .object({
    id: Id,
    type: z.literal('trap'),
    name: z.string(),
    text: z.string(),
    trigger: TrapTrigger,
    when: z.exactOptional(Cond),
    effects: z.array(Effect).min(1),
  })
  .strict();

// Compile-time proof that the spell/trap schemas produce the engine's DSL definitions (§3, D-120).
export const SpellDefShape: z.ZodType<EngineSpellDef> = Spell;
export const TrapDefShape: z.ZodType<EngineTrapDef> = Trap;
