// objectives.json entry (ARCHITECTURE.md §10.1 and §10.3 metric list).
import { z } from 'zod';
import { Id, Num } from './common';

export const OBJECTIVE_METRICS = ['grafts', 'playerLife', 'round', 'appraisedLost'] as const;

export const Objective = z
  .object({
    id: Id,
    text: z.string().min(1),
    requiresWin: z.literal(true),
    metric: z.enum(OBJECTIVE_METRICS),
    lte: z.exactOptional(Num),
    gte: z.exactOptional(Num),
  })
  .strict()
  .refine((objective) => (objective.lte === undefined) !== (objective.gte === undefined), {
    message: 'needs exactly one of "lte" or "gte"',
    params: { fix: 'keep exactly one of "lte" or "gte"' },
  });
