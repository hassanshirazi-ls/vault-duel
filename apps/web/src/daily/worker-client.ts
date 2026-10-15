import type { CheckProgress } from './rating';
import type { Rating } from './manifest';
import type { WorkerRequest, WorkerResponse } from './difficulty.worker';

/** Starts the difficulty worker for one date. The worker is terminated when it answers. */
export function computeInWorker(date: string, onProgress: (p: CheckProgress) => void): Promise<Rating> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./difficulty.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress({ k: m.k, run: m.run, runs: m.runs });
      else {
        worker.terminate();
        if (m.type === 'done') resolve(m.rating);
        else reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'difficulty worker failed'));
    };
    const request: WorkerRequest = { date };
    worker.postMessage(request);
  });
}
