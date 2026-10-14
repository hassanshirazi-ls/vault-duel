/**
 * Thrown for engine invariant violations (ARCHITECTURE.md §4.1, §8.3.7). Actions are atomic
 * (the base state is never written), so an EngineError leaves the caller's state intact.
 * ARCHITECTURE.md does not name a file for it; it lives here.
 */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}
