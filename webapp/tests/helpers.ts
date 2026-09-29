import { readFileSync } from 'node:fs';
import { compactCard } from '../src/lib/api';
import { CardDb } from '../src/lib/carddb';
import { newDeck } from '../src/lib/deck';
import type { Deck } from '../src/lib/types';

const raw = JSON.parse(readFileSync(new URL('../e2e/fixtures/cardinfo.json', import.meta.url), 'utf8'));
export const db = new CardDb(raw.data.map(compactCard));

export const id = (name: string) => {
  const c = db.byExactName(name);
  if (!c) throw new Error(`Karte fehlt im Testdatensatz: ${name}`);
  return c.id;
};

export function deckOf(entries: [string, number][], size = 40, filler = 'Mystical Space Typhoon'): Deck {
  const d = newDeck('Test');
  for (const [n, k] of entries) for (let i = 0; i < k; i++) d.main.push(id(n));
  while (d.main.length < size) d.main.push(id(filler));
  return d;
}
