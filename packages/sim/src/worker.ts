// A simulator worker thread (ARCHITECTURE.md §15). It loads and compiles the content once, with the run's `--set`
// overrides, builds its duel players once, then answers batches: balance duels come back as one Aggregate per batch,
// difficulty-check duels as their small outcomes. Never a per-game log.
import { performance } from 'node:perf_hooks';
import { parentPort } from 'node:worker_threads';
import { expertRunner } from '@vault-duel/ai';
import type { DuelOutcome, DuelRunner } from '@vault-duel/ai';
import type { Aggregate } from './aggregate';
import { createDuelPlayer } from './duel';
import type { DuelPlayer } from './duel';
import type { WorkerRequest, WorkerResponse } from './jobs';
import { loadContext } from './world';

const port = parentPort;
if (port === null) throw new Error('worker.ts must run inside a worker thread');

let player: DuelPlayer | null = null;
let runner: DuelRunner | null = null;

function send(message: WorkerResponse): void {
  port?.postMessage(message);
}

port.on('message', (request: WorkerRequest) => {
  try {
    if (request.t === 'init') {
      const ctx = loadContext(request.sets, request.content);
      player = createDuelPlayer(ctx);
      runner = expertRunner(ctx);
      send({ t: 'ready' });
    } else if (request.t === 'duels') {
      if (player === null) throw new Error('worker not initialised');
      const aggregate: Aggregate = {};
      const start = performance.now();
      for (const job of request.jobs) player.play(job, aggregate);
      send({ t: 'duels', id: request.id, aggregate, busyMs: performance.now() - start });
    } else {
      if (runner === null) throw new Error('worker not initialised');
      const start = performance.now();
      const outcomes: DuelOutcome[] = request.jobs.map((job) => (runner as DuelRunner)(job));
      send({ t: 'rate', id: request.id, outcomes, busyMs: performance.now() - start });
    }
  } catch (error) {
    send({ t: 'error', id: 'id' in request ? request.id : -1, message: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  }
});
