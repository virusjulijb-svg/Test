import { createContext, useContext } from 'react';
import type { CardDb } from './lib/carddb';
import type { Persisted, Settings } from './lib/storage';
import type { Combo, Deck } from './lib/types';

export interface Store {
  db: CardDb;
  state: Persisted;
  activeDeck: Deck | undefined;
  saveDeck: (d: Deck) => void;
  deleteDeck: (id: string) => void;
  saveCombo: (c: Combo) => void;
  deleteCombo: (id: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  toast: (msg: string) => void;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreContext fehlt');
  return s;
}
