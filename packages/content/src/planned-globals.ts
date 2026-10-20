// Planned globals (ARCHITECTURE.md §11, D-205): every core global and flag whose reader is a module that isn't built yet.
// A planned global is not pinned, so any sane value is accepted and takes effect when its reader lands. The reader
// tripwire (test/globals-readers.test.ts) keeps this list true: delete a line in the change that wires the reader.
// Browser-safe: no node:* import. Flags are written FLAGS.<NAME>.

export interface PlannedGlobal {
  readonly reader: 'engine' | 'ai' | 'sim' | 'web';
  readonly where: string;
}

export const PLANNED_GLOBALS: Readonly<Record<string, PlannedGlobal>> = {};
