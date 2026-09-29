import type { CardDb } from './carddb';
import type { Card, Deck } from './types';

export type InterruptionTiming = 'chain' | 'afterSearch' | 'afterSummon' | 'turnStart' | 'drawEngine' | 'botTurn';

export interface InterruptionDef {
  id: string;
  /** Englischer Kartenname wie in der YGOPRODeck-Datenbank */
  cardName: string;
  short: string;
  timing: InterruptionTiming;
  /** Harte Einmal-pro-Zug-Beschränkung des Kartennamens */
  opt: boolean;
  /** Wie der Bot die Karte einsetzt (vereinfachte Regelumsetzung) */
  howBotUsesIt: string;
}

// Vereinfachte Umsetzung der gängigsten Unterbrechungen. Spezialfälle der Regeln
// (z. B. Kettenblöcke, Kosten-Rulings) werden bewusst nicht vollständig abgebildet.
export const INTERRUPTIONS: InterruptionDef[] = [
  { id: 'ash', cardName: 'Ash Blossom & Joyous Spring', short: 'Ash Blossom', timing: 'chain', opt: true,
    howBotUsesIt: 'Annulliert einen Effekt, der aus dem Deck sucht, beschwört oder auf den Friedhof legt.' },
  { id: 'maxx', cardName: 'Maxx "C"', short: 'Maxx "C"', timing: 'drawEngine', opt: true,
    howBotUsesIt: 'Wird früh im Zug aktiviert; danach zieht der Bot bei jeder Spezialbeschwörung 1 Karte.' },
  { id: 'veiler', cardName: 'Effect Veiler', short: 'Effect Veiler', timing: 'chain', opt: false,
    howBotUsesIt: 'Annulliert den Effekt eines offenen Monsters auf dem Spielfeld bis zum Ende des Zuges.' },
  { id: 'imperm', cardName: 'Infinite Impermanence', short: 'Imperm', timing: 'chain', opt: false,
    howBotUsesIt: 'Aus der Hand, solange der Bot keine Karten kontrolliert: annulliert ein offenes Monster auf dem Spielfeld.' },
  { id: 'ogre', cardName: 'Ghost Ogre & Snow Rabbit', short: 'Ghost Ogre', timing: 'chain', opt: true,
    howBotUsesIt: 'Zerstört eine Karte auf dem Spielfeld, die ihren Effekt aktiviert (der Effekt löst trotzdem auf).' },
  { id: 'belle', cardName: 'Ghost Belle & Haunted Mansion', short: 'Ghost Belle', timing: 'chain', opt: true,
    howBotUsesIt: 'Annulliert Effekte, die aus dem Friedhof zur Hand nehmen, beschwören oder verbannen.' },
  { id: 'gamma', cardName: 'PSY-Framegear Gamma', short: 'PSY-Gamma', timing: 'chain', opt: false,
    howBotUsesIt: 'Annulliert einen Monstereffekt und zerstört die Karte, solange der Bot keine Monster kontrolliert.' },
  { id: 'crow', cardName: 'D.D. Crow', short: 'D.D. Crow', timing: 'chain', opt: false,
    howBotUsesIt: 'Verbannt eine Karte aus deinem Friedhof, die gerade dort ihren Effekt aktiviert.' },
  { id: 'droll', cardName: 'Droll & Lock Bird', short: 'Droll', timing: 'afterSearch', opt: true,
    howBotUsesIt: 'Nach deiner ersten Suche: für den Rest des Zuges kann keine Karte mehr aus dem Deck zur Hand genommen werden.' },
  { id: 'nibiru', cardName: 'Nibiru, the Primal Being', short: 'Nibiru', timing: 'afterSummon', opt: true,
    howBotUsesIt: 'Nach deiner 5. Beschwörung im Zug: alle offenen Monster werden als Tribut angeboten, du erhältst eine Spielmarke.' },
  { id: 'shifter', cardName: 'Dimension Shifter', short: 'Dimension Shifter', timing: 'turnStart', opt: true,
    howBotUsesIt: 'Zu Beginn deines Zuges (Friedhof des Bots ist leer): Karten, die auf den Friedhof kämen, werden verbannt.' },
  { id: 'harpie', cardName: "Harpie's Feather Duster", short: 'Harpie’s', timing: 'botTurn', opt: true,
    howBotUsesIt: 'Im Zug des Bots: zerstört alle deine Zauber- und Fallenkarten.' },
  { id: 'storm', cardName: 'Lightning Storm', short: 'Lightning Storm', timing: 'botTurn', opt: true,
    howBotUsesIt: 'Im Zug des Bots (ohne eigene offene Karten): zerstört alle deine Monster in Angriffsposition oder alle Zauber/Fallen.' },
  { id: 'raigeki', cardName: 'Raigeki', short: 'Raigeki', timing: 'botTurn', opt: false,
    howBotUsesIt: 'Im Zug des Bots: zerstört alle deine Monster.' },
  { id: 'drnm', cardName: 'Dark Ruler No More', short: 'Dark Ruler No More', timing: 'botTurn', opt: false,
    howBotUsesIt: 'Im Zug des Bots: annulliert die Effekte aller deiner offenen Monster.' },
  { id: 'droplet', cardName: 'Forbidden Droplet', short: 'Forbidden Droplet', timing: 'botTurn', opt: true,
    howBotUsesIt: 'Im Zug des Bots: legt übrige Handkarten als Kosten ab und annulliert ebenso viele deiner offenen Karten.' },
  { id: 'evenly', cardName: 'Evenly Matched', short: 'Evenly Matched', timing: 'botTurn', opt: false,
    howBotUsesIt: 'Ende der Battle Phase des Bots: du verbannst verdeckt, bis du so viele Karten kontrollierst wie der Bot.' },
];

export const INTERRUPTION_BY_ID = new Map(INTERRUPTIONS.map((i) => [i.id, i]));

/** Karten des Spielers, die eine Bot-Unterbrechung beantworten können und zusätzlich den Namen sperren. */
export const NAME_LOCK_CARDS = ['Called by the Grave', 'Crossout Designator'];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const BY_NAME = new Map(INTERRUPTIONS.map((i) => [norm(i.cardName), i]));

/** Welche Unterbrechung eine Karte im Bot-Deck darstellt (eigene Zuordnung hat Vorrang). */
export function interruptionFor(card: Card | undefined, deck?: Deck): InterruptionDef | undefined {
  if (!card) return undefined;
  const custom = deck?.botRoles[String(card.id)];
  if (custom === 'none') return undefined;
  if (custom) return INTERRUPTION_BY_ID.get(custom);
  return BY_NAME.get(norm(card.name));
}

export function isNameLockCard(card: Card | undefined) {
  return !!card && NAME_LOCK_CARDS.some((n) => norm(n) === norm(card.name));
}

/** Vorlagen für Gegner-Decks: nur das Interaktionspaket, der Rest sind Platzhalter. */
export const BOT_TEMPLATES: { id: string; name: string; description: string; cards: [string, number][] }[] = [
  {
    id: 'handtraps',
    name: 'Vorlage: Handtrap-Paket (breit)',
    description: '15 verbreitete Handtraps, Rest ohne Interaktion. Für realistische Tests besser ein echtes Deck importieren.',
    cards: [
      ['Ash Blossom & Joyous Spring', 3], ['Maxx "C"', 3], ['Infinite Impermanence', 3],
      ['Effect Veiler', 2], ['Nibiru, the Primal Being', 2], ['Droll & Lock Bird', 1], ['Ghost Belle & Haunted Mansion', 1],
    ],
  },
  {
    id: 'breakers',
    name: 'Vorlage: Handtraps + Board-Breaker',
    description: 'Handtraps für deinen Zug und Board-Breaker für den Zug des Bots.',
    cards: [
      ['Ash Blossom & Joyous Spring', 3], ['Infinite Impermanence', 2], ['Effect Veiler', 2], ['Nibiru, the Primal Being', 1],
      ['Harpie\'s Feather Duster', 1], ['Lightning Storm', 1], ['Dark Ruler No More', 2], ['Forbidden Droplet', 2], ['Evenly Matched', 1],
    ],
  },
  {
    id: 'gy',
    name: 'Vorlage: Anti-Friedhof',
    description: 'Gegen friedhoflastige Decks: Belle, D.D. Crow, Dimension Shifter, Ash.',
    cards: [
      ['Ghost Belle & Haunted Mansion', 3], ['D.D. Crow', 2], ['Dimension Shifter', 2], ['Ash Blossom & Joyous Spring', 3], ['Ghost Ogre & Snow Rabbit', 2],
    ],
  },
];

export function templateToIds(t: (typeof BOT_TEMPLATES)[number], db: CardDb, size = 40): { main: number[]; missing: string[] } {
  const main: number[] = [];
  const missing: string[] = [];
  for (const [name, n] of t.cards) {
    const c = db.byExactName(name);
    if (!c) { missing.push(name); continue; }
    for (let i = 0; i < n; i++) main.push(c.id);
  }
  while (main.length < size) main.push(0);
  return { main, missing };
}
