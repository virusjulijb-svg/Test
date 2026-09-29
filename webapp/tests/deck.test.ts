import { describe, expect, it } from 'vitest';
import { addCard, newDeck, normalizeImport, parseYdk, parseYdke, toYdk, toYdke, validateDeck } from '../src/lib/deck';
import { db, deckOf, id } from './helpers';

describe('Deck-Import/Export', () => {
  it('.ydk hin und zurück', () => {
    const d = { main: [46986414, 46986414, 7084129], extra: [1861629], side: [14558127] };
    expect(parseYdk(toYdk(d))).toEqual(d);
    expect(parseYdk('#created by x\r\n#main\r\n123\r\n\r\n#extra\r\n!side\r\n456\r\n')).toEqual({ main: [123], extra: [], side: [456] });
  });

  it('ydke:// hin und zurück', () => {
    const d = { main: [46986414, 7084129], extra: [1861629], side: [] };
    const url = toYdke(d);
    expect(url.startsWith('ydke://')).toBe(true);
    expect(parseYdke(url)).toEqual(d);
    expect(() => parseYdke('https://example.com')).toThrow();
  });

  it('Import sortiert Extra-Deck-Karten um und meldet unbekannte IDs', () => {
    const r = normalizeImport({ main: [1861629, 46986414, 999], extra: [], side: [] }, db);
    expect(r.main).toEqual([46986414]);
    expect(r.extra).toEqual([1861629]);
    expect(r.unknown).toEqual([999]);
  });
});

describe('Deckregeln', () => {
  it('Banlist und Kopienlimit beim Hinzufügen', () => {
    let d = newDeck();
    expect(addCard(d, id('Pot of Greed'), db, 'tcg')).toMatch(/verboten/);
    const r1 = addCard(d, id('Raigeki'), db, 'tcg');
    expect(typeof r1).toBe('object');
    d = r1 as typeof d;
    expect(addCard(d, id('Raigeki'), db, 'tcg')).toMatch(/Höchstens 1/);
    const r2 = addCard(d, id('Decode Talker'), db, 'tcg');
    expect(typeof r2 === 'object' && r2.extra).toEqual([id('Decode Talker')]);
  });

  it('Validierung', () => {
    expect(validateDeck(deckOf([], 30), db, 'tcg')[0]).toMatch(/mindestens 40/);
    const ok = deckOf([['Test Starter', 3]], 40, 'Dark Magician');
    // 37× Dark Magician ist zu viel
    expect(validateDeck(ok, db, 'tcg').some((e) => e.includes('Dark Magician'))).toBe(true);
  });
});
