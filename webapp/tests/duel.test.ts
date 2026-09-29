import { describe, expect, it } from 'vitest';
import {
  chooseEvenly, createDuel, declareAction, endTurn, resolveTag, respond,
  type DuelCtx, type DuelState, type Inst,
} from '../src/lib/duel';
import type { PlayerAction } from '../src/lib/duel';
import { TOKEN_ID } from '../src/lib/carddb';
import { db, deckOf, id } from './helpers';

const playerDeck = deckOf([
  ["Magician's Rod", 3], ['Test Starter', 3], ['Test Extender', 3], ['Called by the Grave', 2], ['Dark Magician', 3],
]);
playerDeck.extra = [id('Decode Talker'), id('Number 39: Utopia')];

function setup(botHand: string[], playerHand: string[], difficulty: 'easy' | 'normal' | 'hard' = 'hard') {
  const botDeck = deckOf([], 40, 'Mystical Space Typhoon');
  const ctx: DuelCtx = { db, playerDeck, botDeck };
  let s = createDuel(ctx, { difficulty, seed: 1, forcedHand: playerHand.map(id) });
  s = structuredClone(s);
  s.pending = null;
  s.bot.hand = botHand.map((n, i) => ({ uid: `b${i}`, id: id(n) }));
  return { ctx, s };
}

const handUid = (s: DuelState, name: string) => s.player.hand.find((i) => i.id === id(name))!.uid;
const fieldUid = (s: DuelState, name: string) => s.player.field.find((i) => i.id === id(name))!.uid;

function act(s: DuelState, ctx: DuelCtx, a: PlayerAction): DuelState {
  const r = declareAction(s, ctx, a);
  if ('error' in r) throw new Error(r.error);
  return r;
}

describe('Duell-Bot', () => {
  it('Ash Blossom annulliert eine Suche', () => {
    const { ctx, s: s0 } = setup(['Ash Blossom & Joyous Spring'], ["Magician's Rod"]);
    let s = act(s0, ctx, { kind: 'normalSummon', uid: handUid(s0, "Magician's Rod"), tags: [] });
    expect(s.pending).toBeNull();
    s = act(s, ctx, { kind: 'activate', uid: fieldUid(s, "Magician's Rod"), tags: ['search'] });
    expect(s.pending?.type).toBe('chain');
    s = respond(s, ctx, {});
    expect(s.pending).toBeNull();
    expect(s.resolution).toBeNull();
    expect(s.bot.gy.map((i) => i.id)).toEqual([id('Ash Blossom & Joyous Spring')]);
    expect(s.used[0]).toMatchObject({ defId: 'ash', answered: false });
  });

  it('Called by the Grave beantwortet Ash, verbannt sie und sperrt den Namen', () => {
    const { ctx, s: s0 } = setup(['Ash Blossom & Joyous Spring', 'Ash Blossom & Joyous Spring'], ["Magician's Rod", 'Called by the Grave']);
    let s = act(s0, ctx, { kind: 'normalSummon', uid: handUid(s0, "Magician's Rod"), tags: [] });
    s = act(s, ctx, { kind: 'activate', uid: fieldUid(s, "Magician's Rod"), tags: ['search'] });
    s = respond(s, ctx, { negateWith: handUid(s, 'Called by the Grave') });
    expect(s.bot.banished.map((i) => i.id)).toEqual([id('Ash Blossom & Joyous Spring')]);
    expect(s.blocked).toContain(id('Ash Blossom & Joyous Spring'));
    expect(s.resolution?.tags).toEqual(['search']);
    // zweite Ash darf nicht mehr reagieren
    const pick = s.player.deck.find((i) => i.id === id('Dark Magician'))!.uid;
    s = resolveTag(s, ctx, 'search', pick);
    expect(s.player.hand.some((i) => i.uid === pick)).toBe(true);
  });

  it('Droll & Lock Bird sperrt weitere Suchen nach der ersten', () => {
    const { ctx, s: s0 } = setup(['Droll & Lock Bird'], ["Magician's Rod", 'Test Starter']);
    let s = act(s0, ctx, { kind: 'normalSummon', uid: handUid(s0, "Magician's Rod"), tags: [] });
    s = act(s, ctx, { kind: 'activate', uid: fieldUid(s, "Magician's Rod"), tags: ['search'] });
    const first = s.player.deck[0].uid;
    s = resolveTag(s, ctx, 'search', first);
    expect(s.pending?.type).toBe('chain');
    s = respond(s, ctx, {});
    expect(s.drollLock).toBe(true);
    const handBefore = s.player.hand.length;
    s = act(s, ctx, { kind: 'activate', uid: handUid(s, 'Test Starter'), tags: ['search'] });
    s = resolveTag(s, ctx, 'search', s.player.deck[0].uid);
    expect(s.player.hand.length).toBe(handBefore);
  });

  it('Maxx "C" zieht bei jeder Spezialbeschwörung', () => {
    const { ctx, s: s0 } = setup(['Maxx "C"'], ['Test Starter']);
    let s = act(s0, ctx, { kind: 'normalSummon', uid: handUid(s0, 'Test Starter'), tags: [] });
    s = act(s, ctx, { kind: 'activate', uid: fieldUid(s, 'Test Starter'), tags: ['deckSS'] });
    expect(s.pending?.type).toBe('chain');
    s = respond(s, ctx, {});
    expect(s.maxx).toBe(1);
    const handAfterMaxx = s.bot.hand.length;
    s = resolveTag(s, ctx, 'deckSS', s.player.deck.find((i) => i.id === id('Test Extender'))!.uid);
    expect(s.bot.hand.length).toBe(handAfterMaxx + 1);
    expect(s.maxxDraws).toBe(1);
  });

  it('Effect Veiler annulliert ein Monster auf dem Feld', () => {
    const { ctx, s: s0 } = setup(['Effect Veiler'], ['Test Starter']);
    let s = act(s0, ctx, { kind: 'normalSummon', uid: handUid(s0, 'Test Starter'), tags: [] });
    s = act(s, ctx, { kind: 'activate', uid: fieldUid(s, 'Test Starter'), tags: ['deckSS'] });
    s = respond(s, ctx, {});
    expect(s.player.field.find((i) => i.id === id('Test Starter'))!.negated).toBe(true);
    expect(s.resolution).toBeNull();
  });

  it('Nibiru nach der 5. Beschwörung', () => {
    const { ctx, s: s0 } = setup(['Nibiru, the Primal Being'], ['Test Starter']);
    let s = act(s0, ctx, { kind: 'normalSummon', uid: handUid(s0, 'Test Starter'), tags: [] });
    const extenders = s.player.deck.filter((i) => i.id === id('Test Extender') || i.id === id('Dark Magician')).slice(0, 4);
    for (const e of extenders) {
      s = structuredClone(s);
      const i = s.player.deck.findIndex((x) => x.uid === e.uid);
      const [inst] = s.player.deck.splice(i, 1);
      s.player.hand.push(inst as Inst);
      s = act(s, ctx, { kind: 'specialSummon', uid: inst.uid, tags: [] });
    }
    expect(s.summons).toBe(5);
    expect(s.pending?.type).toBe('chain');
    s = respond(s, ctx, {});
    expect(s.player.field.map((i) => i.id)).toEqual([TOKEN_ID]);
    expect(s.bot.field.map((i) => i.id)).toEqual([id('Nibiru, the Primal Being')]);
  });

  it('Xyz-Beschwörung hängt Materialien an', () => {
    const { ctx, s: s0 } = setup([], ['Test Starter', 'Test Extender']);
    let s = act(s0, ctx, { kind: 'normalSummon', uid: handUid(s0, 'Test Starter'), tags: [] });
    s = act(s, ctx, { kind: 'specialSummon', uid: handUid(s, 'Test Extender'), tags: [] });
    const mats = s.player.field.map((i) => i.uid);
    const utopia = s.player.extra.find((i) => i.id === id('Number 39: Utopia'))!.uid;
    s = act(s, ctx, { kind: 'specialSummon', uid: utopia, tags: [], materials: mats });
    expect(s.player.field).toHaveLength(1);
    expect(s.player.field[0].materials).toHaveLength(2);
    expect(s.player.gy).toHaveLength(0);
  });

  it('Zug des Bots: Raigeki und Evenly Matched', () => {
    const { ctx, s: s0 } = setup(['Raigeki', 'Evenly Matched'], ['Test Starter', 'Called by the Grave', 'Mystical Space Typhoon']);
    let s = act(s0, ctx, { kind: 'normalSummon', uid: handUid(s0, 'Test Starter'), tags: [] });
    s = act(s, ctx, { kind: 'setSpellTrap', uid: handUid(s, 'Called by the Grave'), tags: [] });
    s = act(s, ctx, { kind: 'setSpellTrap', uid: handUid(s, 'Mystical Space Typhoon'), tags: [] });
    s = endTurn(s, ctx);
    expect(s.phase).toBe('botTurn');
    expect(s.pending?.type).toBe('breaker');
    s = respond(s, ctx, {}); // Raigeki
    expect(s.player.field).toHaveLength(2);
    s = respond(s, ctx, {}); // Evenly Matched
    expect(s.pending).toEqual({ type: 'evenly', keep: 1 });
    s = chooseEvenly(s, ctx, [s.player.field[0].uid]);
    expect(s.player.field).toHaveLength(1);
    expect(s.phase).toBe('over');
  });

  it('Normalbeschwörung nur einmal pro Zug', () => {
    const { ctx, s: s0 } = setup([], ['Test Starter', 'Test Extender']);
    const s = act(s0, ctx, { kind: 'normalSummon', uid: handUid(s0, 'Test Starter'), tags: [] });
    const r = declareAction(s, ctx, { kind: 'normalSummon', uid: handUid(s, 'Test Extender'), tags: [] });
    expect('error' in r).toBe(true);
  });
});
