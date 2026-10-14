// recipes.json entry: one Chimera family per unordered kind pair (ARCHITECTURE.md §10.2).
import { z } from 'zod';
import { Id, Stat } from './common';

export const Recipe = z
  .object({
    id: Id,
    name: z.string(),
    kinds: z.tuple([Id, Id]),
    power: Stat,
    guard: Stat,
  })
  .strict();
