import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GermanTexts } from '../src/lib/api';
import { CardDb } from '../src/lib/carddb';
import { interruptionFor, isNameLockCard } from '../src/lib/interruptions';
import { effectParts } from '../src/lib/tagging';
import { db as dbEn, id } from './helpers';

const raw = JSON.parse(readFileSync(new URL('../e2e/fixtures/cardinfo-de.json', import.meta.url), 'utf8'));
const german: GermanTexts = new Map(raw.data.map((c: { id: number; name: string; desc: string }) => [c.id, { name: c.name, desc: c.desc }]));
const db = new CardDb(dbEn.cards, german);

describe('Deutsche Kartentexte', () => {
  it('zeigt deutsche Namen und behält das englische Original', () => {
    const dm = db.get(id('Dark Magician'))!;
    expect(dm.name).toBe('Dunkler Magier');
    expect(dm.nameEn).toBe('Dark Magician');
    expect(dm.hasDe).toBe(true);
    expect(db.get(id('Raigeki'))!.name).toBe('Raigeki');
    expect(db.germanCount).toBe(4);
  });

  it('Suche und exakte Namen funktionieren in beiden Sprachen', () => {
    expect(db.search({ text: 'dunkler' }).map((c) => c.nameEn)).toEqual(['Dark Magician']);
    expect(db.search({ text: 'dark magician' }).map((c) => c.nameEn)).toContain('Dark Magician');
    expect(db.byExactName('Dark Magician')?.id).toBe(46986414);
    expect(db.byExactName('Dunkler Magier')?.id).toBe(46986414);
  });

  it('Handtrap-Erkennung nutzt den englischen Namen', () => {
    const ash = db.get(id('Ash Blossom & Joyous Spring'))!;
    expect(ash.name).toBe('Aschblüte & Freudiger Frühling');
    expect(interruptionFor(ash)?.id).toBe('ash');
    expect(isNameLockCard(db.get(id('Called by the Grave')))).toBe(true);
  });

  it('Effektauswahl: deutscher Text mit Eigenschaften aus dem Original', () => {
    const rod = effectParts(db.get(id("Magician's Rod"))!);
    expect(rod).toHaveLength(1);
    expect(rod[0].text).toMatch(/deiner Hand hinzufügen/);
    expect(rod[0].tags).toEqual(['search']);
    expect(rod[0].english).toBe(false);
    // „nur einmal pro Spielzug“ wird wie im Englischen an den Effekt angehängt
    expect(effectParts(db.get(id('Ash Blossom & Joyous Spring'))!)).toHaveLength(1);
  });

  it('fällt auf Englisch zurück, wenn die Übersetzung anders gegliedert ist', () => {
    const ext = effectParts(db.get(id('Test Extender'))!);
    expect(ext[0].english).toBe(true);
    expect(ext[0].tags).toEqual(['gySS']);
  });
});
