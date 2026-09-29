import { idbGet, idbSet } from './idb';
import type { BanStatus, Card } from './types';

// Öffentliche YGOPRODeck-API (https://ygoprodeck.com/api-guide/).
// Die komplette Kartenliste wird einmal geladen und lokal in IndexedDB gespeichert;
// danach wird nur noch die Datenbankversion abgefragt.
export const API_BASE = 'https://db.ygoprodeck.com/api/v7';

/** Bildquelle; für öffentliches Hosting per VITE_IMAGE_BASE auf einen eigenen Spiegel umstellen. */
export const IMAGE_BASE: string =
  (import.meta.env?.VITE_IMAGE_BASE as string | undefined) ?? 'https://images.ygoprodeck.com/images';

export function imageUrl(imageId: number, size: 'small' | 'full' | 'cropped' = 'small') {
  const dir = size === 'small' ? 'cards_small' : size === 'cropped' ? 'cards_cropped' : 'cards';
  return `${IMAGE_BASE}/${dir}/${imageId}.jpg`;
}

interface ApiCard {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  linkval?: number;
  scale?: number;
  race: string;
  attribute?: string;
  archetype?: string;
  card_images?: { id: number }[];
  banlist_info?: { ban_tcg?: BanStatus; ban_ocg?: BanStatus };
}

export function compactCard(c: ApiCard): Card {
  const card: Card = {
    id: c.id,
    name: c.name,
    type: c.type,
    frameType: c.frameType,
    desc: c.desc ?? '',
    race: c.race ?? '',
    imageIds: c.card_images?.length ? c.card_images.map((i) => i.id) : [c.id],
  };
  if (c.atk != null) card.atk = c.atk;
  if (c.def != null) card.def = c.def;
  if (c.level != null) card.level = c.level;
  if (c.linkval != null) card.linkval = c.linkval;
  if (c.scale != null) card.scale = c.scale;
  if (c.attribute) card.attribute = c.attribute;
  if (c.archetype) card.archetype = c.archetype;
  if (c.banlist_info?.ban_tcg) card.banTcg = c.banlist_info.ban_tcg;
  if (c.banlist_info?.ban_ocg) card.banOcg = c.banlist_info.ban_ocg;
  return card;
}

interface Cached {
  version: string;
  checkedAt: number;
  cards: Card[];
}

const CACHE_KEY = 'cards-v1';
const CHECK_INTERVAL = 12 * 60 * 60 * 1000;

export interface LoadResult {
  cards: Card[];
  version: string;
  source: 'cache' | 'network' | 'cache-offline';
}

async function fetchVersion(): Promise<string> {
  const res = await fetch(`${API_BASE}/checkDBVer.php`);
  if (!res.ok) throw new Error(`checkDBVer: HTTP ${res.status}`);
  const data = (await res.json()) as { database_version?: string | number; last_update?: string }[];
  return String(data[0]?.database_version ?? data[0]?.last_update ?? 'unbekannt');
}

async function fetchAllCards(): Promise<Card[]> {
  const res = await fetch(`${API_BASE}/cardinfo.php`);
  if (!res.ok) throw new Error(`cardinfo: HTTP ${res.status}`);
  const json = (await res.json()) as { data: ApiCard[] };
  return json.data.map(compactCard);
}

export async function loadCards(opts: { force?: boolean; onStatus?: (s: string) => void } = {}): Promise<LoadResult> {
  const status = opts.onStatus ?? (() => {});
  let cached: Cached | undefined;
  try {
    cached = await idbGet<Cached>(CACHE_KEY);
  } catch {
    cached = undefined;
  }
  if (cached && !opts.force && Date.now() - cached.checkedAt < CHECK_INTERVAL) {
    return { cards: cached.cards, version: cached.version, source: 'cache' };
  }
  try {
    status('Prüfe Datenbankversion …');
    const version = await fetchVersion().catch(() => 'unbekannt');
    if (cached && !opts.force && version !== 'unbekannt' && version === cached.version) {
      await idbSet(CACHE_KEY, { ...cached, checkedAt: Date.now() }).catch(() => {});
      return { cards: cached.cards, version, source: 'cache' };
    }
    status('Lade Kartendatenbank (einmalig, einige MB) …');
    const cards = await fetchAllCards();
    await idbSet(CACHE_KEY, { version, checkedAt: Date.now(), cards } satisfies Cached).catch(() => {});
    return { cards, version, source: 'network' };
  } catch (e) {
    if (cached) return { cards: cached.cards, version: cached.version, source: 'cache-offline' };
    throw e;
  }
}
