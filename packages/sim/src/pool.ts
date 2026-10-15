// The worker pool (ARCHITECTURE.md §15): node:worker_threads, N = availableParallelism − 1 (min 1). Jobs are cut into
// batches of BATCH_SIZE; idle workers pull the next batch. Results are collected by batch index and merged in that
// order, and the merge is commutative anyway, so the outcome does not depend on the worker count or on scheduling.
import { availableParallelism } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { DuelJob, DuelOutcome } from '@vault-duel/ai';
import { mergeAll } from './aggregate';
import type { Aggregate } from './aggregate';
import { BATCH_SIZE } from './jobs';
import type { SimJob, WorkerRequest, WorkerResponse } from './jobs';

export function defaultWorkers(): number {
  return Math.max(1, availableParallelism() - 1);
}

/** The worker source is TypeScript, so each worker registers tsx first (the same loader `tsx cli.ts` uses). */
function workerOptions(): { execArgv: string[] } {
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;
  return { execArgv: ['--import', tsx] };
}

interface Slot {
  readonly worker: Worker;
  busy: boolean;
}

export interface RunStats {
  /** summed time the workers spent inside duels (excludes start-up) */
  busyMs: number;
  /** wall time of the call */
  wallMs: number;
  duels: number;
}

export class Pool {
  private readonly slots: Slot[] = [];
  private nextId = 0;

  private constructor(readonly size: number) {}

  /** Starts `size` workers and waits until each has loaded the content. */
  static async create(size: number, sets: readonly string[]): Promise<Pool> {
    const pool = new Pool(size);
    const url = new URL('./worker.ts', import.meta.url);
    const options = workerOptions();
    await Promise.all(
      Array.from({ length: size }, () => {
        const worker = new Worker(url, options);
        pool.slots.push({ worker, busy: false });
        return new Promise<void>((resolve, reject) => {
          worker.once('error', reject);
          worker.once('message', (message: WorkerResponse) => {
            worker.removeListener('error', reject);
            if (message.t === 'ready') resolve();
            else reject(new Error(message.t === 'error' ? message.message : 'worker did not start'));
          });
          worker.postMessage({ t: 'init', sets } satisfies WorkerRequest);
        });
      }),
    );
    return pool;
  }

  /** Sends `batches` through the workers; `done(index, response)` sees each response. Rejects on the first worker error. */
  private run(
    batches: readonly ({ readonly t: 'duels'; readonly jobs: readonly SimJob[] } | { readonly t: 'rate'; readonly jobs: readonly DuelJob[] })[],
    done: (index: number, response: WorkerResponse) => void,
    progress?: (finished: number, total: number) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let next = 0;
      let finished = 0;
      let failed = false;
      const owner = new Map<number, number>(); // request id → batch index
      const feed = (slot: Slot): void => {
        if (failed || next >= batches.length) return;
        const index = next++;
        const id = this.nextId++;
        owner.set(id, index);
        slot.busy = true;
        slot.worker.postMessage({ ...(batches[index] as { t: 'duels'; jobs: readonly SimJob[] }), id } satisfies WorkerRequest);
      };
      for (const slot of this.slots) {
        const onMessage = (response: WorkerResponse): void => {
          if (response.t === 'ready') return;
          slot.busy = false;
          if (response.t === 'error') {
            failed = true;
            cleanup();
            reject(new Error(response.message));
            return;
          }
          const index = owner.get(response.id) as number;
          owner.delete(response.id);
          done(index, response);
          finished++;
          progress?.(finished, batches.length);
          if (finished === batches.length) {
            cleanup();
            resolve();
          } else feed(slot);
        };
        const onError = (error: Error): void => {
          failed = true;
          cleanup();
          reject(error);
        };
        const cleanup = (): void => {
          for (const s of this.slots) {
            s.worker.removeAllListeners('message');
            s.worker.removeAllListeners('error');
          }
        };
        slot.worker.on('message', onMessage);
        slot.worker.on('error', onError);
      }
      if (batches.length === 0) {
        resolve();
        return;
      }
      for (const slot of this.slots) feed(slot);
    });
  }

  /** About BATCH_SIZE jobs per message, fewer when that would leave workers idle. Batching never changes a result. */
  private batchSize(jobs: number): number {
    return Math.max(1, Math.min(BATCH_SIZE, Math.ceil(jobs / this.size)));
  }

  /** Plays balance duels; returns their merged Aggregate and the timing. */
  async duels(jobs: readonly SimJob[], progress?: (finished: number, total: number) => void): Promise<{ aggregate: Aggregate; stats: RunStats }> {
    const start = performance.now();
    const batches: { t: 'duels'; jobs: readonly SimJob[] }[] = [];
    const size = this.batchSize(jobs.length);
    for (let i = 0; i < jobs.length; i += size) batches.push({ t: 'duels', jobs: jobs.slice(i, i + size) });
    const parts: Aggregate[] = new Array<Aggregate>(batches.length);
    let busyMs = 0;
    await this.run(batches, (index, response) => {
      if (response.t !== 'duels') throw new Error('unexpected response');
      parts[index] = response.aggregate;
      busyMs += response.busyMs;
    }, progress);
    return { aggregate: mergeAll(parts), stats: { busyMs, wallMs: performance.now() - start, duels: jobs.length } };
  }

  /** Plays difficulty-check duels; the outcomes come back in job order. */
  async rate(jobs: readonly DuelJob[], progress?: (finished: number, total: number) => void): Promise<{ outcomes: DuelOutcome[]; stats: RunStats }> {
    const start = performance.now();
    const batches: { t: 'rate'; jobs: readonly DuelJob[] }[] = [];
    const size = this.batchSize(jobs.length);
    for (let i = 0; i < jobs.length; i += size) batches.push({ t: 'rate', jobs: jobs.slice(i, i + size) });
    const parts: (readonly DuelOutcome[])[] = new Array<readonly DuelOutcome[]>(batches.length);
    let busyMs = 0;
    await this.run(batches, (index, response) => {
      if (response.t !== 'rate') throw new Error('unexpected response');
      parts[index] = response.outcomes;
      busyMs += response.busyMs;
    }, progress);
    return { outcomes: parts.flat(), stats: { busyMs, wallMs: performance.now() - start, duels: jobs.length } };
  }

  async close(): Promise<void> {
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
    this.slots.length = 0;
  }
}
