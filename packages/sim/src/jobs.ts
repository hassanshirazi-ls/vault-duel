// The simulator's run model (ARCHITECTURE.md §15): a job fully determines its duel, so no result depends on which
// worker ran it or in what order.
import type { DuelJob, DuelOutcome } from '@vault-duel/ai';
import type { Aggregate } from './aggregate';
import type { ContentOverrides } from './overrides';

/** The player bots the simulator can field. `expert-noisy` is the difficulty check's reference bot (D-094). */
export const BOT_IDS = ['novice', 'naive', 'greedy', 'expert', 'expert-noisy'] as const;
export type BotId = (typeof BOT_IDS)[number];

export function isBotId(text: string): text is BotId {
  return (BOT_IDS as readonly string[]).includes(text);
}

/** `(seedString, k, botId, runIndex)` plus the weekly twist of the date (derived from the date, so still a function of the job). */
export interface SimJob {
  readonly seedString: string;
  readonly k: number;
  readonly botId: BotId;
  readonly runIndex: number;
  readonly twist: number;
}

/** Jobs per message to a worker (ARCHITECTURE.md §15: "~250 duels"). */
export const BATCH_SIZE = 250;

export type WorkerRequest =
  | { readonly t: 'init'; readonly sets: readonly string[]; readonly content?: ContentOverrides }
  | { readonly t: 'duels'; readonly id: number; readonly jobs: readonly SimJob[] }
  | { readonly t: 'rate'; readonly id: number; readonly jobs: readonly DuelJob[] };

export type WorkerResponse =
  | { readonly t: 'ready' }
  | { readonly t: 'duels'; readonly id: number; readonly aggregate: Aggregate; readonly busyMs: number }
  | { readonly t: 'rate'; readonly id: number; readonly outcomes: readonly DuelOutcome[]; readonly busyMs: number }
  | { readonly t: 'error'; readonly id: number; readonly message: string };
