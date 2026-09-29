export type BanStatus = 'Forbidden' | 'Limited' | 'Semi-Limited';
export type BanFormat = 'tcg' | 'ocg';

/** Kompakte Kartendaten, abgeleitet aus der YGOPRODeck-API (cardinfo.php). */
export type CardLang = 'de' | 'en';

export interface Card {
  id: number;
  /** Name in der Anzeigesprache (Deutsch, falls übersetzt und gewählt) */
  name: string;
  /** Englischer Originalname: Grundlage für Handtrap-Erkennung und .ydk-Vorlagen */
  nameEn: string;
  /** z. B. "Effect Monster", "Spell Card", "Link Monster" */
  type: string;
  /** z. B. "effect", "spell", "trap", "fusion", "xyz", "link" */
  frameType: string;
  /** Kartentext in der Anzeigesprache */
  desc: string;
  /** Englischer Originaltext: Grundlage der Effekterkennung */
  descEn: string;
  /** Deutsche Übersetzung vorhanden */
  hasDe?: boolean;
  atk?: number;
  def?: number;
  level?: number;
  linkval?: number;
  scale?: number;
  /** Monster: Typ (Spellcaster …); Zauber/Fallen: Normal, Quick-Play, Continuous … */
  race: string;
  attribute?: string;
  archetype?: string;
  banTcg?: BanStatus;
  banOcg?: BanStatus;
  /** Alle Bild-IDs (Alternativ-Artworks); die erste ist das Standardbild. */
  imageIds: number[];
}

export type DeckZone = 'main' | 'extra' | 'side';

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Requirement {
  kind: 'category' | 'card';
  /** Kategorie-ID oder Karten-ID */
  ref: string;
  min: number;
  /** leer = unbegrenzt */
  max?: number;
}

/** Erfolgsbedingung: ODER über Varianten, jede Variante ist ein UND über Anforderungen. */
export interface Condition {
  id: string;
  name: string;
  variants: Requirement[][];
}

export interface Deck {
  id: string;
  name: string;
  main: number[];
  extra: number[];
  side: number[];
  updatedAt: number;
  categories: Category[];
  /** Karten-ID → Kategorie-IDs */
  cardCategories: Record<string, string[]>;
  conditions: Condition[];
  /** Karten-ID → Bot-Verhalten (Interruption-ID), überschreibt die Erkennung per Name */
  botRoles: Record<string, string>;
}

/** Eigenschaften einer Aktivierung, auf die Handtraps reagieren. */
export type EffectTag = 'search' | 'deckSS' | 'deckSend' | 'gyAdd' | 'gySS' | 'gyBanish';

export type ActionKind = 'normalSummon' | 'setMonster' | 'specialSummon' | 'activate' | 'setSpellTrap';
export type Zone = 'deck' | 'hand' | 'field' | 'gy' | 'banished' | 'extra';

export interface Branch {
  id: string;
  /** Interruption-ID (z. B. "ash") oder "other" */
  condition: string;
  note: string;
  steps: ComboStep[];
}

export interface ComboStep {
  id: string;
  cardId: number;
  action: ActionKind;
  from: Zone;
  tags: EffectTag[];
  /** Karte, die durch den Effekt gesucht/beschworen/gelegt wird (für die Wiedergabe im Duell) */
  targetCardId?: number;
  note: string;
  choke: boolean;
  branches: Branch[];
}

export interface Combo {
  id: string;
  deckId: string;
  name: string;
  notes: string;
  /** Karten, die in der Starthand liegen müssen */
  start: number[];
  steps: ComboStep[];
}
