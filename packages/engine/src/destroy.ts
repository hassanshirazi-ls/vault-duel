// Destruction batch (ARCHITECTURE.md §5.5, D-034, D-043, D-044, D-047, D-122, D-133, D-134).
//
//   order the list (active side first, then slot order)
//   ask each monster's OWN active beforeDestroy keywords (Ward); 'prevent' -> wardUsed, WardBroken
//   snapshot last-known information (LKI) for the rest, before anything is removed
//   remove them all simultaneously to their OWNER's discard; emit Destroyed
//   dispatch onDestroyed for every monster (its own hooks by LKI.kw first), then flush queued effects once (D-158)
import { activeKwOf, activeSide, effectiveGuard, effectivePower, locate, locSide, locSlot } from './stats';
import { releaseSymbiote } from './symbiote';
import { markRound } from './track';
import type { Run } from './pipeline';
import { RoundFlag } from './types/state';
import type { DestroyedEvt } from './types/hooks';
import type { Iid, Pos, Side } from './types/state';

export type DestroyCause = 'combat' | 'effect' | 'unstable';

/** Who destroyed whom, for combat: `{T -> A}` and `{A -> T}` (§5.4). */
export interface DestroyerOf {
  readonly victim: Iid;
  readonly by: Iid;
}

const NO_DESTROYERS: readonly DestroyerOf[] = [];

interface Entry {
  readonly iid: Iid;
  readonly side: Side;
  readonly slot: number;
}

/** Board monsters among `iids`, de-duplicated, active side first then slot order (§5.5). */
function orderBatch(run: Run, iids: readonly Iid[]): Entry[] {
  const s = run.state;
  const active = activeSide(s);
  const out: Entry[] = [];
  for (let i = 0; i < iids.length; i++) {
    const iid = iids[i] as Iid;
    const loc = locate(s, iid);
    if (loc < 0) continue; // already gone: fizzles silently
    if (out.some((e) => e.iid === iid)) continue;
    out.push({ iid, side: locSide(loc), slot: locSlot(loc) });
  }
  const key = (e: Entry): number => (e.side === active ? 0 : 1) * 64 + e.slot;
  out.sort((a, b) => key(a) - key(b));
  return out;
}

/**
 * Destroy a set of board monsters as one batch. Returns the iids that were actually destroyed
 * (Ward-saved and already-gone monsters are left out), in batch order.
 */
export function destroyBatch(
  run: Run,
  iids: readonly Iid[],
  cause: DestroyCause,
  destroyerOf: readonly DestroyerOf[] = NO_DESTROYERS,
): Iid[] {
  const { tx, env } = run;
  const byOf = (iid: Iid): Iid | -1 => {
    for (let i = 0; i < destroyerOf.length; i++) {
      const d = destroyerOf[i] as DestroyerOf;
      if (d.victim === iid) return d.by;
    }
    return -1;
  };

  // 1. Replacement: only the monster's own active beforeDestroy bits are asked (D-134).
  const doomed: Entry[] = [];
  for (const e of orderBatch(run, iids)) {
    if (run.dispatcher().beforeDestroy({ iid: e.iid, cause, by: byOf(e.iid) }) === 'prevent') {
      // wardUsed switches off every beforeDestroy bit (D-133). A Ward-saved Unstable expiry also ends Unstable:
      // the bonus goes and no new timer starts (D-152 A).
      tx.patchMonster(e.side, e.slot, cause === 'unstable' ? { wardUsed: true, unstableUntil: -1 } : { wardUsed: true });
      run.emit({ e: 'WardBroken', iid: e.iid });
    } else {
      doomed.push(e);
    }
  }
  if (doomed.length === 0) return [];

  // 2. Last-known information, taken after Ward and before removal (D-122).
  const lki: DestroyedEvt[] = [];
  const posOf: Pos[] = []; // the host's position, for an emerging symbiote (D-308); parallel to `lki`
  for (const e of doomed) {
    const s = tx.state;
    const m = s.sides[e.side].board[e.slot];
    if (m === null || m === undefined) continue; // unreachable: slots are only written below
    lki.push({
      iid: e.iid,
      side: e.side,
      slot: e.slot,
      cause,
      by: byOf(e.iid),
      power: effectivePower(s, env, e.iid),
      guard: effectiveGuard(s, env, e.iid),
      kw: activeKwOf(s, env, m),
      sym: m.sym,
    });
    posOf.push(m.pos);
  }

  // 3. Simultaneous removal to the OWNER's discard (D-047).
  let lostPlayerMonster = false;
  for (const k of lki) {
    tx.setSlot(k.side, k.slot, null);
    const owner = tx.state.inst[k.iid]?.owner ?? k.side;
    tx.zonePush(owner, 'discard', k.iid);
    run.emit({ e: 'Destroyed', iid: k.iid, side: k.side, cause, by: k.by });
    if (k.side === 0) lostPlayerMonster = true;
  }
  if (lostPlayerMonster) markRound(tx, RoundFlag.LostMonster);

  // 3b. Symbiotes come out in their host's slot, after Destroyed and before any onDestroyed dispatch (D-308).
  for (let i = 0; i < lki.length; i++) {
    const k = lki[i] as DestroyedEvt;
    if (k.sym >= 0) releaseSymbiote(tx, run.host.emit, k.iid, k.sym, posOf[i] as Pos, k.side, k.slot, 'destroyed');
  }

  // 4. onDestroyed per monster: its own hooks (LKI.kw) first, then everyone else (§8.3.1b). The whole batch is
  //    dispatched against the same post-removal board, then the queued effects run once, FIFO (D-158).
  for (const k of lki) run.dispatcher().onDestroyed(k);
  run.flush();
  return lki.map((k) => k.iid);
}
