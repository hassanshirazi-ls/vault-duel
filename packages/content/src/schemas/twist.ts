// twists.json entry (ARCHITECTURE.md §10.1; compiled shape CompiledTwist in §3, D-121).
import { z } from 'zod';
import { Id } from './common';
import { Cond } from './effect';

export const Twist = z
  .object({
    id: Id,
    text: z.string().min(1),
    isoWeek: z.exactOptional(z.string().regex(/^\d{4}-W\d{2}$/, 'expected an ISO week like "2026-W42"')),
    modifiers: z.array(
      z
        .object({
          where: Cond,
          power: z.exactOptional(z.int()),
          guard: z.exactOptional(z.int()),
        })
        .strict(),
    ),
  })
  .strict();
