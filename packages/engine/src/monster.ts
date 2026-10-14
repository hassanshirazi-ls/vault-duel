// Monster factory (ARCHITECTURE.md §18.7): every board record is built here so all records share one
// hidden class (fields in a fixed order). Records are replaced, never mutated (§4.1).
import type { Iid, Monster, TimedMod } from './types/state';

/** Shared empty array for monsters without timed modifiers (§4 `Monster.timed`). */
export const NO_TIMED: readonly TimedMod[] = [];

export type MonsterInit = Partial<Omit<Monster, 'iid'>>;

export function makeMonster(iid: Iid, init: MonsterInit = {}): Monster {
  return {
    iid,
    pos: init.pos ?? 0,
    faceDown: init.faceDown ?? false,
    entered: init.entered ?? 0,
    repositioned: init.repositioned ?? -1,
    attacked: init.attacked ?? -1,
    wardUsed: init.wardUsed ?? false,
    permP: init.permP ?? 0,
    permG: init.permG ?? 0,
    timed: init.timed ?? NO_TIMED,
    unstableUntil: init.unstableUntil ?? -1,
    shroudUntil: init.shroudUntil ?? -1,
    appraised: init.appraised ?? false,
  };
}
