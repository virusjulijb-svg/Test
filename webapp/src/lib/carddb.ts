import type { GermanTexts } from './api';
import type { BanFormat, Card } from './types';

export const EXTRA_FRAMES = new Set([
  'fusion', 'synchro', 'xyz', 'link', 'fusion_pendulum', 'synchro_pendulum', 'xyz_pendulum',
]);

/** Platzhalter für Karten ohne Interaktion in Vorlagen-Decks des Bots. */
export const FILLER_ID = 0;
const FILLER: Card = {
  id: FILLER_ID,
  name: 'Engine-Karte (ohne Interaktion)',
  nameEn: 'Engine card (no interaction)',
  type: 'Platzhalter',
  frameType: 'normal',
  desc: 'Steht für eine Karte des Gegners, die im ersten Zug nicht interagiert.',
  descEn: '',
  race: '',
  imageIds: [],
};

/** Spielmarke, die Nibiru dem Spieler gibt. */
export const TOKEN_ID = -2;
const TOKEN: Card = {
  id: TOKEN_ID,
  name: 'Primal Being Token',
  nameEn: 'Primal Being Token',
  type: 'Token',
  frameType: 'token',
  desc: 'Spielmarke von Nibiru, the Primal Being (ATK/DEF entsprechen Nibiru).',
  descEn: '',
  race: 'Rock',
  atk: 3000,
  def: 600,
  imageIds: [],
};

export const isExtraDeckCard = (c: Card) => EXTRA_FRAMES.has(c.frameType);
export const isMonster = (c: Card) => c.type.includes('Monster') || c.frameType === 'token';
export const isSpell = (c: Card) => c.frameType === 'spell';
export const isTrap = (c: Card) => c.frameType === 'trap';

export function banStatus(c: Card, format: BanFormat) {
  return format === 'tcg' ? c.banTcg : c.banOcg;
}

export function maxCopies(c: Card, format: BanFormat): number {
  switch (banStatus(c, format)) {
    case 'Forbidden': return 0;
    case 'Limited': return 1;
    case 'Semi-Limited': return 2;
    default: return 3;
  }
}

export interface SearchFilter {
  text?: string;
  /** Name oder auch Kartentext durchsuchen */
  inDesc?: boolean;
  kind?: '' | 'monster' | 'spell' | 'trap' | 'extra';
  attribute?: string;
  race?: string;
  level?: number;
  archetype?: string;
  banlist?: '' | 'legal' | 'Forbidden' | 'Limited' | 'Semi-Limited';
  format?: BanFormat;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export class CardDb {
  readonly cards: Card[];
  private byId = new Map<number, Card>();
  private byName = new Map<string, Card>();

  /** Anzahl der Karten mit deutscher Übersetzung (0 = Englisch) */
  readonly germanCount: number;

  constructor(cards: Card[], german?: GermanTexts | null) {
    let germanCount = 0;
    const localized = german
      ? cards.map((c) => {
          const de = german.get(c.id);
          if (!de) return c;
          germanCount++;
          return { ...c, name: de.name, desc: de.desc || c.descEn, hasDe: true };
        })
      : cards;
    this.germanCount = germanCount;
    this.cards = [...localized].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    for (const c of this.cards) {
      this.byId.set(c.id, c);
      for (const alt of c.imageIds) if (!this.byId.has(alt)) this.byId.set(alt, c);
      this.byName.set(norm(c.nameEn), c);
      if (!this.byName.has(norm(c.name))) this.byName.set(norm(c.name), c);
    }
    this.byId.set(FILLER_ID, FILLER);
    this.byId.set(TOKEN_ID, TOKEN);
  }

  get size() { return this.cards.length; }

  /** Auch Alternativ-Artwork-IDs (z. B. aus .ydk-Dateien) werden aufgelöst. */
  get(id: number): Card | undefined { return this.byId.get(id); }

  /** Kanonische ID (Alternativ-Artworks → Haupt-ID). */
  canonical(id: number): number { return this.byId.get(id)?.id ?? id; }

  byExactName(name: string): Card | undefined { return this.byName.get(norm(name)); }

  archetypes(): string[] {
    return [...new Set(this.cards.map((c) => c.archetype).filter((a): a is string => !!a))].sort();
  }

  search(f: SearchFilter, limit = 5000): Card[] {
    const q = f.text?.trim().toLowerCase() ?? '';
    const out: Card[] = [];
    for (const c of this.cards) {
      if (
        q && !c.name.toLowerCase().includes(q) && !c.nameEn.toLowerCase().includes(q) &&
        !(f.inDesc && (c.desc.toLowerCase().includes(q) || c.descEn.toLowerCase().includes(q)))
      ) continue;
      if (f.kind === 'monster' && (!isMonster(c) || isExtraDeckCard(c))) continue;
      if (f.kind === 'extra' && !isExtraDeckCard(c)) continue;
      if (f.kind === 'spell' && !isSpell(c)) continue;
      if (f.kind === 'trap' && !isTrap(c)) continue;
      if (f.attribute && c.attribute !== f.attribute) continue;
      if (f.race && c.race !== f.race) continue;
      if (f.level != null && (c.level ?? c.linkval) !== f.level) continue;
      if (f.archetype && c.archetype !== f.archetype) continue;
      if (f.banlist) {
        const s = banStatus(c, f.format ?? 'tcg');
        if (f.banlist === 'legal' ? s === 'Forbidden' : s !== f.banlist) continue;
      }
      out.push(c);
      if (out.length >= limit) break;
    }
    if (q) {
      // exakte und Präfix-Treffer zuerst
      const rank = (c: Card) => {
        const r = (n: string) => (n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3);
        return Math.min(r(c.name.toLowerCase()), r(c.nameEn.toLowerCase()));
      };
      out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'de'));
    }
    return out;
  }
}
