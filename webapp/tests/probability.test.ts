import { describe, expect, it } from 'vitest';
import { analyze, binom, hypergeoAtLeast, withCopies } from '../src/lib/probability';
import type { Deck } from '../src/lib/types';
import { deckOf, id } from './helpers';

function withCats(d: Deck, map: Record<string, string[]>): Deck {
  const cardCategories: Record<string, string[]> = {};
  for (const [name, cats] of Object.entries(map)) cardCategories[String(id(name))] = cats;
  return { ...d, cardCategories };
}

/** Brute-Force über alle Teilmengen (nur für kleine Decks). */
function brute(deck: number[], n: number, pred: (hand: number[]) => boolean): number {
  let hit = 0, total = 0;
  const rec = (start: number, hand: number[]) => {
    if (hand.length === n) { total++; if (pred(hand)) hit++; return; }
    for (let i = start; i < deck.length; i++) rec(i + 1, [...hand, deck[i]]);
  };
  rec(0, []);
  return hit / total;
}

describe('Wahrscheinlichkeiten', () => {
  it('binom und hypergeometrische Grundformel', () => {
    expect(binom(40, 5)).toBe(658008);
    expect(hypergeoAtLeast(40, 3, 5)).toBeCloseTo(1 - binom(37, 5) / binom(40, 5), 12);
    expect(hypergeoAtLeast(40, 3, 5)).toBeCloseTo(0.3376, 4);
  });

  it('eine Kategorie entspricht der hypergeometrischen Verteilung', () => {
    const d = withCats(deckOf([['Test Starter', 3]]), { 'Test Starter': ['starter'] });
    const a = analyze(d, 5);
    expect(a.exact).toBe(true);
    expect(a.conditions[d.conditions[0].id]).toBeCloseTo(hypergeoAtLeast(40, 3, 5), 12);
    const dist = a.distribution.starter;
    expect(dist.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 12);
    expect(dist[0]).toBeCloseTo(binom(37, 5) / binom(40, 5), 12);
  });

  it('ODER/UND-Bedingungen und Einzelkarten stimmen mit Brute Force überein', () => {
    let d = deckOf(
      [['Test Starter', 2], ['Test Extender', 2], ["Magician's Rod", 1], ['Ash Blossom & Joyous Spring', 2]],
      12,
    );
    d = withCats(d, {
      'Test Starter': ['starter'],
      'Test Extender': ['extender'],
      "Magician's Rod": ['starter', 'extender'],
      'Ash Blossom & Joyous Spring': ['handtrap'],
    });
    const rod = String(id("Magician's Rod"));
    d.conditions = [
      {
        id: 'c1',
        name: 'Combo',
        variants: [
          [{ kind: 'category', ref: 'starter', min: 1 }, { kind: 'category', ref: 'extender', min: 1 }],
          [{ kind: 'card', ref: rod, min: 1 }, { kind: 'category', ref: 'handtrap', min: 1, max: 1 }],
        ],
      },
    ];
    const cats = (x: number) => d.cardCategories[String(x)] ?? [];
    const count = (h: number[], c: string) => h.filter((x) => cats(x).includes(c)).length;
    for (const n of [3, 5]) {
      const expected = brute(d.main, n, (h) =>
        (count(h, 'starter') >= 1 && count(h, 'extender') >= 1) ||
        (h.includes(Number(rod)) && count(h, 'handtrap') === 1),
      );
      expect(analyze(d, n).conditions.c1).toBeCloseTo(expected, 12);
    }
  });

  it('Ratio-Vergleich ändert nur die Kopienzahl', () => {
    const d = deckOf([['Test Starter', 3]]);
    const two = withCopies(d, id('Test Starter'), 2);
    expect(two.main.length).toBe(39);
    expect(two.main.filter((x) => x === id('Test Starter')).length).toBe(2);
  });
});
