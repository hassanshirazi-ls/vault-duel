// elements.json entry (ARCHITECTURE.md §10.2).
import { z } from 'zod';
import { Id } from './common';

export const Element = z
  .object({
    id: Id,
    name: z.string(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a hex color in the form "#RRGGBB"'),
    icon: z.string().min(1),
    beats: z.array(Id),
    identity: z.string(),
  })
  .strict();
