// art-briefs.json: one line per card id and Chimera family id (ARCHITECTURE.md §10.1, D-110).
import { z } from 'zod';
import { Id } from './common';

export const ArtBriefs = z.record(
  Id,
  z
    .string()
    .min(1)
    .regex(/^[^\n]+$/, 'art briefs are one line'),
);
