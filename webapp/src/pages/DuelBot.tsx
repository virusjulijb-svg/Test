import { useMemo, useState } from 'react';
import { CardDetail, CardView } from '../components/CardView';
import { Modal } from '../components/Modal';
import { isExtraDeckCard, isMonster, isSpell, isTrap } from '../lib/carddb';
import { newDeck } from '../lib/deck';
import {
  chooseEvenly, createDuel, declareAction, drawCard, endTurn, manualMove, resolveTag, respond, summarize, togglePosition,
  ZONE_NAMES, type Difficulty, type DuelCtx, type DuelState, type Inst, type PlayerAction,
} from '../lib/duel';
import { BOT_TEMPLATES, INTERRUPTIONS, INTERRUPTION_BY_ID, interruptionFor, templateToIds } from '../lib/interruptions';
import { ALL_TAGS, splitEffects, TAG_LABELS } from '../lib/tagging';
import type { ActionKind, ComboStep, Deck, EffectTag, Zone } from '../lib/types';
import { useStore } from '../store';
import { ACTION_LABELS } from './ComboLab';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Leicht – setzt Unterbrechungen zufällig ein',
  normal: 'Normal – unterbricht Starter, Suchen und Extender',
  hard: 'Schwer – wartet auf Choke Points und wichtige Karten',
};

interface HistoryEntry {
  date: number;
  deck: string;
  opponent: string;
  difficulty: Difficulty;
  interruptions: number;
  answered: number;
  endBoard: number;
  survivors: number;
}
const HISTORY_KEY = 'ygo-lab-history';
const loadHistory = (): HistoryEntry[] => {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryEntry[]; } catch { return []; }
};

interface Setup {
  botDeck: Deck;
  difficulty: Difficulty;
  comboId?: string;
  forceHand: boolean;
}

export default function DuelBot() {
  const { db, state, activeDeck, saveDeck, setSettings } = useStore();
  const [opponent, setOpponent] = useState<string>(state.settings.opponentDeckId ?? 'tpl:handtraps');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [comboId, setComboId] = useState<string>('');
  const [forceHand, setForceHand] = useState(true);
  const [running, setRunning] = useState<Setup | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const combos = state.combos.filter((c) => c.deckId === activeDeck?.id);
  const botDeck = useMemo<Deck | null>(() => {
    if (opponent.startsWith('tpl:')) {
      const t = BOT_TEMPLATES.find((x) => `tpl:${x.id}` === opponent);
      if (!t) return null;
      return { ...newDeck(t.name), id: opponent, main: templateToIds(t, db).main };
    }
    return state.decks.find((d) => d.id === opponent) ?? null;
  }, [opponent, db, state.decks]);

  if (!activeDeck) return null;

  if (running) {
    return (
      <DuelBoard
        setup={running}
        onExit={() => setRunning(null)}
        onFinished={(h) => {
          const next = [h, ...history].slice(0, 50);
          setHistory(next);
          try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ohne Verlauf weiter */ }
        }}
      />
    );
  }

  const tooSmall = activeDeck.main.length < 5;
  const botTooSmall = (botDeck?.main.length ?? 0) < 6;
  const distinctBot = botDeck ? [...new Set(botDeck.main)].filter((id) => id !== 0) : [];
  const isTemplate = opponent.startsWith('tpl:');
  const agg = history.length
    ? {
        games: history.length,
        inter: history.reduce((a, h) => a + h.interruptions, 0) / history.length,
        board: history.reduce((a, h) => a + h.endBoard, 0) / history.length,
        surv: history.reduce((a, h) => a + h.survivors, 0) / history.length,
      }
    : null;

  return (
    <div className="duel-setup">
      <section className="panel">
        <h2>Duell-Bot</h2>
        <p className="muted">
          Du beginnst mit <b>{activeDeck.name}</b>. Der Bot zieht 5 Karten aus dem Gegner-Deck und setzt in deinem Zug die
          gängigen Handtraps ein, danach im eigenen Zug Board-Breaker gegen dein Endboard. Kartenbewegungen führst du selbst
          aus; die Engine prüft, worauf der Bot reagieren darf.
        </p>
        {tooSmall && <p className="error">Dein Deck braucht mindestens 5 Karten im Main Deck.</p>}
        <label className="field">Gegner-Deck
          <select value={opponent} onChange={(e) => { setOpponent(e.target.value); if (!e.target.value.startsWith('tpl:')) setSettings({ opponentDeckId: e.target.value }); }}>
            <optgroup label="Vorlagen">
              {BOT_TEMPLATES.map((t) => <option key={t.id} value={`tpl:${t.id}`}>{t.name}</option>)}
            </optgroup>
            <optgroup label="Eigene Decks (z. B. importierte Meta-Decks)">
              {state.decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </optgroup>
          </select>
        </label>
        {isTemplate && <p className="muted small">{BOT_TEMPLATES.find((t) => `tpl:${t.id}` === opponent)?.description}</p>}
        <label className="field">Schwierigkeit
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            {Object.entries(DIFFICULTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">Combo üben (optional)
          <select value={comboId} onChange={(e) => setComboId(e.target.value)}>
            <option value="">– frei spielen –</option>
            {combos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {comboId && <label className="check"><input type="checkbox" checked={forceHand} onChange={(e) => setForceHand(e.target.checked)} /> Starthand der Combo vorgeben</label>}
        <div className="row">
          <button disabled={tooSmall || botTooSmall || !botDeck} onClick={() => botDeck && setRunning({ botDeck, difficulty, comboId: comboId || undefined, forceHand })}>
            Duell starten
          </button>
        </div>
        {botTooSmall && <p className="error">Das Gegner-Deck braucht mindestens 6 Karten.</p>}
        {agg && (
          <>
            <h3>Verlauf</h3>
            <p className="muted small">
              {agg.games} Duelle · Ø {agg.inter.toFixed(1).replace('.', ',')} Unterbrechungen · Ø Endboard {agg.board.toFixed(1).replace('.', ',')} Karten ·
              Ø {agg.surv.toFixed(1).replace('.', ',')} Karten nach dem Zug des Bots
            </p>
            <table className="results-table small">
              <thead><tr><th>Datum</th><th>Deck</th><th>Gegner</th><th>Unterbr.</th><th>beantwortet</th><th>Endboard</th><th>übrig</th></tr></thead>
              <tbody>
                {history.slice(0, 10).map((h, i) => (
                  <tr key={i}>
                    <td>{new Date(h.date).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{h.deck}</td><td>{h.opponent}</td><td>{h.interruptions}</td><td>{h.answered}</td><td>{h.endBoard}</td><td>{h.survivors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="panel">
        <h3>Interaktionen im Gegner-Deck</h3>
        {botDeck && (
          <table className="cat-table">
            <tbody>
              {distinctBot.map((id) => {
                const c = db.get(id);
                const def = interruptionFor(c, botDeck);
                const custom = botDeck.botRoles[String(id)] ?? '';
                return (
                  <tr key={id}>
                    <td><CardView id={id} size="xs" /></td>
                    <td className="name">{c?.name}<div className="muted small">{botDeck.main.filter((x) => x === id).length}×</div></td>
                    <td>
                      {isTemplate ? (
                        <span className={def ? 'tag' : 'muted small'}>{def ? def.short : '–'}</span>
                      ) : (
                        <select
                          value={custom}
                          onChange={(e) => {
                            const roles = { ...botDeck.botRoles };
                            if (e.target.value) roles[String(id)] = e.target.value; else delete roles[String(id)];
                            saveDeck({ ...botDeck, botRoles: roles });
                          }}
                          aria-label={`Verhalten von ${c?.name}`}
                        >
                          <option value="">{def && !custom ? `automatisch: ${def.short}` : 'automatisch: keine Interaktion'}</option>
                          <option value="none">keine Interaktion</option>
                          {INTERRUPTIONS.map((d) => <option key={d.id} value={d.id}>verhält sich wie {d.short}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="muted small">
          Erkannt werden die Karten per Name. Neuere Handtraps oder Karten mit ähnlicher Wirkung kannst du über „verhält sich wie …“ einer
          bekannten Unterbrechung zuordnen.
        </p>
        <details>
          <summary>Wie der Bot die Karten einsetzt</summary>
          <ul className="legend">
            {INTERRUPTIONS.map((d) => <li key={d.id}><b>{d.short}:</b> {d.howBotUsesIt}</li>)}
          </ul>
        </details>
      </section>
    </div>
  );
}

type Dialog =
  | { type: 'menu'; inst: Inst; zone: Zone }
  | { type: 'activate'; inst: Inst; zone: Zone }
  | { type: 'materials'; inst: Inst }
  | { type: 'zone'; side: 'player' | 'bot'; zone: Zone };

function DuelBoard({ setup, onExit, onFinished }: { setup: Setup; onExit: () => void; onFinished: (h: HistoryEntry) => void }) {
  const { db, state: store, activeDeck, toast } = useStore();
  const ctx = useMemo<DuelCtx>(() => ({ db, playerDeck: activeDeck!, botDeck: setup.botDeck }), [db, activeDeck, setup.botDeck]);
  const combo = store.combos.find((c) => c.id === setup.comboId);
  const start = () => createDuel(ctx, { difficulty: setup.difficulty, forcedHand: setup.forceHand ? combo?.start : undefined });
  const [s, setS] = useState<DuelState>(start);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [queue, setQueue] = useState<ComboStep[]>(combo?.steps ?? []);
  const [current, setCurrent] = useState<ComboStep | null>(null);
  const [recorded, setRecorded] = useState(false);

  const restart = () => {
    setS(start());
    setQueue(combo?.steps ?? []);
    setCurrent(null);
    setRecorded(false);
    setDialog(null);
  };

  const autoResolve = (st: DuelState, step: ComboStep | null): DuelState => {
    if (!st.resolution || st.pending || step?.targetCardId == null) return st;
    for (const tag of st.resolution.tags) {
      const zone: Zone = tag === 'search' || tag === 'deckSS' || tag === 'deckSend' ? 'deck' : 'gy';
      const target = st.player[zone].find((i) => i.id === step.targetCardId);
      if (target) return resolveTag(st, ctx, tag, target.uid);
    }
    return st;
  };

  const declare = (a: PlayerAction, step: ComboStep | null = null) => {
    const r = declareAction(s, ctx, a);
    if ('error' in r) { toast(r.error); return false; }
    setS(autoResolve(r, step));
    setDialog(null);
    return true;
  };

  const answer = (negateWith?: string) => {
    const before = s.used.length;
    let r = respond(s, ctx, { negateWith });
    const hit = r.used.slice(before).find((u) => !u.answered);
    if (hit && current) {
      const branch = current.branches.find((b) => b.condition === hit.defId);
      if (branch) {
        setQueue(branch.steps);
        toast(`Combo: Alternative „Wenn ${INTERRUPTION_BY_ID.get(hit.defId)?.short}“`);
      }
    }
    r = autoResolve(r, current);
    setS(r);
    finishIfOver(r);
  };

  const finishIfOver = (r: DuelState) => {
    if (r.phase !== 'over' || recorded) return;
    const sum = summarize(r);
    onFinished({
      date: Date.now(), deck: activeDeck!.name, opponent: setup.botDeck.name, difficulty: setup.difficulty,
      interruptions: sum.interruptions.length, answered: sum.interruptions.filter((u) => u.answered).length,
      endBoard: sum.endBoard.length, survivors: sum.survivors.length,
    });
    setRecorded(true);
  };

  const runNext = () => {
    const step = queue[0];
    if (!step) return;
    const zone = step.from;
    const candidates = s.player[step.action === 'normalSummon' || step.action === 'setMonster' || step.action === 'setSpellTrap' ? 'hand' : zone]
      .filter((i) => i.id === step.cardId);
    const inst = candidates.find((i) => !i.faceDown) ?? candidates[0];
    if (!inst) {
      toast(`${db.get(step.cardId)?.name} liegt nicht in: ${ZONE_NAMES[zone]}. Führe den Schritt von Hand aus oder überspringe ihn.`);
      return;
    }
    const card = db.get(inst.id);
    if (step.action === 'specialSummon' && card && isExtraDeckCard(card)) {
      setCurrent(step);
      setQueue(queue.slice(1));
      setDialog({ type: 'materials', inst });
      return;
    }
    if (declare({ kind: step.action, uid: inst.uid, tags: step.tags, choke: step.choke }, step)) {
      setCurrent(step);
      setQueue(queue.slice(1));
    }
  };

  const sum = s.phase === 'over' ? summarize(s) : null;
  const p = s.pending;

  const cardClick = (inst: Inst, zone: Zone) => {
    if (s.phase !== 'player' || s.pending) return;
    setDialog({ type: 'menu', inst, zone });
  };

  const pile = (side: 'player' | 'bot', zone: Zone) => {
    const list = s[side][zone];
    const top = list[list.length - 1];
    const hidden = zone === 'deck' || (side === 'bot' && zone === 'extra');
    return (
      <div className="pile" onClick={() => (side === 'player' || !hidden) && setDialog({ type: 'zone', side, zone })} role="button" aria-label={`${ZONE_NAMES[zone]} (${list.length})`}>
        {top && !hidden ? <CardView id={top.id} size="xs" /> : <div className={`card card-xs ${list.length ? 'card-back' : 'card-empty'}`} />}
        <span className="pile-label">{ZONE_NAMES[zone]} {list.length}</span>
      </div>
    );
  };

  return (
    <div className="duel">
      <section className="board panel">
        <div className="bot-area">
          <div className="row between">
            <div className="row wrap">
              <b>Bot</b>
              <span className="muted small">Hand: {s.bot.hand.length}</span>
              {s.maxx > 0 && <span className="badge hit">Maxx „C“ aktiv · {s.maxxDraws} gezogen</span>}
              {s.drollLock && <span className="badge hit">Droll-Lock</span>}
              {s.shifter && <span className="badge hit">Dimension Shifter</span>}
              {s.blocked.map((id) => <span key={id} className="badge covered">gesperrt: {db.get(id)?.name}</span>)}
            </div>
            <div className="row">{pile('bot', 'gy')}{pile('bot', 'banished')}{pile('bot', 'deck')}</div>
          </div>
          <div className="hand bot-hand">
            {s.bot.hand.map((i) => <CardView key={i.uid} id={i.id} size="xs" faceDown={s.phase !== 'over'} />)}
          </div>
          <div className="field-row">
            {s.bot.field.map((i) => <CardView key={i.uid} id={i.id} size="sm" onMouseEnter={() => setHover(i.id)} />)}
            {s.bot.field.length === 0 && <span className="muted small">Spielfeld des Bots leer</span>}
          </div>
        </div>

        <div className="player-area">
          <div className="field-row">
            {s.player.field.map((i) => (
              <div key={i.uid} className={`field-card ${i.defense ? 'def' : ''}`}>
                <CardView
                  id={i.id}
                  size="sm"
                  faceDown={i.faceDown}
                  title={db.get(i.id)?.name}
                  onClick={() => cardClick(i, 'field')}
                  onMouseEnter={() => setHover(i.id)}
                  badge={<>
                    {i.negated && <span className="card-flag neg">annulliert</span>}
                    {i.materials?.length ? <span className="card-flag mat">{i.materials.length} Mat.</span> : null}
                    {i.usedNegate && <span className="card-flag used">genutzt</span>}
                  </>}
                />
              </div>
            ))}
            {s.player.field.length === 0 && <span className="muted small">Dein Spielfeld ist leer</span>}
          </div>
          <div className="row between">
            <div className="row">{pile('player', 'deck')}{pile('player', 'extra')}</div>
            <div className="row">{pile('player', 'gy')}{pile('player', 'banished')}</div>
          </div>
          <div className="hand">
            {s.player.hand.map((i) => (
              <CardView key={i.uid} id={i.id} size="md" onClick={() => cardClick(i, 'hand')} onMouseEnter={() => setHover(i.id)} />
            ))}
          </div>
          <div className="row wrap controls">
            <span className="muted small">Beschwörungen: {s.summons} · Normalbeschwörung {s.normalSummonUsed ? 'verbraucht' : 'frei'}</span>
            <button className="ghost small" disabled={s.phase !== 'player' || !!p} onClick={() => setS(drawCard(s, ctx))}>Karte ziehen</button>
            <button disabled={s.phase !== 'player' || !!p} onClick={() => { const r = endTurn(s, ctx); setS(r); finishIfOver(r); }}>Zug beenden</button>
            <button className="ghost small" onClick={restart}>Neues Duell</button>
            <button className="ghost small" onClick={onExit}>Einstellungen</button>
          </div>
        </div>

        {s.resolution && !p && <ResolutionBar s={s} onPick={(tag, u) => setS(resolveTag(s, ctx, tag, u))} />}
      </section>

      <aside className="panel side">
        {combo && s.phase === 'player' && (
          <div className="playback">
            <h3>Combo: {combo.name}</h3>
            {current && <p className="small">Zuletzt: {db.get(current.cardId)?.name} · {ACTION_LABELS[current.action]}</p>}
            {queue[0] ? (
              <>
                <p className="small">Nächster Schritt: <b>{db.get(queue[0].cardId)?.name}</b> · {ACTION_LABELS[queue[0].action]}{queue[0].note ? ` – ${queue[0].note}` : ''}</p>
                <div className="row">
                  <button className="small" disabled={!!p} onClick={runNext}>Schritt ausführen</button>
                  <button className="ghost small" onClick={() => setQueue(queue.slice(1))}>Überspringen</button>
                </div>
              </>
            ) : (
              <p className="muted small">Combo abgeschlossen. Beende den Zug, wenn dein Endboard steht.</p>
            )}
          </div>
        )}
        {sum && <Summary sum={sum} onAgain={restart} />}
        <CardDetail id={hover} />
        <h3>Protokoll</h3>
        <ol className="log">
          {s.log.slice().reverse().map((l, i) => (
            <li key={s.log.length - i} className={`${l.who} ${l.tone ?? ''}`}>
              <b>{l.who === 'player' ? 'Du' : l.who === 'bot' ? 'Bot' : '·'}</b> {l.text}
            </li>
          ))}
        </ol>
      </aside>

      {p && p.type !== 'evenly' && <PendingDialog s={s} onAnswer={answer} />}
      {p && p.type === 'evenly' && <EvenlyDialog s={s} keep={p.keep} onDone={(keep) => { const r = chooseEvenly(s, ctx, keep); setS(r); finishIfOver(r); }} />}
      {dialog?.type === 'menu' && (
        <ActionMenu
          s={s}
          inst={dialog.inst}
          zone={dialog.zone}
          onClose={() => setDialog(null)}
          onAction={(kind) => {
            const card = db.get(dialog.inst.id)!;
            if (kind === 'activate') setDialog({ type: 'activate', inst: dialog.inst, zone: dialog.zone });
            else if (kind === 'specialSummon' && isExtraDeckCard(card) && dialog.zone === 'extra') setDialog({ type: 'materials', inst: dialog.inst });
            else declare({ kind, uid: dialog.inst.uid, tags: [] });
          }}
          onMove={(to, faceDown) => { setS(manualMove(s, ctx, dialog.inst.uid, to, { faceDown })); setDialog(null); }}
          onPosition={() => { setS(togglePosition(s, dialog.inst.uid)); setDialog(null); }}
        />
      )}
      {dialog?.type === 'activate' && (
        <ActivateDialog inst={dialog.inst} zone={dialog.zone} onClose={() => setDialog(null)} onActivate={(tags, text) => declare({ kind: 'activate', uid: dialog.inst.uid, tags, effectText: text })} />
      )}
      {dialog?.type === 'materials' && (
        <MaterialDialog s={s} inst={dialog.inst} onClose={() => setDialog(null)} onSummon={(materials) => declare({ kind: 'specialSummon', uid: dialog.inst.uid, tags: [], materials, choke: current?.choke }, current)} />
      )}
      {dialog?.type === 'zone' && (
        <ZoneDialog s={s} side={dialog.side} zone={dialog.zone} onClose={() => setDialog(null)} onPick={(inst) => dialog.side === 'player' && s.phase === 'player' && !p && setDialog({ type: 'menu', inst, zone: dialog.zone })} />
      )}
    </div>
  );
}

function ActionMenu({ s, inst, zone, onClose, onAction, onMove, onPosition }: {
  s: DuelState; inst: Inst; zone: Zone; onClose: () => void;
  onAction: (k: ActionKind) => void; onMove: (to: Zone, faceDown?: boolean) => void; onPosition: () => void;
}) {
  const { db } = useStore();
  const card = db.get(inst.id)!;
  const monster = isMonster(card);
  const st = isSpell(card) || isTrap(card);
  const actions: [ActionKind, string][] = [];
  if (zone === 'hand' && monster && !isExtraDeckCard(card)) {
    if (!s.normalSummonUsed) actions.push(['normalSummon', 'Normalbeschwörung'], ['setMonster', 'Setzen']);
    actions.push(['specialSummon', 'Spezialbeschwörung']);
  }
  if (zone === 'hand' && st) actions.push(['activate', 'Aktivieren'], ['setSpellTrap', 'Setzen']);
  else if (zone !== 'deck' && zone !== 'extra' && !(zone === 'field' && inst.faceDown && monster)) actions.push(['activate', monster ? 'Effekt aktivieren' : 'Aktivieren / Effekt']);
  if (zone === 'extra' || zone === 'gy' || zone === 'banished' || zone === 'deck') if (monster) actions.push(['specialSummon', 'Spezialbeschwörung']);

  const moves: [Zone, string][] = ([
    ['hand', 'Auf die Hand'], ['gy', 'Auf den Friedhof'], ['banished', 'Verbannen'], ['deck', 'Ins Deck'],
    ...(isExtraDeckCard(card) ? [['extra', 'Ins Extra Deck'] as [Zone, string]] : []),
  ] as [Zone, string][]).filter(([z]) => z !== zone && !(z === 'deck' && isExtraDeckCard(card)) && !(z === 'hand' && isExtraDeckCard(card)));

  return (
    <Modal title={card.name} onClose={onClose}>
      <div className="menu-grid">
        <CardView id={inst.id} size="md" />
        <div>
          <h4>Aktionen <span className="muted small">(der Bot kann reagieren)</span></h4>
          <div className="row wrap">
            {actions.map(([k, l]) => <button key={k + l} onClick={() => onAction(k)}>{l}</button>)}
            {zone === 'field' && monster && <button className="ghost" onClick={onPosition}>{inst.defense ? 'In Angriffsposition' : 'In Verteidigungsposition'}</button>}
          </div>
          <h4>Bewegen <span className="muted small">(ohne Aktivierung, z. B. Kosten)</span></h4>
          <div className="row wrap">
            {moves.map(([z, l]) => <button key={z} className="ghost small" onClick={() => onMove(z)}>{l}</button>)}
            {zone !== 'field' && !monster && <button className="ghost small" onClick={() => onMove('field')}>Offen aufs Feld</button>}
          </div>
          <p className="desc small">{card.desc}</p>
        </div>
      </div>
    </Modal>
  );
}

function ActivateDialog({ inst, zone, onClose, onActivate }: { inst: Inst; zone: Zone; onClose: () => void; onActivate: (tags: EffectTag[], text?: string) => void }) {
  const { db } = useStore();
  const card = db.get(inst.id)!;
  const effects = splitEffects(card.desc);
  const firstTagged = effects.findIndex((e) => e.tags.length > 0);
  const [choice, setChoice] = useState<number>(firstTagged >= 0 ? firstTagged : -1);
  const [tags, setTags] = useState<EffectTag[]>(firstTagged >= 0 ? effects[firstTagged].tags : []);
  return (
    <Modal title={`${card.name} aktivieren (${ZONE_NAMES[zone]})`} onClose={onClose} wide>
      <p className="muted small">Wähle den Effekt. Die Häkchen bestimmen, auf welche Handtraps der Bot reagieren darf (z. B. Ash Blossom bei „Deck → Hand“).</p>
      <div className="effects">
        {effects.map((e, i) => (
          <button key={i} className={`effect ${choice === i ? 'on' : ''}`} onClick={() => { setChoice(i); setTags(e.tags); }}>
            <span className="small">{e.text}</span>
            {e.tags.length > 0 && <span className="row wrap">{e.tags.map((t) => <span key={t} className="tag">{TAG_LABELS[t]}</span>)}</span>}
          </button>
        ))}
      </div>
      <div className="row wrap">
        {ALL_TAGS.map((t) => (
          <label key={t} className="check">
            <input type="checkbox" checked={tags.includes(t)} onChange={(e) => setTags(e.target.checked ? [...tags, t] : tags.filter((x) => x !== t))} />
            {TAG_LABELS[t]}
          </label>
        ))}
      </div>
      <div className="row">
        <button onClick={() => onActivate(tags, effects[choice]?.text)}>Aktivieren</button>
        <button className="ghost" onClick={onClose}>Abbrechen</button>
      </div>
    </Modal>
  );
}

function MaterialDialog({ s, inst, onClose, onSummon }: { s: DuelState; inst: Inst; onClose: () => void; onSummon: (m: string[]) => void }) {
  const { db } = useStore();
  const card = db.get(inst.id)!;
  const [sel, setSel] = useState<string[]>([]);
  const need = card.linkval ?? (card.frameType.startsWith('xyz') ? 2 : undefined);
  return (
    <Modal title={`${card.name} beschwören`} onClose={onClose}>
      <p className="muted small">Wähle die Materialien vom Spielfeld{need ? ` (üblich: ${card.frameType === 'link' ? `bis zu ${need}` : need})` : ''}. Xyz-Materialien werden angehängt, alle anderen kommen auf den Friedhof.</p>
      <div className="field-row">
        {s.player.field.map((i) => (
          <CardView key={i.uid} id={i.id} size="sm" faceDown={i.faceDown} selected={sel.includes(i.uid)}
            onClick={() => setSel(sel.includes(i.uid) ? sel.filter((x) => x !== i.uid) : [...sel, i.uid])} />
        ))}
        {s.player.field.length === 0 && <span className="muted">Keine Karten auf dem Spielfeld.</span>}
      </div>
      <div className="row">
        <button onClick={() => onSummon(sel)}>Beschwören ({sel.length} Material{sel.length === 1 ? '' : 'ien'})</button>
        <button className="ghost" onClick={onClose}>Abbrechen</button>
      </div>
    </Modal>
  );
}

function PendingDialog({ s, onAnswer }: { s: DuelState; onAnswer: (negateWith?: string) => void }) {
  const { db } = useStore();
  const p = s.pending!;
  if (p.type === 'evenly') return null;
  const m = p.moves[p.index];
  const def = INTERRUPTION_BY_ID.get(m.defId);
  const options = [
    ...s.player.hand.map((i) => ({ i, where: 'Hand' })),
    ...s.player.field.filter((i) => !i.usedNegate && !i.negated).map((i) => ({ i, where: 'Feld' })),
  ];
  return (
    <Modal title={p.type === 'breaker' ? 'Der Bot spielt einen Board-Breaker' : 'Der Bot unterbricht!'}>
      <div className="menu-grid">
        <CardView id={m.cardId} size="md" />
        <div>
          <p className="interrupt-text">{m.text}</p>
          {def && <p className="muted small">{def.howBotUsesIt}</p>}
          <div className="row"><button onClick={() => onAnswer()}>Zulassen</button></div>
          <h4>Oder beantworten mit …</h4>
          <p className="muted small">Wähle eine Karte, mit der du die Aktivierung negierst (z. B. Called by the Grave, Crossout Designator oder ein Negate auf dem Feld). Called/Crossout sperren zusätzlich den Kartennamen.</p>
          <div className="card-grid picker">
            {options.map(({ i, where }) => (
              <CardView key={i.uid} id={i.id} size="xs" faceDown={false} title={`${db.get(i.id)?.name} (${where})`} onClick={() => onAnswer(i.uid)} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function EvenlyDialog({ s, keep, onDone }: { s: DuelState; keep: number; onDone: (keep: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <Modal title="Evenly Matched">
      <p>Wähle {keep} Karte(n), die du behältst. Alle anderen werden verdeckt verbannt.</p>
      <div className="field-row">
        {s.player.field.map((i) => (
          <CardView key={i.uid} id={i.id} size="sm" faceDown={i.faceDown} selected={sel.includes(i.uid)}
            onClick={() => setSel(sel.includes(i.uid) ? sel.filter((x) => x !== i.uid) : sel.length < keep ? [...sel, i.uid] : sel)} />
        ))}
      </div>
      <button disabled={sel.length !== Math.min(keep, s.player.field.length)} onClick={() => onDone(sel)}>Bestätigen</button>
    </Modal>
  );
}

function ResolutionBar({ s, onPick }: { s: DuelState; onPick: (tag: EffectTag, uid: string | null) => void }) {
  const tag = s.resolution!.tags[0];
  const fromDeck = tag === 'search' || tag === 'deckSS' || tag === 'deckSend';
  let list = fromDeck ? s.player.deck : s.player.gy;
  if (tag === 'gyBanish') list = [...s.player.gy, ...s.bot.gy];
  const sorted = [...list].sort((a, b) => a.id - b.id);
  const seen = new Set<number>();
  const unique = sorted.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  return (
    <div className="resolution">
      <div className="row between">
        <b>Effekt auflösen: {TAG_LABELS[tag]}</b>
        <button className="ghost small" onClick={() => onPick(tag, null)}>Überspringen</button>
      </div>
      {s.drollLock && tag === 'search' && <p className="error small">Droll & Lock Bird ist aktiv – das Hinzufügen scheitert.</p>}
      <div className="card-grid picker">
        {unique.map((i) => <CardView key={i.uid} id={i.id} size="xs" onClick={() => onPick(tag, i.uid)} />)}
        {unique.length === 0 && <span className="muted small">Keine Karten verfügbar.</span>}
      </div>
    </div>
  );
}

function ZoneDialog({ s, side, zone, onClose, onPick }: { s: DuelState; side: 'player' | 'bot'; zone: Zone; onClose: () => void; onPick: (i: Inst) => void }) {
  const list = s[side][zone];
  return (
    <Modal title={`${side === 'player' ? 'Dein' : 'Bot:'} ${ZONE_NAMES[zone]} (${list.length})`} onClose={onClose} wide>
      {zone === 'deck' && side === 'player' && <p className="muted small">Sortierte Ansicht; die Reihenfolge im Deck bleibt verborgen.</p>}
      <div className="card-grid picker">
        {(zone === 'deck' ? [...list].sort((a, b) => a.id - b.id) : list).map((i) => (
          <CardView key={i.uid} id={i.id} size="sm" faceDown={i.faceDown && side === 'bot'} onClick={() => onPick(i)} />
        ))}
      </div>
    </Modal>
  );
}

function Summary({ sum, onAgain }: { sum: ReturnType<typeof summarize>; onAgain: () => void }) {
  const { db } = useStore();
  const n = (id: number) => db.get(id)?.name ?? `#${id}`;
  return (
    <div className="summary">
      <h3>Auswertung</h3>
      <ul className="legend">
        <li>Unterbrechungen: <b>{sum.interruptions.length}</b> ({sum.interruptions.filter((u) => u.answered).length} beantwortet)</li>
        {sum.interruptions.map((u, i) => (
          <li key={i} className="small">
            {INTERRUPTION_BY_ID.get(u.defId)?.short}{u.on != null ? ` auf ${n(u.on)}` : ''} – {u.answered ? 'beantwortet' : 'durchgekommen'}
          </li>
        ))}
        <li>Maxx „C“-Karten für den Bot: <b>{sum.maxxDraws}</b></li>
        <li>Endboard: <b>{sum.endBoard.length}</b> {sum.endBoard.length ? `(${sum.endBoard.map(n).join(', ')})` : ''}</li>
        <li>Nach dem Zug des Bots aktiv: <b>{sum.survivors.length}</b> {sum.survivors.length ? `(${sum.survivors.map(n).join(', ')})` : ''}</li>
        {sum.negatedSurvivors.length > 0 && <li>Auf dem Feld, aber annulliert: {sum.negatedSurvivors.map(n).join(', ')}</li>}
      </ul>
      <h4>Hand des Bots am Ende</h4>
      <div className="hand">{sum.botHandLeft.map((id, i) => <CardView key={i} id={id} size="xs" />)}</div>
      <button onClick={onAgain}>Noch einmal</button>
    </div>
  );
}
