import { CardDb, isMonster, isSpell, isTrap, TOKEN_ID } from './carddb';
import { INTERRUPTION_BY_ID, interruptionFor, isNameLockCard, type InterruptionDef } from './interruptions';
import type { ActionKind, Card, Deck, EffectTag, Zone } from './types';
import { makeRng, shuffle, uid } from './util';

// Vereinfachte Duell-Engine für einen Zug: Der Spieler beginnt und spielt seine Combo,
// der Bot hält 5 Karten und reagiert mit Unterbrechungen. Danach folgt der Zug des Bots,
// in dem er Board-Breaker gegen das Endboard einsetzt. Kämpfe und LP werden nicht simuliert.

export type Difficulty = 'easy' | 'normal' | 'hard';
export type SideKey = 'player' | 'bot';

export interface Inst {
  uid: string;
  id: number;
  faceDown?: boolean;
  defense?: boolean;
  /** Effekte bis zum Ende des Zuges annulliert (Veiler, Imperm, DRNM …) */
  negated?: boolean;
  /** Xyz-Material */
  materials?: Inst[];
  /** Spieler hat mit dieser Karte bereits eine Unterbrechung beantwortet */
  usedNegate?: boolean;
}

export type Side = Record<Zone, Inst[]>;

export interface PlayerAction {
  kind: ActionKind;
  uid: string;
  tags: EffectTag[];
  effectText?: string;
  /** Materialien für Beschwörungen aus dem Extra Deck */
  materials?: string[];
  /** Im Combo Lab als Choke Point markiert */
  choke?: boolean;
}

export interface BotMove {
  defId: string;
  botUid: string;
  cardId: number;
  text: string;
}

export type Pending =
  | { type: 'chain'; action: PlayerAction | null; moves: BotMove[]; index: number; negated: boolean }
  | { type: 'breaker'; moves: BotMove[]; index: number }
  | { type: 'evenly'; keep: number };

export interface Resolution {
  action: PlayerAction;
  tags: EffectTag[];
}

export interface LogEntry {
  who: 'player' | 'bot' | 'system';
  text: string;
  tone?: 'interrupt' | 'warn' | 'good';
}

export interface UsedInterruption {
  defId: string;
  cardId: number;
  /** Karte des Spielers, auf die reagiert wurde */
  on?: number;
  answered: boolean;
}

export interface DuelState {
  difficulty: Difficulty;
  phase: 'player' | 'botTurn' | 'over';
  seed: number;
  player: Side;
  bot: Side;
  summons: number;
  normalSummonUsed: boolean;
  activations: number;
  maxx: number;
  maxxDraws: number;
  drollLock: boolean;
  shifter: boolean;
  /** Karten-IDs des Bots, deren Einmal-pro-Zug-Effekt verbraucht ist */
  usedOpt: number[];
  /** Karten-IDs des Bots, die durch Called by the Grave / Crossout gesperrt sind */
  blocked: number[];
  /** Wie oft der Bot eine Gelegenheit bewusst ausgelassen hat (pro Unterbrechung) */
  seen: Record<string, number>;
  pending: Pending | null;
  resolution: Resolution | null;
  log: LogEntry[];
  used: UsedInterruption[];
  /** Karten-IDs auf dem Feld des Spielers am Ende seines Zuges */
  endBoard?: number[];
}

export interface DuelCtx {
  db: CardDb;
  playerDeck: Deck;
  botDeck: Deck;
}

const emptySide = (): Side => ({ deck: [], hand: [], field: [], gy: [], banished: [], extra: [] });
const inst = (id: number): Inst => ({ uid: uid(), id });

function rand(s: DuelState): number {
  const r = makeRng(s.seed);
  const v = r();
  s.seed = Math.floor(r() * 2 ** 32);
  return v;
}

const name = (ctx: DuelCtx, id: number) => ctx.db.get(id)?.name ?? `#${id}`;
const log = (s: DuelState, who: LogEntry['who'], text: string, tone?: LogEntry['tone']) => {
  s.log.push({ who, text, tone });
};

export const ZONE_NAMES: Record<Zone, string> = {
  deck: 'Deck', hand: 'Hand', field: 'Spielfeld', gy: 'Friedhof', banished: 'Verbannt', extra: 'Extra Deck',
};

export function locate(side: Side, u: string): { zone: Zone; index: number } | null {
  for (const zone of Object.keys(side) as Zone[]) {
    const index = side[zone].findIndex((i) => i.uid === u);
    if (index >= 0) return { zone, index };
  }
  return null;
}

/** Bewegt eine Karte; beachtet Dimension Shifter und setzt Feld-Zustände zurück. */
export function moveCard(s: DuelState, sideKey: SideKey, u: string, to: Zone, opts: { faceDown?: boolean; defense?: boolean } = {}) {
  const side = s[sideKey];
  const loc = locate(side, u);
  if (!loc) return;
  const [card] = side[loc.zone].splice(loc.index, 1);
  if (card.id === TOKEN_ID && to !== 'field') return; // Spielmarken verschwinden
  let dest = to;
  if (dest === 'gy' && s.shifter) dest = 'banished';
  if (loc.zone === 'field' && dest !== 'field') {
    if (card.materials?.length) {
      for (const m of card.materials) side[s.shifter ? 'banished' : 'gy'].push(m);
    }
    card.materials = undefined;
    card.negated = undefined;
    card.usedNegate = undefined;
    card.defense = undefined;
  }
  card.faceDown = dest === 'field' || dest === 'banished' ? !!opts.faceDown || undefined : undefined;
  if (dest === 'field') card.defense = opts.defense ?? card.defense;
  side[dest].push(card);
}

export function createDuel(ctx: DuelCtx, opts: { difficulty: Difficulty; seed?: number; forcedHand?: number[] }): DuelState {
  const s: DuelState = {
    difficulty: opts.difficulty,
    phase: 'player',
    seed: opts.seed ?? Math.floor(Math.random() * 2 ** 32),
    player: emptySide(),
    bot: emptySide(),
    summons: 0,
    normalSummonUsed: false,
    activations: 0,
    maxx: 0,
    maxxDraws: 0,
    drollLock: false,
    shifter: false,
    usedOpt: [],
    blocked: [],
    seen: {},
    pending: null,
    resolution: null,
    log: [],
    used: [],
  };
  const rng = makeRng(s.seed);
  s.seed = Math.floor(rng() * 2 ** 32);

  let pDeck = [...ctx.playerDeck.main];
  const forced: number[] = [];
  for (const id of opts.forcedHand ?? []) {
    const i = pDeck.indexOf(id);
    if (i >= 0) { pDeck.splice(i, 1); forced.push(id); }
  }
  pDeck = shuffle(pDeck, rng);
  s.player.deck = pDeck.map(inst);
  s.player.hand = forced.map(inst);
  while (s.player.hand.length < 5 && s.player.deck.length) s.player.hand.push(s.player.deck.shift()!);
  s.player.extra = ctx.playerDeck.extra.map(inst);

  s.bot.deck = shuffle(ctx.botDeck.main, rng).map(inst);
  s.bot.hand = s.bot.deck.splice(0, 5);
  s.bot.extra = ctx.botDeck.extra.map(inst);

  log(s, 'system', `Du beginnst. Starthand: ${s.player.hand.map((i) => name(ctx, i.id)).join(', ')}.`);
  log(s, 'system', `Der Bot hält 5 Karten (${countInterruptions(s, ctx)} davon können in deinem Zug interagieren).`);

  // Dimension Shifter wird zu Beginn des Zuges aktiviert (Friedhof des Bots ist leer)
  const shifter = available(s, ctx).find((a) => a.def.id === 'shifter');
  if (shifter && decide(s, 'shifter', 3)) {
    s.pending = { type: 'chain', action: null, moves: [move(ctx, shifter, 'aktiviert zu Beginn deines Zuges Dimension Shifter.')], index: 0, negated: false };
  }
  return s;
}

function countInterruptions(s: DuelState, ctx: DuelCtx) {
  return s.bot.hand.filter((i) => {
    const d = interruptionFor(ctx.db.get(i.id), ctx.botDeck);
    return d && d.timing !== 'botTurn';
  }).length;
}

interface Avail { inst: Inst; def: InterruptionDef; card: Card }

/** Handkarten des Bots, die gerade als Unterbrechung verfügbar sind. */
function available(s: DuelState, ctx: DuelCtx): Avail[] {
  const out: Avail[] = [];
  for (const i of s.bot.hand) {
    const card = ctx.db.get(i.id);
    const def = interruptionFor(card, ctx.botDeck);
    if (!card || !def) continue;
    if (s.blocked.includes(i.id)) continue;
    if (def.opt && s.usedOpt.includes(i.id)) continue;
    out.push({ inst: i, def, card });
  }
  return out;
}

function move(ctx: DuelCtx, a: Avail, text: string): BotMove {
  return { defId: a.def.id, botUid: a.inst.uid, cardId: a.inst.id, text: `${name(ctx, a.inst.id)}: ${text}` };
}

function categoryNames(ctx: DuelCtx, cardId: number): string[] {
  const ids = ctx.playerDeck.cardCategories[String(cardId)] ?? [];
  return ids.map((id) => (ctx.playerDeck.categories.find((c) => c.id === id)?.name ?? id).toLowerCase());
}

/** Wie wertvoll es für den Bot ist, gerade diese Aktion zu unterbrechen. */
export function actionScore(s: DuelState, ctx: DuelCtx, action: PlayerAction, cardId: number): number {
  let score = 0;
  const cats = categoryNames(ctx, cardId);
  if (cats.some((c) => c.includes('starter'))) score += 3;
  if (cats.some((c) => c.includes('extender'))) score += 2;
  if (action.tags.includes('search') || action.tags.includes('deckSS')) score += 2;
  else if (action.tags.length) score += 1;
  if (s.activations === 0) score += 1;
  if (action.choke) score += 3;
  return score;
}

function decide(s: DuelState, defId: string, score: number): boolean {
  const seen = s.seen[defId] ?? 0;
  const hand = s.player.hand.length;
  let use: boolean;
  switch (s.difficulty) {
    case 'easy': use = rand(s) < 0.6; break;
    case 'normal': use = score >= 3 || seen >= 1 || rand(s) < 0.3; break;
    case 'hard': use = score >= 3 || seen >= 2 || hand <= 1; break;
  }
  if (!use) s.seen[defId] = seen + 1;
  return use;
}

const NEGATE_ORDER = ['ash', 'belle', 'gamma', 'ogre', 'crow', 'veiler', 'imperm'];

function eligible(s: DuelState, ctx: DuelCtx, defId: string, action: PlayerAction, card: Card, zone: Zone, i: Inst): boolean {
  if (action.kind !== 'activate') return false;
  const onField = zone === 'field' && !i.faceDown;
  switch (defId) {
    case 'ash': return action.tags.some((t) => t === 'search' || t === 'deckSS' || t === 'deckSend');
    case 'belle': return action.tags.some((t) => t === 'gyAdd' || t === 'gySS' || t === 'gyBanish');
    case 'veiler': return onField && isMonster(card) && !i.negated;
    case 'imperm': return onField && isMonster(card) && !i.negated && s.bot.field.length === 0;
    case 'ogre': return onField;
    case 'gamma': return isMonster(card) && !s.bot.field.some((b) => { const c = ctx.db.get(b.id); return c && isMonster(c) && !b.faceDown; });
    case 'crow': return zone === 'gy';
    default: return false;
  }
}

function chainResponses(s: DuelState, ctx: DuelCtx, action: PlayerAction, card: Card, zone: Zone, i: Inst): BotMove[] {
  const moves: BotMove[] = [];
  const avail = available(s, ctx);

  const maxx = avail.find((a) => a.def.id === 'maxx');
  if (maxx && s.maxx === 0 && (action.kind === 'activate' || action.kind === 'specialSummon')) {
    const use = s.difficulty === 'easy' ? rand(s) < 0.5 : true;
    if (use) moves.push(move(ctx, maxx, 'aktiviert. Der Bot zieht bei jeder deiner Spezialbeschwörungen 1 Karte.'));
  }

  const score = actionScore(s, ctx, action, card.id);
  for (const defId of NEGATE_ORDER) {
    const a = avail.find((x) => x.def.id === defId);
    if (!a || !eligible(s, ctx, defId, action, card, zone, i)) continue;
    if (!decide(s, defId, score)) continue;
    moves.push(move(ctx, a, describe(defId, card)));
    break;
  }
  return moves;
}

function describe(defId: string, target: Card): string {
  switch (defId) {
    case 'ash':
    case 'belle': return `annulliert den Effekt von ${target.name}.`;
    case 'veiler':
    case 'imperm': return `annulliert die Effekte von ${target.name} bis zum Ende des Zuges.`;
    case 'ogre': return `zerstört ${target.name} (der Effekt löst trotzdem auf).`;
    case 'gamma': return `annulliert die Aktivierung von ${target.name} und zerstört die Karte.`;
    case 'crow': return `verbannt ${target.name} aus deinem Friedhof.`;
    default: return 'wird aktiviert.';
  }
}

export interface ActionError { error: string }

/** Der Spieler kündigt eine Aktion an; der Bot kann darauf reagieren. */
export function declareAction(prev: DuelState, ctx: DuelCtx, action: PlayerAction): DuelState | ActionError {
  if (prev.phase !== 'player') return { error: 'Dein Zug ist bereits beendet.' };
  if (prev.pending) return { error: 'Beantworte zuerst die Aktion des Bots.' };
  const s = structuredClone(prev);
  const loc = locate(s.player, action.uid);
  if (!loc) return { error: 'Karte nicht gefunden.' };
  const i = s.player[loc.zone][loc.index];
  const card = ctx.db.get(i.id);
  if (!card) return { error: 'Unbekannte Karte.' };
  if ((action.kind === 'normalSummon' || action.kind === 'setMonster') && s.normalSummonUsed) {
    return { error: 'Du hast in diesem Zug bereits normal beschworen oder gesetzt.' };
  }
  s.resolution = null;

  const verb: Record<ActionKind, string> = {
    normalSummon: 'beschwört als Normalbeschwörung',
    setMonster: 'setzt ein Monster',
    specialSummon: 'beschwört als Spezialbeschwörung',
    activate: 'aktiviert',
    setSpellTrap: 'setzt eine Zauber-/Fallenkarte',
  };
  const shown = action.kind === 'setMonster' || action.kind === 'setSpellTrap' ? '' : ` ${card.name}`;
  log(s, 'player', `${verb[action.kind]}${shown}${action.kind === 'activate' && loc.zone !== 'field' ? ` (${ZONE_NAMES[loc.zone]})` : ''}.`);
  if (action.kind === 'activate' && i.negated) log(s, 'system', `${card.name} ist annulliert – der Effekt hat keine Wirkung.`, 'warn');

  const moves = action.kind === 'activate' || action.kind === 'specialSummon' ? chainResponses(s, ctx, action, card, loc.zone, i) : [];
  if (moves.length) {
    s.pending = { type: 'chain', action, moves, index: 0, negated: !!i.negated };
    return s;
  }
  finishAction(s, ctx, action, !!i.negated);
  return s;
}

/** Called by the Grave / Crossout Designator vorab gespielt. */
function proactiveLock(s: DuelState, ctx: DuelCtx, card: Card) {
  if (card.nameEn === 'Called by the Grave') {
    const target = s.bot.gy.find((i) => { const c = ctx.db.get(i.id); return c && isMonster(c); });
    if (!target) { log(s, 'system', 'Called by the Grave: kein Monster im Friedhof des Bots.', 'warn'); return; }
    moveCard(s, 'bot', target.uid, 'banished');
    s.blocked.push(target.id);
    log(s, 'system', `Called by the Grave: ${name(ctx, target.id)} verbannt und für diesen Zug gesperrt.`, 'good');
    return;
  }
  // Crossout Designator: der Bot-Deckname mit den meisten Unterbrechungs-Kopien wird gesperrt
  const counts = new Map<number, number>();
  for (const id of ctx.botDeck.main) {
    const d = interruptionFor(ctx.db.get(id), ctx.botDeck);
    if (d && d.timing !== 'botTurn') counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && !s.blocked.includes(best[0])) {
    s.blocked.push(best[0]);
    log(s, 'system', `${card.name}: ${name(ctx, best[0])} ist für diesen Zug gesperrt.`, 'good');
  }
}

export interface Response {
  /** Karte des Spielers, mit der die Unterbrechung beantwortet wird */
  negateWith?: string;
}

/** Der Spieler antwortet auf die aktuelle Aktion des Bots (zulassen oder negieren). */
export function respond(prev: DuelState, ctx: DuelCtx, r: Response): DuelState {
  const s = structuredClone(prev);
  const p = s.pending;
  if (!p || p.type === 'evenly') return prev;
  const m = p.moves[p.index];
  const def = INTERRUPTION_BY_ID.get(m.defId)!;
  const answered = !!r.negateWith && answer(s, ctx, r.negateWith, m);
  const botLoc = locate(s.bot, m.botUid);
  const targetUid = p.type === 'chain' ? p.action?.uid : undefined;
  const targetId = targetUid ? findAny(s, targetUid)?.id : undefined;
  s.used.push({ defId: m.defId, cardId: m.cardId, on: targetId, answered });
  if (def.opt) s.usedOpt.push(m.cardId);

  // Die Karte des Bots verlässt die Hand (Kosten/Aktivierung), außer sie wurde bereits verbannt
  if (botLoc && botLoc.zone === 'hand') {
    const toField = !answered && (m.defId === 'nibiru' || m.defId === 'gamma');
    moveCard(s, 'bot', m.botUid, toField ? 'field' : 'gy');
  }

  if (!answered) {
    if (p.type === 'chain') applyChain(s, ctx, m, p);
    else applyBreaker(s, ctx, m);
  }

  p.index++;
  if (s.pending?.type === 'evenly') return s; // Auswahl für Evenly Matched
  if (p.index < p.moves.length) {
    if (p.type === 'breaker') return advanceBreakers(s, ctx);
    return s;
  }
  s.pending = null;
  if (p.type === 'chain' && p.action) finishAction(s, ctx, p.action, p.negated);
  else if (p.type === 'breaker') finishBotTurn(s, ctx);
  return s;
}

function findAny(s: DuelState, u: string): Inst | undefined {
  for (const side of [s.player, s.bot]) {
    const loc = locate(side, u);
    if (loc) return side[loc.zone][loc.index];
  }
  return undefined;
}

function answer(s: DuelState, ctx: DuelCtx, u: string, m: BotMove): boolean {
  const loc = locate(s.player, u);
  if (!loc) return false;
  const i = s.player[loc.zone][loc.index];
  const card = ctx.db.get(i.id);
  log(s, 'player', `beantwortet ${name(ctx, m.cardId)} mit ${card?.name ?? 'einer Karte'}.`, 'good');
  if (isNameLockCard(card)) {
    s.blocked.push(m.cardId);
    log(s, 'system', `${name(ctx, m.cardId)} ist für den Rest des Zuges gesperrt.`, 'good');
    if (card?.nameEn === 'Called by the Grave') {
      // Called verbannt die Handtrap aus dem Friedhof des Bots
      const b = locate(s.bot, m.botUid);
      if (b) moveCard(s, 'bot', m.botUid, 'banished');
    }
  }
  if (loc.zone === 'field') {
    i.usedNegate = true;
    if (card && (isSpell(card) || isTrap(card)) && i.faceDown) {
      i.faceDown = false;
      if (!['Continuous', 'Field', 'Equip'].includes(card.race)) moveCard(s, 'player', u, 'gy');
    }
  } else if (loc.zone === 'hand') {
    moveCard(s, 'player', u, 'gy');
  }
  return true;
}

function applyChain(s: DuelState, ctx: DuelCtx, m: BotMove, p: Extract<Pending, { type: 'chain' }>) {
  log(s, 'bot', m.text, 'interrupt');
  const a = p.action;
  const target = a ? locate(s.player, a.uid) : null;
  const ti = target ? s.player[target.zone][target.index] : undefined;
  switch (m.defId) {
    case 'ash':
    case 'belle':
      p.negated = true;
      break;
    case 'veiler':
    case 'imperm':
      p.negated = true;
      if (ti && target?.zone === 'field') ti.negated = true;
      break;
    case 'gamma':
      p.negated = true;
      if (ti && target?.zone === 'field') moveCard(s, 'player', ti.uid, 'gy');
      else if (ti && target?.zone === 'hand') moveCard(s, 'player', ti.uid, 'gy');
      break;
    case 'ogre':
      if (ti && target?.zone === 'field') moveCard(s, 'player', ti.uid, 'gy');
      break;
    case 'crow':
      if (ti && target?.zone === 'gy') {
        moveCard(s, 'player', ti.uid, 'banished');
        log(s, 'system', 'Die Karte wurde verbannt. Braucht der Effekt die Karte selbst (z. B. „beschwöre diese Karte“), löst er nicht auf.', 'warn');
      }
      break;
    case 'maxx':
      s.maxx++;
      break;
    case 'droll':
      s.drollLock = true;
      break;
    case 'shifter':
      s.shifter = true;
      break;
    case 'nibiru': {
      const faceUpMonster = (i: Inst) => { const c = ctx.db.get(i.id); return !i.faceDown && !!c && isMonster(c); };
      const tributes = s.player.field.filter(faceUpMonster);
      for (const t of tributes) moveCard(s, 'player', t.uid, 'gy');
      for (const t of s.bot.field.filter((i) => faceUpMonster(i) && i.uid !== m.botUid)) moveCard(s, 'bot', t.uid, 'gy');
      s.player.field.push({ uid: uid(), id: TOKEN_ID });
      log(s, 'system', `${tributes.length} Monster wurden als Tribut angeboten. Du erhältst einen Primal Being Token (3000/600).`, 'warn');
      break;
    }
  }
}

function finishAction(s: DuelState, ctx: DuelCtx, a: PlayerAction, negated: boolean) {
  const loc = locate(s.player, a.uid);
  if (!loc) {
    // Karte wurde durch die Unterbrechung entfernt (z. B. Ghost Ogre, PSY-Gamma)
    if (a.kind === 'activate' && !negated && a.tags.length) s.resolution = { action: a, tags: [...a.tags] };
    if (a.kind === 'activate') s.activations++;
    return;
  }
  const i = s.player[loc.zone][loc.index];
  const card = ctx.db.get(i.id)!;
  switch (a.kind) {
    case 'normalSummon':
      moveCard(s, 'player', a.uid, 'field');
      s.normalSummonUsed = true;
      onSummon(s, ctx, 1);
      break;
    case 'setMonster':
      moveCard(s, 'player', a.uid, 'field', { faceDown: true, defense: true });
      s.normalSummonUsed = true;
      break;
    case 'setSpellTrap':
      moveCard(s, 'player', a.uid, 'field', { faceDown: true });
      break;
    case 'specialSummon': {
      const materials: Inst[] = [];
      for (const m of a.materials ?? []) {
        const ml = locate(s.player, m);
        if (!ml) continue;
        if (card.frameType.startsWith('xyz')) {
          const [mi] = s.player[ml.zone].splice(ml.index, 1);
          mi.negated = undefined;
          materials.push(mi);
        } else {
          moveCard(s, 'player', m, 'gy');
        }
      }
      moveCard(s, 'player', a.uid, 'field');
      const placed = s.player.field.find((x) => x.uid === a.uid);
      if (placed && materials.length) placed.materials = materials;
      onSummon(s, ctx, 1);
      break;
    }
    case 'activate': {
      s.activations++;
      if (isSpell(card) || isTrap(card)) {
        if (loc.zone === 'hand' || i.faceDown) moveCard(s, 'player', a.uid, 'field');
        const stays = ['Continuous', 'Field', 'Equip'].includes(card.race);
        if (!stays || negated) moveCard(s, 'player', a.uid, 'gy');
      }
      if (negated) log(s, 'system', `Der Effekt von ${card.name} wurde annulliert.`, 'warn');
      else if (isNameLockCard(card)) proactiveLock(s, ctx, card);
      if (!negated && a.tags.length) s.resolution = { action: a, tags: [...a.tags] };
      break;
    }
  }
}

function onSummon(s: DuelState, ctx: DuelCtx, count: number) {
  s.summons += count;
  if (s.maxx > 0) {
    for (let k = 0; k < s.maxx; k++) {
      const c = s.bot.deck.shift();
      if (c) { s.bot.hand.push(c); s.maxxDraws++; }
    }
    log(s, 'bot', `zieht ${s.maxx} Karte(n) durch Maxx "C" (insgesamt ${s.maxxDraws}).`, 'interrupt');
  }
  if (s.summons >= 5 && !s.pending) {
    const nib = available(s, ctx).find((a) => a.def.id === 'nibiru');
    if (nib && (s.difficulty !== 'easy' || rand(s) < 0.6)) {
      s.pending = {
        type: 'chain', action: null, index: 0, negated: false,
        moves: [move(ctx, nib, `aktiviert nach deiner ${s.summons}. Beschwörung.`)],
      };
    }
  }
}

/** Ergebnis eines Effekts ausführen (z. B. gesuchte Karte wählen). `pick` = null überspringt. */
export function resolveTag(prev: DuelState, ctx: DuelCtx, tag: EffectTag, pick: string | null): DuelState {
  const s = structuredClone(prev);
  const res = s.resolution;
  if (!res) return prev;
  res.tags = res.tags.filter((t) => t !== tag);
  if (!res.tags.length) s.resolution = null;
  if (!pick) return s;
  const n = (u: string) => name(ctx, findAny(s, u)?.id ?? 0);
  switch (tag) {
    case 'search':
      if (s.drollLock) {
        log(s, 'system', 'Droll & Lock Bird: Es kann keine Karte aus dem Deck zur Hand genommen werden.', 'warn');
        break;
      }
      log(s, 'player', `nimmt ${n(pick)} aus dem Deck auf die Hand.`);
      moveCard(s, 'player', pick, 'hand');
      afterSearch(s, ctx);
      break;
    case 'deckSS':
      log(s, 'player', `beschwört ${n(pick)} aus dem Deck als Spezialbeschwörung.`);
      moveCard(s, 'player', pick, 'field');
      onSummon(s, ctx, 1);
      break;
    case 'deckSend':
      log(s, 'player', `legt ${n(pick)} aus dem Deck auf den Friedhof.`);
      moveCard(s, 'player', pick, 'gy');
      break;
    case 'gyAdd':
      log(s, 'player', `nimmt ${n(pick)} aus dem Friedhof auf die Hand.`);
      moveCard(s, 'player', pick, 'hand');
      break;
    case 'gySS':
      log(s, 'player', `beschwört ${n(pick)} aus dem Friedhof als Spezialbeschwörung.`);
      moveCard(s, 'player', pick, 'field');
      onSummon(s, ctx, 1);
      break;
    case 'gyBanish': {
      const side: SideKey = locate(s.player, pick) ? 'player' : 'bot';
      log(s, 'player', `verbannt ${n(pick)} aus dem Friedhof.`);
      moveCard(s, side, pick, 'banished');
      break;
    }
  }
  return s;
}

function afterSearch(s: DuelState, ctx: DuelCtx) {
  if (s.pending || s.drollLock) return;
  const droll = available(s, ctx).find((a) => a.def.id === 'droll');
  if (droll && (s.difficulty !== 'easy' || rand(s) < 0.6)) {
    s.pending = {
      type: 'chain', action: null, index: 0, negated: false,
      moves: [move(ctx, droll, 'wird abgelegt: Für den Rest des Zuges kann niemand Karten aus dem Deck zur Hand nehmen.')],
    };
  }
}

/** Manuelle Bewegung ohne Aktivierung (z. B. Kosten, Tribute, Rückgängig). Der Bot reagiert nicht. */
export function manualMove(prev: DuelState, ctx: DuelCtx, u: string, to: Zone, opts: { faceDown?: boolean; defense?: boolean } = {}): DuelState {
  const s = structuredClone(prev);
  const loc = locate(s.player, u);
  if (!loc) return prev;
  const id = s.player[loc.zone][loc.index].id;
  moveCard(s, 'player', u, to, opts);
  log(s, 'player', `bewegt ${name(ctx, id)}: ${ZONE_NAMES[loc.zone]} → ${ZONE_NAMES[to]}.`);
  return s;
}

export function togglePosition(prev: DuelState, u: string): DuelState {
  const s = structuredClone(prev);
  const i = s.player.field.find((x) => x.uid === u);
  if (i) i.defense = !i.defense;
  return s;
}

export function drawCard(prev: DuelState, ctx: DuelCtx): DuelState {
  const s = structuredClone(prev);
  const c = s.player.deck.shift();
  if (c) {
    s.player.hand.push(c);
    log(s, 'player', `zieht ${name(ctx, c.id)}.`);
  }
  return s;
}

const BREAKER_ORDER = ['harpie', 'storm', 'raigeki', 'drnm', 'droplet', 'evenly'];

/** Beendet deinen Zug: der Bot zieht und setzt Board-Breaker gegen dein Endboard ein. */
export function endTurn(prev: DuelState, ctx: DuelCtx): DuelState {
  if (prev.pending || prev.phase !== 'player') return prev;
  const s = structuredClone(prev);
  s.resolution = null;
  s.endBoard = s.player.field.map((i) => i.id);
  s.phase = 'botTurn';
  // Effekte „bis zum Ende des Zuges“ enden
  for (const i of s.player.field) i.negated = undefined;
  s.drollLock = false;
  s.blocked = [];
  s.usedOpt = [];
  log(s, 'system', `Zugende. Dein Endboard: ${s.endBoard.length ? s.endBoard.map((id) => name(ctx, id)).join(', ') : 'leer'}.`);
  const drawn = s.bot.deck.shift();
  if (drawn) s.bot.hand.push(drawn);
  log(s, 'bot', `zieht für seinen Zug (Hand: ${s.bot.hand.length} Karten).`);

  const moves: BotMove[] = [];
  for (const defId of BREAKER_ORDER) {
    const a = available(s, ctx).find((x) => x.def.id === defId && !moves.some((m) => m.botUid === x.inst.uid));
    if (a) moves.push(move(ctx, a, a.def.howBotUsesIt.replace('Im Zug des Bots: ', '').replace(/^Im Zug des Bots \([^)]*\): /, '')));
  }
  if (!moves.length) {
    log(s, 'bot', 'hat keine Board-Breaker auf der Hand.');
    finishBotTurn(s, ctx);
    return s;
  }
  s.pending = { type: 'breaker', moves, index: 0 };
  return advanceBreakers(s, ctx);
}

function playerFaceUp(s: DuelState) {
  return s.player.field.filter((i) => !i.faceDown);
}

function breakerApplies(s: DuelState, ctx: DuelCtx, defId: string): boolean {
  const monsters = s.player.field.filter((i) => { const c = ctx.db.get(i.id); return c && isMonster(c); });
  const backrow = s.player.field.filter((i) => { const c = ctx.db.get(i.id); return c && !isMonster(c); });
  switch (defId) {
    case 'harpie': return backrow.length > 0;
    case 'storm': return !s.bot.field.some((b) => !b.faceDown) && s.player.field.length > 0;
    case 'raigeki': return monsters.length > 0;
    case 'drnm': return monsters.some((i) => !i.faceDown && !i.negated);
    case 'droplet': return playerFaceUp(s).some((i) => !i.negated) && dropletCost(s) > 0;
    case 'evenly': return s.bot.field.length === 0 && s.player.field.length > 1;
    default: return false;
  }
}

/** Überspringt Board-Breaker, die gerade keine Wirkung hätten. */
function advanceBreakers(s: DuelState, ctx: DuelCtx): DuelState {
  const p = s.pending;
  if (!p || p.type !== 'breaker') return s;
  while (p.index < p.moves.length && !breakerApplies(s, ctx, p.moves[p.index].defId)) p.index++;
  if (p.index >= p.moves.length) {
    s.pending = null;
    finishBotTurn(s, ctx);
  }
  return s;
}

function dropletCost(s: DuelState): number {
  // Alles außer noch einzusetzenden Breakern kann als Kosten gelegt werden
  const keep = new Set<string>();
  if (s.pending?.type === 'breaker') for (const m of s.pending.moves.slice(s.pending.index)) keep.add(m.botUid);
  return s.bot.hand.filter((i) => !keep.has(i.uid)).length + s.bot.field.length;
}

function applyBreaker(s: DuelState, ctx: DuelCtx, m: BotMove) {
  log(s, 'bot', m.text, 'interrupt');
  const destroy = (list: Inst[]) => { for (const i of list) moveCard(s, 'player', i.uid, 'gy'); return list.length; };
  const isMon = (i: Inst) => { const c = ctx.db.get(i.id); return !!c && isMonster(c); };
  switch (m.defId) {
    case 'harpie':
      log(s, 'system', `${destroy(s.player.field.filter((i) => !isMon(i)))} Zauber/Fallen zerstört.`, 'warn');
      break;
    case 'storm': {
      const atk = s.player.field.filter((i) => isMon(i) && !i.faceDown && !i.defense);
      const st = s.player.field.filter((i) => !isMon(i));
      const pick = atk.length >= st.length ? atk : st;
      log(s, 'system', `${destroy(pick)} ${pick === atk ? 'Monster in Angriffsposition' : 'Zauber/Fallen'} zerstört.`, 'warn');
      break;
    }
    case 'raigeki':
      log(s, 'system', `${destroy(s.player.field.filter(isMon))} Monster zerstört.`, 'warn');
      break;
    case 'drnm': {
      const targets = s.player.field.filter((i) => isMon(i) && !i.faceDown);
      for (const i of targets) i.negated = true;
      log(s, 'system', `Effekte von ${targets.length} Monster(n) annulliert.`, 'warn');
      break;
    }
    case 'droplet': {
      const n = dropletCost(s);
      const keep = new Set<string>();
      if (s.pending?.type === 'breaker') for (const x of s.pending.moves.slice(s.pending.index + 1)) keep.add(x.botUid);
      const cost = s.bot.hand.filter((i) => !keep.has(i.uid) && i.uid !== m.botUid);
      const targets = playerFaceUp(s).filter((i) => !i.negated).sort((a, b) => Number(isMon(b)) - Number(isMon(a))).slice(0, n);
      for (const c of cost.slice(0, targets.length)) moveCard(s, 'bot', c.uid, 'gy');
      for (const t of targets) t.negated = true;
      log(s, 'system', `${targets.length} deiner Karten annulliert (Kosten: ${Math.min(cost.length, targets.length)} Handkarten des Bots).`, 'warn');
      break;
    }
    case 'evenly': {
      // Evenly Matched selbst liegt beim Auflösen auf dem Feld des Bots → du behältst so viele Karten wie der Bot
      const keep = s.bot.field.length + 1;
      s.pending = { type: 'evenly', keep };
      log(s, 'system', `Wähle ${keep} Karte(n), die du behältst; der Rest wird verdeckt verbannt.`, 'warn');
      break;
    }
  }
}

/** Auswahl für Evenly Matched: diese Karten bleiben, alle anderen werden verbannt. */
export function chooseEvenly(prev: DuelState, ctx: DuelCtx, keepUids: string[]): DuelState {
  const s = structuredClone(prev);
  if (s.pending?.type !== 'evenly') return prev;
  const keep = new Set(keepUids.slice(0, s.pending.keep));
  const gone = s.player.field.filter((i) => !keep.has(i.uid));
  for (const i of gone) moveCard(s, 'player', i.uid, 'banished', { faceDown: true });
  log(s, 'system', `${gone.length} Karte(n) verdeckt verbannt.`, 'warn');
  s.pending = null;
  finishBotTurn(s, ctx);
  return s;
}

function finishBotTurn(s: DuelState, ctx: DuelCtx) {
  s.phase = 'over';
  const left = s.player.field.filter((i) => !i.negated);
  log(s, 'system', `Nach dem Zug des Bots: ${left.length} deiner Karten sind noch aktiv (${left.map((i) => name(ctx, i.id)).join(', ') || '–'}).`, left.length ? 'good' : 'warn');
}

export interface DuelSummary {
  interruptions: UsedInterruption[];
  maxxDraws: number;
  endBoard: number[];
  survivors: number[];
  negatedSurvivors: number[];
  botHandLeft: number[];
}

export function summarize(s: DuelState): DuelSummary {
  return {
    interruptions: s.used,
    maxxDraws: s.maxxDraws,
    endBoard: s.endBoard ?? s.player.field.map((i) => i.id),
    survivors: s.player.field.filter((i) => !i.negated).map((i) => i.id),
    negatedSurvivors: s.player.field.filter((i) => i.negated).map((i) => i.id),
    botHandLeft: s.bot.hand.map((i) => i.id),
  };
}
