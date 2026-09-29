import type { EffectTag } from './types';

export const TAG_LABELS: Record<EffectTag, string> = {
  search: 'Deck → Hand',
  deckSS: 'Beschwörung aus dem Deck',
  deckSend: 'Deck → Friedhof',
  gyAdd: 'Friedhof → Hand',
  gySS: 'Beschwörung aus dem Friedhof',
  gyBanish: 'Verbannen aus dem Friedhof',
};

export const ALL_TAGS = Object.keys(TAG_LABELS) as EffectTag[];

// Muster bleiben innerhalb eines Satzes ([^.]), damit Effekte nicht vermischt werden.
const S = '[^.]{0,160}?';
const GY = '(?:gy|graveyard)';
const PATTERNS: [EffectTag, RegExp][] = [
  ['search', new RegExp(`add${S}from your (?:hand or )?deck(?: or ${GY})?${S}to your hand`)],
  ['search', new RegExp(`add${S}from your (?:${GY} or )?deck to your hand`)],
  ['deckSS', new RegExp(`special summon${S}from your (?:hand(?:, | or ))?(?:${GY}(?:, | or ))?deck`)],
  ['deckSend', new RegExp(`send${S}from your (?:hand or )?deck(?: or extra deck)? to the ${GY}`)],
  ['gyAdd', new RegExp(`add${S}from your (?:deck or )?${GY}${S}to your hand`)],
  ['gySS', new RegExp(`special summon${S}from your (?:hand(?:, | or ))?(?:deck(?:, | or ))?${GY}`)],
  ['gySS', new RegExp(`special summon${S}from (?:either player's|your opponent's) ${GY}`)],
  ['gySS', new RegExp(`target${S}in (?:your|either|your opponent's)${S}${GY}${S}special summon (?:it|that)`)],
  ['gyAdd', new RegExp(`target${S}in your ${GY}${S}add (?:it|that)${S}to your hand`)],
  ['gyBanish', new RegExp(`(?<!you can )banish${S}from (?:your|either player's|your opponent's) ${GY}`)],
];

export function inferTags(text: string): EffectTag[] {
  const t = text.toLowerCase();
  const tags = new Set<EffectTag>();
  for (const [tag, re] of PATTERNS) if (re.test(t)) tags.add(tag);
  return [...tags];
}

export interface EffectPart {
  text: string;
  tags: EffectTag[];
}

/**
 * Teilt einen Kartentext in Sätze und erkennt pro Satz, welche Eigenschaften
 * (Suche, Beschwörung aus dem Deck …) er enthält. Die Erkennung ist eine Heuristik;
 * im Duell und im Combo Lab lassen sich die Häkchen immer von Hand anpassen.
 */
export function splitEffects(desc: string): EffectPart[] {
  const parts: EffectPart[] = [];
  for (const para of desc.split(/\r?\n/)) {
    const sentences = para.split(/(?<=[.])\s+(?=[A-Z●①-⑩"'(])/);
    let current = '';
    for (const s of sentences) {
      current = current ? `${current} ${s}` : s;
      // Kosten/Bedingung ("...: ") und Wirkung stehen im selben Satz; "once per turn"-Hinweise werden angehängt
      if (/^You can only/i.test(s) && parts.length) {
        parts[parts.length - 1].text += ` ${s}`;
        current = '';
        continue;
      }
      parts.push({ text: current.trim(), tags: inferTags(current) });
      current = '';
    }
  }
  return parts.filter((p) => p.text.length > 0);
}
