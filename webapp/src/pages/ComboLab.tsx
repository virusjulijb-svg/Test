import { useMemo, useRef, useState } from 'react';
import { CardView } from '../components/CardView';
import { Modal } from '../components/Modal';
import { isExtraDeckCard } from '../lib/carddb';
import {
  addBranch, addStep, analyzeSteps, countSteps, moveStep, newCombo, newStep, removeBranch, removeStep, updateBranch, updateStep,
  type StepAnalysis,
} from '../lib/combo';
import { INTERRUPTIONS, INTERRUPTION_BY_ID } from '../lib/interruptions';
import { ALL_TAGS, splitEffects, TAG_LABELS } from '../lib/tagging';
import type { ActionKind, Combo, ComboStep, Zone } from '../lib/types';
import { uid } from '../lib/util';
import { useStore } from '../store';

export const ACTION_LABELS: Record<ActionKind, string> = {
  normalSummon: 'Normalbeschwörung',
  setMonster: 'Monster setzen',
  specialSummon: 'Spezialbeschwörung',
  activate: 'Effekt aktivieren',
  setSpellTrap: 'Zauber/Falle setzen',
};
export const ZONE_LABELS: Record<Zone, string> = {
  hand: 'Hand', field: 'Spielfeld', gy: 'Friedhof', banished: 'Verbannt', deck: 'Deck', extra: 'Extra Deck',
};

const HANDTRAPS = INTERRUPTIONS.filter((i) => i.timing !== 'botTurn');

export default function ComboLab() {
  const { db, state, activeDeck, saveCombo, deleteCombo, toast } = useStore();
  const combos = state.combos.filter((c) => c.deckId === activeDeck?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ container: string; afterId?: string; step?: ComboStep } | null>(null);
  const [startPicker, setStartPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const combo = combos.find((c) => c.id === selectedId) ?? combos[0];
  const analysis = useMemo(() => (combo ? analyzeSteps(combo.steps, db) : new Map<string, StepAnalysis>()), [combo, db]);

  if (!activeDeck) return null;

  const create = () => {
    const c = newCombo(activeDeck.id, `Combo ${combos.length + 1}`);
    saveCombo(c);
    setSelectedId(c.id);
  };
  const exportJson = () => {
    if (!combo) return;
    const blob = new Blob([JSON.stringify(combo, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${combo.name.replace(/[^\w-]+/g, '_')}.combo.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (f: File) => {
    try {
      const c = JSON.parse(await f.text()) as Combo;
      if (!Array.isArray(c.steps)) throw new Error('Ungültige Datei');
      const imported = { ...c, id: uid(), deckId: activeDeck.id };
      saveCombo(imported);
      setSelectedId(imported.id);
      toast(`${c.name} importiert.`);
    } catch (e) {
      toast(`Import fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    }
  };

  const uncovered: { step: ComboStep; defs: string[] }[] = [];
  const walk = (steps: ComboStep[]) => {
    for (const s of steps) {
      const a = analysis.get(s.id);
      if (a && s.choke) {
        const missing = a.hits.filter((h) => !a.covered.includes(h) && ['ash', 'veiler', 'imperm', 'belle', 'gamma'].includes(h));
        if (missing.length) uncovered.push({ step: s, defs: missing });
      }
      s.branches.forEach((b) => walk(b.steps));
    }
  };
  if (combo) walk(combo.steps);
  const mainSummons = combo?.steps.length ? analysis.get(combo.steps[combo.steps.length - 1].id)?.summons ?? 0 : 0;

  return (
    <div className="combo-lab">
      <aside className="panel">
        <h2>Combo Lab</h2>
        <p className="muted small">Combos für <b>{activeDeck.name}</b>. Baue Schritt für Schritt die Linie und lege Alternativen für Handtraps an.</p>
        <div className="row wrap">
          <button onClick={create}>Neue Combo</button>
          <button className="ghost" onClick={() => fileRef.current?.click()}>Importieren</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
        <ul className="deck-list">
          {combos.map((c) => (
            <li key={c.id} className={c.id === combo?.id ? 'active' : ''} onClick={() => setSelectedId(c.id)}>
              <span>{c.name}</span><span className="muted small">{countSteps(c.steps)} Schritte</span>
            </li>
          ))}
          {combos.length === 0 && <li className="muted">Noch keine Combos.</li>}
        </ul>
        {combo && (
          <>
            <h3>Schwachstellen</h3>
            <ul className="legend">
              <li>Beschwörungen in der Hauptlinie: <b>{mainSummons}</b>{mainSummons >= 5 ? ' (Nibiru möglich)' : ''}</li>
              <li>Als Choke Point markierte Schritte ohne Alternative:</li>
            </ul>
            {uncovered.length === 0 ? (
              <p className="muted small">Keine – markiere wichtige Schritte als „Choke Point“, um sie hier zu prüfen.</p>
            ) : (
              <ul className="uncovered">
                {uncovered.map(({ step, defs }) => (
                  <li key={step.id}>{db.get(step.cardId)?.name}: {defs.map((d) => INTERRUPTION_BY_ID.get(d)?.short).join(', ')}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </aside>

      <section className="panel combo-main">
        {!combo ? (
          <p className="muted">Lege links eine Combo an.</p>
        ) : (
          <>
            <div className="row between wrap">
              <input className="title-input" value={combo.name} onChange={(e) => saveCombo({ ...combo, name: e.target.value })} aria-label="Name der Combo" />
              <div className="row">
                <button className="ghost small" onClick={exportJson}>Exportieren</button>
                <button className="ghost small danger" onClick={() => confirm('Combo löschen?') && deleteCombo(combo.id)}>Löschen</button>
              </div>
            </div>
            <textarea className="notes" rows={2} placeholder="Notizen (Endboard, Ziel der Linie …)" value={combo.notes} onChange={(e) => saveCombo({ ...combo, notes: e.target.value })} />
            <div className="row between">
              <h3>Starthand</h3>
              <button className="ghost small" onClick={() => setStartPicker(true)}>Bearbeiten</button>
            </div>
            <div className="hand">
              {combo.start.map((id, i) => <CardView key={i} id={id} size="sm" />)}
              {combo.start.length === 0 && <span className="muted small">Keine Karten gewählt – im Duell-Bot kann die Starthand damit vorgegeben werden.</span>}
            </div>
            <h3>Linie</h3>
            <StepList
              steps={combo.steps}
              container="main"
              combo={combo}
              analysis={analysis}
              onEdit={(step) => setEditing({ container: '', step })}
              onAdd={(container, afterId) => setEditing({ container, afterId })}
            />
          </>
        )}
      </section>

      {editing && combo && (
        <StepEditor
          initial={editing.step}
          onClose={() => setEditing(null)}
          onSave={(step) => {
            saveCombo(editing.step ? updateStep(combo, step.id, step) : addStep(combo, editing.container, step, editing.afterId));
            setEditing(null);
          }}
        />
      )}
      {startPicker && combo && (
        <StartPicker combo={combo} onClose={() => setStartPicker(false)} onSave={(start) => { saveCombo({ ...combo, start }); setStartPicker(false); }} />
      )}
    </div>
  );
}

function StepList({ steps, container, combo, analysis, onEdit, onAdd, depth = 0 }: {
  steps: ComboStep[];
  container: string;
  combo: Combo;
  analysis: Map<string, StepAnalysis>;
  onEdit: (s: ComboStep) => void;
  onAdd: (container: string, afterId?: string) => void;
  depth?: number;
}) {
  const { db, saveCombo } = useStore();
  const [branchFor, setBranchFor] = useState<string | null>(null);
  return (
    <ol className={`steps depth-${Math.min(depth, 3)}`}>
      {steps.map((s) => {
        const a = analysis.get(s.id);
        const card = db.get(s.cardId);
        return (
          <li key={s.id} className={`step ${s.choke ? 'choke' : ''}`}>
            <div className="step-body">
              <CardView id={s.cardId} size="xs" />
              <div className="step-info">
                <div className="step-title">
                  <b>{card?.name ?? 'Unbekannte Karte'}</b> · {ACTION_LABELS[s.action]}
                  {s.action === 'activate' || s.action === 'specialSummon' ? <span className="muted"> ({ZONE_LABELS[s.from]})</span> : null}
                  {s.targetCardId != null && <span className="muted"> → {db.get(s.targetCardId)?.name}</span>}
                  {s.choke && <span className="badge choke">Choke Point</span>}
                </div>
                {s.tags.length > 0 && <div className="row wrap">{s.tags.map((t) => <span key={t} className="tag">{TAG_LABELS[t]}</span>)}</div>}
                {s.note && <div className="muted small">{s.note}</div>}
                {a && (
                  <div className="row wrap vuln">
                    {a.hits.map((h) => (
                      <span key={h} className={`badge ${a.covered.includes(h) ? 'covered' : 'hit'}`} title={INTERRUPTION_BY_ID.get(h)?.howBotUsesIt}>
                        {INTERRUPTION_BY_ID.get(h)?.short}{a.covered.includes(h) ? ' ✓' : ''}
                      </span>
                    ))}
                    {a.maxxDraw && <span className="badge info">Maxx-Zug</span>}
                    {a.droll && <span className="badge info">Droll möglich</span>}
                    {a.drollBlocked && <span className="badge hit">scheitert bei Droll</span>}
                    {a.nibiru && <span className="badge hit">Nibiru ({a.summons}. Beschwörung)</span>}
                  </div>
                )}
              </div>
              <div className="step-actions">
                <button className="ghost small" onClick={() => onEdit(s)} title="Bearbeiten">✎</button>
                <button className="ghost small" onClick={() => saveCombo(moveStep(combo, s.id, -1))} title="nach oben">↑</button>
                <button className="ghost small" onClick={() => saveCombo(moveStep(combo, s.id, 1))} title="nach unten">↓</button>
                <button className="ghost small" onClick={() => setBranchFor(s.id)} title="Alternative bei Unterbrechung">⑂</button>
                <button className="ghost small" onClick={() => onAdd(container, s.id)} title="Schritt danach einfügen">＋</button>
                <button className="ghost small danger" onClick={() => saveCombo(removeStep(combo, s.id))} title="Löschen">✕</button>
              </div>
            </div>
            {branchFor === s.id && (
              <div className="row branch-new">
                <span className="small">Alternative, wenn hier folgendes kommt:</span>
                {[...HANDTRAPS, { id: 'other', short: 'Sonstiges' }].map((d) => (
                  <button key={d.id} className="ghost small" onClick={() => { saveCombo(addBranch(combo, s.id, d.id)); setBranchFor(null); }}>{d.short}</button>
                ))}
                <button className="ghost small" onClick={() => setBranchFor(null)}>abbrechen</button>
              </div>
            )}
            {s.branches.map((b) => (
              <div key={b.id} className="branch">
                <div className="row between">
                  <span className="branch-head">⑂ Wenn {INTERRUPTION_BY_ID.get(b.condition)?.short ?? 'Sonstiges'}:</span>
                  <div className="row">
                    <input className="small" placeholder="Notiz" value={b.note} onChange={(e) => saveCombo(updateBranch(combo, b.id, { note: e.target.value }))} />
                    <button className="ghost small danger" onClick={() => saveCombo(removeBranch(combo, b.id))}>✕</button>
                  </div>
                </div>
                <StepList steps={b.steps} container={b.id} combo={combo} analysis={analysis} onEdit={onEdit} onAdd={onAdd} depth={depth + 1} />
              </div>
            ))}
          </li>
        );
      })}
      <li className="add-step"><button className="ghost" onClick={() => onAdd(container)}>＋ Schritt hinzufügen</button></li>
    </ol>
  );
}

/** Auswahl einer Karte aus dem aktiven Deck (Main + Extra) als visuelles Raster. */
export function DeckCardGrid({ onPick, selected, includeExtra = true }: { onPick: (id: number) => void; selected?: number | null; includeExtra?: boolean }) {
  const { db, activeDeck } = useStore();
  if (!activeDeck) return null;
  const ids = [...new Set([...activeDeck.main, ...(includeExtra ? activeDeck.extra : [])])]
    .sort((a, b) => (db.get(a)?.name ?? '').localeCompare(db.get(b)?.name ?? ''));
  return (
    <div className="card-grid picker">
      {ids.map((id) => <CardView key={id} id={id} size="xs" selected={selected === id} onClick={() => onPick(id)} />)}
      {ids.length === 0 && <p className="muted">Das Deck ist leer.</p>}
    </div>
  );
}

function StepEditor({ initial, onClose, onSave }: { initial?: ComboStep; onClose: () => void; onSave: (s: ComboStep) => void }) {
  const { db } = useStore();
  const [step, setStep] = useState<ComboStep>(initial ?? newStep(-1));
  const card = db.get(step.cardId);
  const effects = card ? splitEffects(card.desc) : [];
  const set = (p: Partial<ComboStep>) => setStep((s) => ({ ...s, ...p }));

  const pickCard = (id: number) => {
    const c = db.get(id);
    const extra = c && isExtraDeckCard(c);
    const tagged = c ? splitEffects(c.desc).find((e) => e.tags.length) : undefined;
    set({
      cardId: id,
      action: extra ? 'specialSummon' : step.action,
      from: extra ? 'extra' : step.from,
      tags: step.action === 'activate' && !extra ? tagged?.tags ?? [] : [],
    });
  };

  return (
    <Modal title={initial ? 'Schritt bearbeiten' : 'Schritt hinzufügen'} onClose={onClose} wide>
      <div className="editor">
        <div>
          <h4>1. Karte wählen</h4>
          <DeckCardGrid onPick={pickCard} selected={step.cardId} />
        </div>
        <div>
          <h4>2. Aktion</h4>
          {card ? <p><b>{card.name}</b></p> : <p className="muted">Noch keine Karte gewählt.</p>}
          <div className="row wrap">
            <label>Aktion{' '}
              <select value={step.action} onChange={(e) => set({ action: e.target.value as ActionKind, tags: e.target.value === 'activate' ? step.tags : [] })}>
                {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>aus{' '}
              <select value={step.from} onChange={(e) => set({ from: e.target.value as Zone })}>
                {Object.entries(ZONE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          {step.action === 'activate' && effects.length > 0 && (
            <>
              <h4>Welcher Effekt?</h4>
              <div className="effects">
                {effects.map((e, i) => (
                  <button key={i} className={`effect ${e.tags.join() === step.tags.join() && e.tags.length ? 'on' : ''}`} onClick={() => set({ tags: e.tags })}>
                    <span className="small">{e.text.length > 180 ? `${e.text.slice(0, 180)} …` : e.text}</span>
                    {e.tags.length > 0 && <span className="row wrap">{e.tags.map((t) => <span key={t} className="tag">{TAG_LABELS[t]}</span>)}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
          {step.action === 'activate' && (
            <>
              <h4>Eigenschaften (für Handtraps)</h4>
              <div className="row wrap">
                {ALL_TAGS.map((t) => (
                  <label key={t} className="check">
                    <input type="checkbox" checked={step.tags.includes(t)} onChange={(e) => set({ tags: e.target.checked ? [...step.tags, t] : step.tags.filter((x) => x !== t) })} />
                    {TAG_LABELS[t]}
                  </label>
                ))}
              </div>
            </>
          )}
          <h4>Ziel (optional)</h4>
          <p className="muted small">Karte, die gesucht, beschworen oder gelegt wird – der Duell-Bot wählt sie bei der Wiedergabe automatisch.</p>
          <select value={step.targetCardId ?? ''} onChange={(e) => set({ targetCardId: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">– keins –</option>
            <TargetOptions />
          </select>
          <h4>Notiz</h4>
          <input value={step.note} onChange={(e) => set({ note: e.target.value })} placeholder="z. B. sucht Ritual-Zauber" />
          <label className="check"><input type="checkbox" checked={step.choke} onChange={(e) => set({ choke: e.target.checked })} /> Choke Point (Bot auf „Schwer“ unterbricht hier bevorzugt)</label>
          <div className="row">
            <button disabled={!card} onClick={() => onSave(step)}>Speichern</button>
            <button className="ghost" onClick={onClose}>Abbrechen</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function TargetOptions() {
  const { db, activeDeck } = useStore();
  const ids = [...new Set([...(activeDeck?.main ?? []), ...(activeDeck?.extra ?? [])])].sort((a, b) => (db.get(a)?.name ?? '').localeCompare(db.get(b)?.name ?? ''));
  return <>{ids.map((id) => <option key={id} value={id}>{db.get(id)?.name}</option>)}</>;
}

function StartPicker({ combo, onClose, onSave }: { combo: Combo; onClose: () => void; onSave: (start: number[]) => void }) {
  const { activeDeck } = useStore();
  const [start, setStart] = useState<number[]>(combo.start);
  const available = (id: number) => (activeDeck?.main.filter((x) => x === id).length ?? 0) > start.filter((x) => x === id).length;
  return (
    <Modal title="Starthand festlegen" onClose={onClose} wide>
      <p className="muted small">Klick fügt eine Karte hinzu (höchstens 6, Kopien laut Deck). Klick auf eine gewählte Karte entfernt sie.</p>
      <div className="hand">
        {start.map((id, i) => <CardView key={i} id={id} size="sm" onClick={() => setStart(start.filter((_, j) => j !== i))} />)}
      </div>
      <DeckCardGrid includeExtra={false} onPick={(id) => start.length < 6 && available(id) && setStart([...start, id])} />
      <div className="row">
        <button onClick={() => onSave(start)}>Übernehmen</button>
        <button className="ghost" onClick={onClose}>Abbrechen</button>
      </div>
    </Modal>
  );
}
