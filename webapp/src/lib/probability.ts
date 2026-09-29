import type { Condition, Deck, Requirement } from './types';
import { makeRng, shuffle } from './util';

export function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** P(mindestens `min` Treffer), wenn `hits` von `deckSize` Karten Treffer sind und `drawn` gezogen werden. */
export function hypergeoAtLeast(deckSize: number, hits: number, drawn: number, min = 1): number {
  let p = 0;
  const total = binom(deckSize, drawn);
  for (let k = min; k <= Math.min(hits, drawn); k++) p += (binom(hits, k) * binom(deckSize - hits, drawn - k)) / total;
  return p;
}

interface Atom {
  count: number;
  cats: string[];
  card?: string;
}

/**
 * Karten mit identischer Kategorie-Zugehörigkeit werden zu "Atomen" zusammengefasst
 * (Karten, die in einer Bedingung einzeln vorkommen, bekommen ein eigenes Atom).
 * Über die Atome wird die multivariate hypergeometrische Verteilung exakt aufgezählt.
 */
function buildAtoms(deck: Deck, conditions: Condition[]): Atom[] {
  const referenced = new Set<string>();
  for (const c of conditions) for (const v of c.variants) for (const r of v) if (r.kind === 'card') referenced.add(r.ref);
  const atoms = new Map<string, Atom>();
  for (const id of deck.main) {
    const key = String(id);
    const cats = [...(deck.cardCategories[key] ?? [])].sort();
    const card = referenced.has(key) ? key : undefined;
    const sig = `${cats.join(',')}|${card ?? ''}`;
    const a = atoms.get(sig);
    if (a) a.count++;
    else atoms.set(sig, { count: 1, cats, card });
  }
  return [...atoms.values()];
}

type Counts = { cat: Record<string, number>; card: Record<string, number> };

function reqCount(r: Requirement, c: Counts) {
  return (r.kind === 'category' ? c.cat[r.ref] : c.card[r.ref]) ?? 0;
}

export function conditionMet(cond: Condition, c: Counts): boolean {
  return cond.variants.some(
    (v) => v.length > 0 && v.every((r) => { const n = reqCount(r, c); return n >= r.min && (r.max == null || n <= r.max); }),
  );
}

export interface Analysis {
  handSize: number;
  deckSize: number;
  /** Bedingungs-ID → Wahrscheinlichkeit */
  conditions: Record<string, number>;
  /** mindestens eine Bedingung erfüllt */
  anyCondition: number;
  /** Kategorie-ID → Verteilung P(genau k), k = 0..handSize */
  distribution: Record<string, number[]>;
  exact: boolean;
}

function countsFor(atoms: Atom[], ks: number[]): Counts {
  const c: Counts = { cat: {}, card: {} };
  atoms.forEach((a, i) => {
    const k = ks[i];
    if (!k) return;
    for (const cat of a.cats) c.cat[cat] = (c.cat[cat] ?? 0) + k;
    if (a.card) c.card[a.card] = (c.card[a.card] ?? 0) + k;
  });
  return c;
}

function compositions(atoms: Atom[], n: number): number {
  // Anzahl der Aufzählungsschritte grob abschätzen, um bei riesigen Fällen auf Monte Carlo auszuweichen
  return binom(n + atoms.length - 1, Math.max(0, atoms.length - 1));
}

export function analyze(deck: Deck, handSize: number, conditions = deck.conditions, samples = 200_000): Analysis {
  const deckSize = deck.main.length;
  const n = Math.min(handSize, deckSize);
  const result: Analysis = { handSize: n, deckSize, conditions: {}, anyCondition: 0, distribution: {}, exact: true };
  for (const c of conditions) result.conditions[c.id] = 0;
  for (const cat of deck.categories) result.distribution[cat.id] = new Array(n + 1).fill(0);
  if (deckSize === 0) return result;

  const atoms = buildAtoms(deck, conditions);
  const record = (ks: number[], p: number) => {
    const counts = countsFor(atoms, ks);
    let any = false;
    for (const c of conditions) if (conditionMet(c, counts)) { result.conditions[c.id] += p; any = true; }
    if (any) result.anyCondition += p;
    for (const cat of deck.categories) result.distribution[cat.id][Math.min(n, counts.cat[cat.id] ?? 0)] += p;
  };

  if (compositions(atoms, n) <= 3_000_000) {
    const total = binom(deckSize, n);
    const ks = new Array(atoms.length).fill(0);
    const rec = (i: number, left: number, ways: number) => {
      if (i === atoms.length - 1) {
        if (left > atoms[i].count) return;
        ks[i] = left;
        record(ks, (ways * binom(atoms[i].count, left)) / total);
        return;
      }
      for (let k = 0; k <= Math.min(left, atoms[i].count); k++) {
        ks[i] = k;
        rec(i + 1, left - k, ways * binom(atoms[i].count, k));
      }
      ks[i] = 0;
    };
    rec(0, n, 1);
  } else {
    result.exact = false;
    const rng = makeRng(12345);
    const pool: number[] = [];
    atoms.forEach((a, i) => { for (let j = 0; j < a.count; j++) pool.push(i); });
    for (let s = 0; s < samples; s++) {
      const ks = new Array(atoms.length).fill(0);
      // partielle Fisher-Yates-Ziehung
      for (let j = 0; j < n; j++) {
        const r = j + Math.floor(rng() * (pool.length - j));
        [pool[j], pool[r]] = [pool[r], pool[j]];
        ks[pool[j]]++;
      }
      record(ks, 1 / samples);
    }
  }
  return result;
}

/** Setzt die Kopienzahl einer Karte im Main Deck (für den Ratio-Vergleich). */
export function withCopies(deck: Deck, cardId: number, copies: number): Deck {
  const main = deck.main.filter((id) => id !== cardId);
  for (let i = 0; i < copies; i++) main.push(cardId);
  return { ...deck, main };
}

export function drawHand(deck: Deck, n: number, rng = Math.random): number[] {
  return shuffle(deck.main, rng).slice(0, n);
}

export function handCounts(deck: Deck, hand: number[]): Counts {
  const c: Counts = { cat: {}, card: {} };
  for (const id of hand) {
    const key = String(id);
    c.card[key] = (c.card[key] ?? 0) + 1;
    for (const cat of deck.cardCategories[key] ?? []) c.cat[cat] = (c.cat[cat] ?? 0) + 1;
  }
  return c;
}
