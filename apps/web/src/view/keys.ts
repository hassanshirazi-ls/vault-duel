// React keys for a side's monster row, extracted from Duel.tsx so a test can check them against real duels. Every kind
// of child has its own prefix, so an instance id can never equal a slot index (the bug that showed extra summoning
// zones and misplaced monsters).
import type { Monster } from '@vault-duel/engine';

export function monsterSlotKeys(board: readonly (Monster | null)[], ghostSlots: ReadonlySet<number>): string[] {
  return board.map((m, i) => (m === null ? (ghostSlots.has(i) ? `g-${i}` : `slot-${i}`) : `m-${m.iid}`));
}
