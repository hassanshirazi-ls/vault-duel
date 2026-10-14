// Effect-primitive DSL schemas (ARCHITECTURE.md §9.1 and §10.2). Types are checked against the
// engine's `Cond`, `Effect`, `TargetSpec` and `TrapTrigger` (packages/engine/src/types/effects.ts).
import { z } from 'zod';
import type {
  Cond as EngineCond,
  Effect as EngineEffect,
  TargetSpec as EngineTargetSpec,
  TrapTrigger as EngineTrapTrigger,
} from '@vault-duel/engine';
import { Id, Num } from './common';

export const Who = z.enum(['self', 'opponent']);
export const Duration = z.enum(['permanent', 'thisTurn', 'untilEndOfYourNextTurn', 'untilYourNextTurn']);
export const Ref = z.enum(['chosen', 'self', 'attacker', 'defender', 'destroyed', 'destroyer', 'grafted']);
export const TrapTrigger = z.enum(['enemyAttack', 'enemyDirectAttack', 'allyDestroyed', 'enemyGraft']) satisfies z.ZodType<EngineTrapTrigger>;

/** Conditions. Recursive, so it is declared lazily and typed against the engine's `Cond`. */
export const Cond: z.ZodType<EngineCond> = z.lazy(() =>
  z.union([
    z.object({ faceUp: z.literal(true) }).strict(),
    z.object({ powerLte: Num }).strict(),
    z.object({ powerGte: Num }).strict(),
    z.object({ type: z.literal('monster') }).strict(),
    z.object({ relic: z.literal(true) }).strict(),
    z.object({ chimera: z.literal(true) }).strict(),
    z.object({ onBoard: z.literal(true) }).strict(),
    z.object({ directAttack: z.boolean() }).strict(),
    z.object({ graftedThisTurn: z.literal(true) }).strict(),
    z.object({ element: Id }).strict(),
    z.object({ kind: Id }).strict(),
    z.object({ keyword: Id }).strict(),
    z.object({ all: z.array(Cond) }).strict(),
    z.object({ any: z.array(Cond) }).strict(),
    z.object({ not: Cond }).strict(),
  ]),
);

/** Spell target: the caster picks one candidate (§9.1 `TargetSpec`). */
export const TargetSpec: z.ZodType<EngineTargetSpec> = z
  .object({
    side: z.enum(['ally', 'enemy']),
    zone: z.enum(['board', 'discard']),
    where: z.exactOptional(Cond),
  })
  .strict();

/** One effect primitive, discriminated on `op` (§9.1 `Effect`). */
export const Effect: z.ZodType<EngineEffect> = z.discriminatedUnion('op', [
  z.object({ op: z.literal('draw'), who: Who, n: Num, if: z.exactOptional(Cond) }).strict(),
  z.object({ op: z.literal('damage'), who: Who, n: Num, if: z.exactOptional(Cond) }).strict(),
  z.object({ op: z.literal('heal'), who: Who, n: Num, if: z.exactOptional(Cond) }).strict(),
  z
    .object({
      op: z.literal('modifyStats'),
      target: Ref,
      power: z.exactOptional(Num),
      guard: z.exactOptional(Num),
      duration: Duration,
      if: z.exactOptional(Cond),
    })
    .strict(),
  z.object({ op: z.literal('destroy'), target: Ref, if: z.exactOptional(Cond) }).strict(),
  z.object({ op: z.literal('returnToHand'), target: Ref, if: z.exactOptional(Cond) }).strict(),
  z
    .object({ op: z.literal('changePosition'), target: Ref, to: z.enum(['attack', 'guard']), if: z.exactOptional(Cond) })
    .strict(),
  z
    .object({ op: z.literal('preventAppraisal'), target: Ref, duration: z.literal('untilYourNextTurn'), if: z.exactOptional(Cond) })
    .strict(),
  z.object({ op: z.literal('cancelAttack'), if: z.exactOptional(Cond) }).strict(),
]);
