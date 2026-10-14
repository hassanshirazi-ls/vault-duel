// kinds.json entry (ARCHITECTURE.md §10.1).
import { z } from 'zod';
import { Id } from './common';

export const Kind = z
  .object({
    id: Id,
    name: z.string(),
    profile: z.string(),
    graftRole: z.string(),
    silhouette: z.string().min(1),
  })
  .strict();
