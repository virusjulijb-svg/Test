import { CardDb, isExtraDeckCard, maxCopies } from './carddb';
import type { BanFormat, Deck, DeckZone } from './types';
import { uid } from './util';

export const DEFAULT_CATEGORIES = [
  { id: 'starter', name: 'Starter', color: '#3fb950' },
  { id: 'extender', name: 'Extender', color: '#58a6ff' },
  { id: 'handtrap', name: 'Handtrap', color: '#d29922' },
  { id: 'brick', name: 'Brick', color: '#f85149' },
];

export function newDeck(name = 'Neues Deck'): Deck {
  return {
    id: uid(),
    name,
    main: [],
    extra: [],
    side: [],
    updatedAt: Date.now(),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    cardCategories: {},
    conditions: [
      { id: uid(), name: 'Spielbare Hand', variants: [[{ kind: 'category', ref: 'starter', min: 1 }]] },
    ],
    botRoles: {},
  };
}

export interface ParsedDeck {
  main: number[];
  extra: number[];
  side: number[];
}

/** .ydk (EDOPro/YGOPRODeck): Abschnitte #main, #extra, !side; eine Karten-ID pro Zeile. */
export function parseYdk(text: string): ParsedDeck {
  const out: ParsedDeck = { main: [], extra: [], side: [] };
  let zone: DeckZone | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#main')) zone = 'main';
    else if (line.startsWith('#extra')) zone = 'extra';
    else if (line.startsWith('!side')) zone = 'side';
    else if (line.startsWith('#') || line.startsWith('!')) continue;
    else if (zone && /^\d+$/.test(line)) out[zone].push(Number(line));
  }
  return out;
}

export function toYdk(d: ParsedDeck): string {
  return ['#created by YGO Lab', '#main', ...d.main, '#extra', ...d.extra, '!side', ...d.side, ''].join('\n');
}

function b64ToIds(s: string): number[] {
  if (!s) return [];
  const bin = atob(s);
  const ids: number[] = [];
  for (let i = 0; i + 3 < bin.length; i += 4) {
    ids.push(
      (bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8) | (bin.charCodeAt(i + 2) << 16) | (bin.charCodeAt(i + 3) << 24)) >>> 0,
    );
  }
  return ids;
}

function idsToB64(ids: number[]): string {
  let bin = '';
  for (const id of ids) bin += String.fromCharCode(id & 255, (id >>> 8) & 255, (id >>> 16) & 255, (id >>> 24) & 255);
  return btoa(bin);
}

/** ydke://-Links (EDOPro, DuelingBook-Export): drei Base64-Blöcke mit 32-Bit-IDs (Little Endian). */
export function parseYdke(url: string): ParsedDeck {
  const m = url.trim().match(/^ydke:\/\/([^!]*)!([^!]*)!([^!]*)!?$/);
  if (!m) throw new Error('Kein gültiger ydke://-Link');
  return { main: b64ToIds(m[1]), extra: b64ToIds(m[2]), side: b64ToIds(m[3]) };
}

export function toYdke(d: ParsedDeck): string {
  return `ydke://${idsToB64(d.main)}!${idsToB64(d.extra)}!${idsToB64(d.side)}!`;
}

/** Importierte IDs normalisieren (Alternativ-Artworks) und Extra-Deck-Karten richtig einsortieren. */
export function normalizeImport(p: ParsedDeck, db: CardDb): ParsedDeck & { unknown: number[] } {
  const out = { main: [] as number[], extra: [] as number[], side: [] as number[], unknown: [] as number[] };
  for (const zone of ['main', 'extra', 'side'] as const) {
    for (const id of p[zone]) {
      const c = db.get(id);
      if (!c) { out.unknown.push(id); continue; }
      if (zone === 'side') out.side.push(c.id);
      else out[isExtraDeckCard(c) ? 'extra' : 'main'].push(c.id);
    }
  }
  return out;
}

export function copiesInDeck(deck: Deck, id: number) {
  return [...deck.main, ...deck.extra, ...deck.side].filter((x) => x === id).length;
}

/** Fügt eine Karte hinzu; gibt eine Fehlermeldung zurück, wenn es nicht erlaubt ist. */
export function addCard(deck: Deck, id: number, db: CardDb, format: BanFormat, zone: 'auto' | 'side' = 'auto'): Deck | string {
  const c = db.get(id);
  if (!c) return 'Unbekannte Karte';
  const limit = maxCopies(c, format);
  if (copiesInDeck(deck, c.id) >= limit) {
    return limit === 0 ? `${c.name} ist verboten.` : `Höchstens ${limit}× ${c.name} erlaubt.`;
  }
  const target: DeckZone = zone === 'side' ? 'side' : isExtraDeckCard(c) ? 'extra' : 'main';
  const max = target === 'main' ? 60 : 15;
  if (deck[target].length >= max) return `${zoneName(target)} ist voll (${max}).`;
  return { ...deck, [target]: [...deck[target], c.id], updatedAt: Date.now() };
}

export function removeCard(deck: Deck, id: number, zone: DeckZone): Deck {
  const i = deck[zone].lastIndexOf(id);
  if (i < 0) return deck;
  const list = [...deck[zone]];
  list.splice(i, 1);
  return { ...deck, [zone]: list, updatedAt: Date.now() };
}

export const zoneName = (z: DeckZone) => (z === 'main' ? 'Main Deck' : z === 'extra' ? 'Extra Deck' : 'Side Deck');

export function validateDeck(deck: Deck, db: CardDb, format: BanFormat): string[] {
  const errors: string[] = [];
  if (deck.main.length < 40) errors.push(`Main Deck hat ${deck.main.length} Karten (mindestens 40).`);
  if (deck.main.length > 60) errors.push(`Main Deck hat ${deck.main.length} Karten (höchstens 60).`);
  if (deck.extra.length > 15) errors.push(`Extra Deck hat ${deck.extra.length} Karten (höchstens 15).`);
  if (deck.side.length > 15) errors.push(`Side Deck hat ${deck.side.length} Karten (höchstens 15).`);
  const counts = new Map<number, number>();
  for (const id of [...deck.main, ...deck.extra, ...deck.side]) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    const c = db.get(id);
    if (!c) { errors.push(`Unbekannte Karten-ID ${id}.`); continue; }
    const limit = maxCopies(c, format);
    if (n > limit) errors.push(limit === 0 ? `${c.name} ist verboten.` : `${n}× ${c.name}, erlaubt sind ${limit}.`);
  }
  for (const id of deck.main) {
    const c = db.get(id);
    if (c && isExtraDeckCard(c)) { errors.push(`${c.name} gehört ins Extra Deck.`); break; }
  }
  return errors;
}

/** Sortierung für die Deckanzeige: Monster, Zauber, Fallen; innerhalb nach Name. */
export function sortIds(ids: number[], db: CardDb): number[] {
  const order = (id: number) => {
    const c = db.get(id);
    if (!c) return 9;
    if (c.frameType === 'spell') return 2;
    if (c.frameType === 'trap') return 3;
    return 1;
  };
  return [...ids].sort((a, b) => order(a) - order(b) || (db.get(a)?.name ?? '').localeCompare(db.get(b)?.name ?? ''));
}
