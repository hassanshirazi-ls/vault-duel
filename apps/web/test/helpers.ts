import { daySetupFor } from '@vault-duel/ai';
import * as content from '@vault-duel/content';
import type { Action } from '@vault-duel/engine';
import { loadGameContent } from '../src/content/load';
import { memoryStorage } from '../src/persistence/storage';
import { createGameStore } from '../src/store/game';
import type { GameStore } from '../src/store/game';

/** A fixed rating stands in for the difficulty check: the store only needs a k. */
export const RATING = { k: 0, winRate: 0.5, stars: 2, par: 6, check: 'accepted' } as const;

export function makeStore(date: string, storage = memoryStorage(), overrides: readonly string[] = []): { store: GameStore; storage: typeof storage } {
  const store = createGameStore({
    storage,
    dev: true,
    loadContent: () => loadGameContent(content, overrides),
    today: () => date,
    resolveSetup: (ctx, d) => Promise.resolve({ setup: daySetupFor(ctx, d, RATING), source: 'manifest' as const }),
  });
  return { store, storage };
}

/** Lets background work finish: boot resolves yesterday's vault for Practice off the boot path (D-375). */
export const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export async function started(date: string, storage = memoryStorage(), overrides: readonly string[] = []): Promise<ReturnType<typeof makeStore>> {
  const h = makeStore(date, storage, overrides);
  await h.store.getState().boot();
  await flush();
  h.store.getState().start();
  return h;
}

/** A simple player: keep, attack, summon, cast, set a trap, end the turn. Picks only from the store's legal list. */
export function simplePick(legal: readonly Action[]): Action {
  const first = (t: Action['t']): Action | undefined => legal.find((a) => a.t === t);
  const summonAtk = legal.find((a) => a.t === 'summon' && a.mode === 'atk');
  return (
    first('keep') ?? first('attack') ?? summonAtk ?? first('cast') ?? first('setTrap') ?? first('endTurn') ??
    first('graftCancel') ?? (legal[0] as Action)
  );
}
