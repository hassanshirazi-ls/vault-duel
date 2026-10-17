// Default-equivalence digests (D-310, D-315): a deterministic walk through whole duels, folded into one hash of every
// legal-action list, every chosen action, every event and the final state (minus `cfg`, which names the globals).
// The expected values in bond-equivalence.test.ts were produced by the engine as it was BEFORE the bond rules landed,
// so a match proves that with SPLIT, SYMBIOSIS and BOND_ACTION off the engine is the old engine: same legal actions,
// same events, same outcomes.
import { duelEngine } from './duel-fixture';
import { cyrb128 } from '../src/rng';
import { hashState } from '../src/replay';
import { rerollSeed, seedString } from '../src/setup/seed';
import type { Action } from '../src/types/actions';
import type { Globals } from '../src/types/globals';

export function walkDigest(g: Globals, n: number): string {
  const engine = duelEngine(g);
  const seed = rerollSeed(seedString(g, `2026-05-${(n % 28) + 1}`), n % 5);
  let s = engine.newGame(seed).state;
  const parts: string[] = [];
  let lastTurn = -1;
  let inTurn = 0;
  for (let i = 0; i < 4000 && s.result === null; i++) {
    const legal = engine.getLegalActions(s);
    if (s.turn !== lastTurn) {
      lastTurn = s.turn;
      inTurn = 0;
    }
    inTurn++;
    const pick = inTurn > 60 ? legal.length - 1 : (i * 7 + (i >> 2) + n * 13) % legal.length;
    const chosen = legal[pick] as Action;
    const r = engine.applyAction(s, chosen);
    parts.push(JSON.stringify(legal), JSON.stringify(chosen), JSON.stringify(r.events));
    s = r.state;
  }
  parts.push(hashState({ ...s, cfg: '' }));
  return cyrb128(parts.join('|')).map((x) => (x >>> 0).toString(16)).join('');
}
