// collector.json (ARCHITECTURE.md §10.1, §13.2, D-097). The AI block is data consumed by ai/collector.
import { z } from 'zod';
import { Id, Num } from './common';

const Pick = z.object({ pick: z.string() }).strict();

/** Per-rule parameters (§13.2). Base params are complete; mood overrides may set any subset. */
const AiParams = z
  .object({
    setTrapWhenBehind: z.object({ compare: z.string() }).strict(),
    summonFallback: z
      .object({ position: z.string(), slowPosition: z.string(), slowPick: z.string() })
      .strict()
      .partial(),
    faceDownIfStrong: z.object({ minPower: Num }).strict(),
    killWithoutLoss: z.object({ allowTrades: z.boolean() }).strict(),
    castHighValueSpell: z
      .object({
        forfeit: Pick,
        restoration: Pick,
        'gilt-frame': z.object({ when: z.string() }).strict(),
      })
      .strict(),
    summonBeater: z.object({ compare: z.string(), skipBrittleCountered: z.boolean() }).strict(),
    utility: z.object({ order: z.array(z.string()) }).strict(),
  })
  .strict()
  .partial();

const MoodOverride = z
  .object({
    play: z.exactOptional(z.array(z.string())),
    attack: z.exactOptional(z.array(z.string())),
    reposition: z.exactOptional(z.string()),
    params: z.exactOptional(AiParams),
  })
  .strict();

export const CollectorAi = z
  .object({
    allowFaceDown: z.boolean(),
    reposition: z.string(),
    play: z.array(z.string()),
    attack: z.array(z.string()),
    params: AiParams,
    moods: z
      .object({ composed: MoodOverride, agitated: MoodOverride, desperate: MoodOverride })
      .strict(),
    trapPreference: z.array(Id),
    tieBreak: z.array(z.string()),
  })
  .strict();

export const Collector = z
  .object({
    deck: z.array(Id),
    ace: Id,
    canGraft: z.literal(false),
    ai: CollectorAi,
    dialogue: z
      .object({ composed: z.array(z.string()), agitated: z.array(z.string()), desperate: z.array(z.string()) })
      .strict(),
  })
  .strict();
