// Which duels a run plays. Game i of a bot uses date i mod D and reroll k = i div D, so every game has its own seed
// (a deterministic bot would repeat itself on a repeated seed), and every bot plays the same seeds.
import { twistFor } from '@vault-duel/ai';
import { seedString } from '@vault-duel/engine';
import type { BotId, SimJob } from './jobs';
import type { SimContext } from './world';

export function balanceJobs(ctx: SimContext, bot: BotId, games: number, dates: readonly string[]): SimJob[] {
  const bases = dates.map((date) => ({ seed: seedString(ctx.globals, date), twist: twistFor(ctx.content, ctx.globals, date) }));
  const jobs: SimJob[] = [];
  for (let i = 0; i < games; i++) {
    const day = bases[i % bases.length] as (typeof bases)[number];
    jobs.push({ seedString: day.seed, k: Math.floor(i / bases.length), botId: bot, runIndex: 0, twist: day.twist });
  }
  return jobs;
}
