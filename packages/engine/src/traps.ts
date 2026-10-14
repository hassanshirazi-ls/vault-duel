// Trap compiler (ARCHITECTURE.md §8.3, §9.1, §9.2; D-071 to D-073, D-122, D-158, D-163).
// Each TrapDef becomes a subscriber on the matching event hook. When its turn in the subscriber
// list comes it re-checks its trigger, then (1) spends itself, immediately, through the context
// (slot -> owner's discard, TrapTriggered; never a queued effect) and (2) hands its effects to the
// context in card order: `cancelAttack` runs at once (AttackContext), the rest are queued.
import type { CompiledContent, DefIdx } from './types/content';
import type { Effect, TrapDef, TrapTrigger } from './types/effects';
import type { AttackCtx, HookCtx, Hooks } from './types/hooks';
import type { Iid } from './types/state';

function fire(ctx: HookCtx<unknown>, def: TrapDef, subject: Iid): void {
  // `TrapDef.when` is checked when the trap's turn comes (D-071). Judgment call: its subject is the triggering
  // monster (attacker / destroyed / grafted); §9.1 does not say what a `when` condition is evaluated on.
  if (def.when !== undefined && !ctx.holds(def.when, subject)) return;
  ctx.spendTrap();
  for (let i = 0; i < def.effects.length; i++) ctx.effect(def.effects[i] as Effect);
}

/** Per-trigger hook tables. A new trigger fails to compile until it is added here. */
const COMPILERS: Readonly<Record<TrapTrigger, (def: TrapDef) => Hooks>> = {
  // An enemy monster declares an attack (any target). A cancelled attack is no longer an attack for later traps.
  enemyAttack: (def) => ({
    onAttackDeclared: (ctx: AttackCtx) => {
      if (ctx.cancelled || ctx.controller(ctx.evt.attacker) === ctx.side) return;
      fire(ctx, def, ctx.evt.attacker);
    },
  }),
  // An enemy monster declares a direct attack on the trap's owner.
  enemyDirectAttack: (def) => ({
    onAttackDeclared: (ctx: AttackCtx) => {
      if (ctx.cancelled || ctx.evt.target >= 0 || ctx.controller(ctx.evt.attacker) === ctx.side) return;
      fire(ctx, def, ctx.evt.attacker);
    },
  }),
  // A monster its owner controls is destroyed ("your/his monster" = controller at destruction, D-048).
  allyDestroyed: (def) => ({
    onDestroyed: (ctx) => {
      if (ctx.evt.side !== ctx.side) return;
      fire(ctx, def, ctx.evt.iid);
    },
  }),
  // The opponent completes a Graft.
  enemyGraft: (def) => ({
    onGraft: (ctx) => {
      if (ctx.evt.side === ctx.side) return;
      fire(ctx, def, ctx.evt.iid);
    },
  }),
};

/** Hooks for one trap definition. */
export function compileTrap(def: TrapDef): Hooks {
  return COMPILERS[def.trigger](def);
}

/** DefIdx -> compiled trap hooks (null for every non-trap definition); pass to `createEnv`. */
export function compileTraps(c: CompiledContent): (Hooks | null)[] {
  const out: (Hooks | null)[] = [];
  for (let d: DefIdx = 0; d < c.ids.length; d++) {
    const t = c.trap[d];
    out.push(t === null || t === undefined ? null : compileTrap(t));
  }
  return out;
}
