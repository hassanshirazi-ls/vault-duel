// Spell cast (ARCHITECTURE.md §5.1, §6.1, §9.1; D-067, D-068, D-155).
// The card leaves the hand for its owner's discard, SpellCast is emitted, the play is used (the same
// tail as every play), then the spell's effects are queued top to bottom with `chosen` bound to the
// target and run FIFO. Legality (a hand spell, a legal target from its TargetSpec) is legal.ts's business.
import { EngineError } from './errors';
import { makeRefs } from './effects/targets';
import type { Run } from './pipeline';
import { activeSide } from './stats';
import { playUsed } from './summon';
import type { Effect } from './types/effects';
import type { Iid } from './types/state';

// Judgment call: ARCHITECTURE.md §2 names no file for the cast action; it lives here.
export function castSpell(run: Run, c: Iid, target: Iid | -1): void {
  const { tx, env } = run;
  const side = activeSide(tx.state);
  const inst = tx.state.inst[c];
  const spell = inst === undefined ? null : (env.c.spell[inst.def] ?? null);
  if (inst === undefined || spell === null) throw new EngineError(`cast: ${c} is not a spell`);
  if (!tx.zoneRemove(side, 'hand', c)) throw new EngineError(`card ${c} is not in the hand of side ${side}`);
  tx.zonePush(inst.owner, 'discard', c);
  run.emit({ e: 'SpellCast', side, iid: c, target });
  playUsed(run);
  const refs = makeRefs({ chosen: target });
  for (let i = 0; i < spell.effects.length; i++) {
    run.queue({ effect: spell.effects[i] as Effect, refs, source: c, side });
  }
  run.flush();
}
