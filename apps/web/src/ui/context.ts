import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { GameActions, GameState_, GameStore } from '../store/game';

export const StoreContext = createContext<GameStore | null>(null);

export function useGame<T>(select: (s: GameState_ & GameActions) => T): T {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('StoreContext missing');
  return useStore(store, select);
}
