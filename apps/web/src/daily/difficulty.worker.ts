// The on-device difficulty check (D-099, D-236): runs `prepareDay` in a Web Worker and reports progress.
import { expertRunner, prepareDay } from '@vault-duel/ai';
import type { DuelRunner } from '@vault-duel/ai';
import * as content from '@vault-duel/content';
import { loadGameContent } from '../content/load';
import type { Rating } from './manifest';

export type WorkerRequest = { readonly date: string; readonly overrides: readonly string[] };
export type WorkerResponse =
  | { readonly type: 'progress'; readonly k: number; readonly run: number; readonly runs: number }
  | { readonly type: 'done'; readonly rating: Rating }
  | { readonly type: 'error'; readonly message: string };

const post = (m: WorkerResponse): void => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const loaded = loadGameContent(content, e.data.overrides);
    if (!loaded.ok) throw new Error(loaded.lines.join('\n'));
    const ctx = loaded.ctx;
    const base = expertRunner(ctx);
    const every = Math.max(1, Math.floor(ctx.globals.SIM_RUNS_PER_SEED / 20));
    const run: DuelRunner = (job) => {
      if (job.runIndex % every === 0) post({ type: 'progress', k: job.k, run: job.runIndex, runs: ctx.globals.SIM_RUNS_PER_SEED });
      return base(job);
    };
    const day = prepareDay(ctx, e.data.date, run);
    post({ type: 'done', rating: { k: day.k, ...day.difficulty } });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
