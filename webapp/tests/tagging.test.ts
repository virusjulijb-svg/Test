import { describe, expect, it } from 'vitest';
import { inferTags, splitEffects } from '../src/lib/tagging';
import { db, id } from './helpers';

const desc = (n: string) => db.get(id(n))!.desc;

describe('Effekterkennung', () => {
  it('erkennt Suche, Beschwörung und Friedhofseffekte', () => {
    expect(inferTags(desc("Magician's Rod"))).toEqual(['search']);
    expect(inferTags(desc("Magicians' Souls"))).toContain('deckSend');
    expect(inferTags(desc('Test Starter'))).toEqual(['deckSS']);
    expect(inferTags(desc('Test Extender'))).toEqual(['gySS']);
    expect(inferTags(desc('Monster Reborn'))).toEqual(['gySS']);
    expect(inferTags('Target 1 card in your GY; add it to your hand.')).toEqual(['gyAdd']);
    expect(inferTags('Banish 1 card from your opponent\'s GY.')).toEqual(['gyBanish']);
  });

  it('Handtrap-Texte selbst lösen nichts aus', () => {
    expect(inferTags(desc('Ash Blossom & Joyous Spring'))).toEqual([]);
    expect(inferTags(desc('Droll & Lock Bird'))).toEqual([]);
  });

  it('teilt Texte in einzelne Effekte', () => {
    const parts = splitEffects('If this card is Normal Summoned: You can add 1 card from your Deck to your hand. If this card is in your GY: You can Special Summon this card from your GY. You can only use each effect once per turn.');
    expect(parts).toHaveLength(2);
    expect(parts[0].tags).toEqual(['search']);
    expect(parts[1].tags).toEqual(['gySS']);
    expect(parts[1].text).toMatch(/once per turn/);
  });
});
