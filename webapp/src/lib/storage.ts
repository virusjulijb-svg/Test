import type { BanFormat, Combo, Deck } from './types';

export interface Settings {
  format: BanFormat;
  activeDeckId?: string;
  opponentDeckId?: string;
}

export interface Persisted {
  decks: Deck[];
  combos: Combo[];
  settings: Settings;
}

const KEY = 'ygo-lab-state-v1';

export function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      return { decks: p.decks ?? [], combos: p.combos ?? [], settings: { format: 'tcg', ...p.settings } };
    }
  } catch {
    // privater Modus oder beschädigte Daten: mit leerem Zustand starten
  }
  return { decks: [], combos: [], settings: { format: 'tcg' } };
}

export function saveState(s: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Speicher voll oder gesperrt – die App funktioniert weiter, nur ohne Speichern
  }
}
