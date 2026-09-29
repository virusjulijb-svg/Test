import { useMemo, useState } from 'react';
import { CardView } from '../components/CardView';
import { interruptionFor } from '../lib/interruptions';
import { analyze, conditionMet, drawHand, handCounts, withCopies } from '../lib/probability';
import type { Category, Condition, Deck, Requirement } from '../lib/types';
import { countBy, pct, uid } from '../lib/util';
import { useStore } from '../store';

const COLORS = ['#3fb950', '#58a6ff', '#d29922', '#f85149', '#bc8cff', '#39c5cf', '#ff7b72', '#e3b341'];

export default function ConsistencyLab() {
  const { db, activeDeck, saveDeck, toast } = useStore();
  const [ratioCard, setRatioCard] = useState<number | null>(null);
  const [testHand, setTestHand] = useState<number[] | null>(null);
  const [testSize, setTestSize] = useState(5);
  const [extraDraws, setExtraDraws] = useState(0);

  const deck = activeDeck;
  const first = useMemo(() => (deck ? analyze(deck, 5 + extraDraws) : null), [deck, extraDraws]);
  const second = useMemo(() => (deck ? analyze(deck, 6 + extraDraws) : null), [deck, extraDraws]);
  const ratio = useMemo(() => {
    if (!deck || ratioCard == null) return null;
    return [0, 1, 2, 3].map((n) => {
      const d = withCopies(deck, ratioCard, n);
      return { n, size: d.main.length, first: analyze(d, 5 + extraDraws).anyCondition, second: analyze(d, 6 + extraDraws).anyCondition };
    });
  }, [deck, ratioCard, extraDraws]);

  if (!deck || !first || !second) return null;
  if (deck.main.length === 0) {
    return <div className="panel"><h2>Consistency Lab</h2><p className="muted">Das aktive Deck hat noch keine Karten im Main Deck. Lege im Deckbuilder Karten an oder importiere ein Deck.</p></div>;
  }

  const set = (patch: Partial<Deck>) => saveDeck({ ...deck, ...patch, updatedAt: Date.now() });
  const counts = [...countBy(deck.main).entries()].sort((a, b) => b[1] - a[1] || (db.get(a[0])?.name ?? '').localeCompare(db.get(b[0])?.name ?? ''));
  const catsOf = (id: number) => deck.cardCategories[String(id)] ?? [];
  const toggleCat = (id: number, cat: string) => {
    const cur = catsOf(id);
    const next = cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat];
    set({ cardCategories: { ...deck.cardCategories, [String(id)]: next } });
  };
  const catSize = (cat: string) => deck.main.filter((id) => catsOf(id).includes(cat)).length;

  const addCategory = () => {
    const n = prompt('Name der Kategorie (z. B. „Engine“, „Board-Breaker“)');
    if (!n?.trim()) return;
    const c: Category = { id: uid(), name: n.trim(), color: COLORS[deck.categories.length % COLORS.length] };
    set({ categories: [...deck.categories, c] });
  };
  const removeCategory = (id: string) => {
    const cardCategories = Object.fromEntries(Object.entries(deck.cardCategories).map(([k, v]) => [k, v.filter((c) => c !== id)]));
    const conditions = deck.conditions.map((c) => ({ ...c, variants: c.variants.map((v) => v.filter((r) => !(r.kind === 'category' && r.ref === id))) }));
    set({ categories: deck.categories.filter((c) => c.id !== id), cardCategories, conditions });
  };

  const setCond = (id: string, patch: Partial<Condition>) => set({ conditions: deck.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const addCond = () => set({
    conditions: [...deck.conditions, { id: uid(), name: `Bedingung ${deck.conditions.length + 1}`, variants: [[{ kind: 'category', ref: deck.categories[0]?.id ?? '', min: 1 }]] }],
  });

  const autoHandtraps = () => {
    if (!deck.categories.some((c) => c.id === 'handtrap')) return;
    const cardCategories = { ...deck.cardCategories };
    let n = 0;
    for (const id of new Set(deck.main)) {
      const def = interruptionFor(db.get(id));
      const cur = cardCategories[String(id)] ?? [];
      if (def && def.timing !== 'botTurn' && !cur.includes('handtrap')) { cardCategories[String(id)] = [...cur, 'handtrap']; n++; }
    }
    set({ cardCategories });
    toast(n ? `${n} Handtrap(s) zugeordnet.` : 'Keine weiteren Handtraps erkannt.');
  };

  const draw = (n: number) => { setTestSize(n); setTestHand(drawHand(deck, n)); };
  const hc = testHand ? handCounts(deck, testHand) : null;

  return (
    <div className="lab">
      <section className="panel">
        <h2>Consistency Lab – {deck.name}</h2>
        <p className="muted">
          Ordne die Karten Kategorien zu und lege fest, welche Starthände spielbar sind. Die Wahrscheinlichkeiten werden
          exakt über die multivariate hypergeometrische Verteilung berechnet ({deck.main.length} Karten im Main Deck).
        </p>
        <div className="row wrap">
          <label>Zusätzlich gezogene Karten{' '}
            <select value={extraDraws} onChange={(e) => setExtraDraws(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? 'keine' : `+${n}`}</option>)}
            </select>
          </label>
        </div>
        <table className="results-table">
          <thead>
            <tr><th>Bedingung</th><th>Als Erster ({5 + extraDraws} Karten)</th><th>Als Zweiter ({6 + extraDraws} Karten)</th></tr>
          </thead>
          <tbody>
            {deck.conditions.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td><Bar p={first.conditions[c.id] ?? 0} /></td>
                <td><Bar p={second.conditions[c.id] ?? 0} /></td>
              </tr>
            ))}
            <tr className="total">
              <td>Mindestens eine Bedingung</td>
              <td><Bar p={first.anyCondition} /></td>
              <td><Bar p={second.anyCondition} /></td>
            </tr>
          </tbody>
        </table>
        {!first.exact && <p className="muted small">Sehr viele Kategorien: Werte per Monte-Carlo-Simulation (200.000 Hände) geschätzt.</p>}

        <h3>Verteilung pro Kategorie (als Erster)</h3>
        <table className="results-table">
          <thead><tr><th>Kategorie</th><th>Karten</th><th>0</th><th>1</th><th>2+</th><th>≥1 als Zweiter</th></tr></thead>
          <tbody>
            {deck.categories.map((c) => {
              const d = first.distribution[c.id] ?? [];
              const d2 = second.distribution[c.id] ?? [];
              return (
                <tr key={c.id}>
                  <td><span className="dot" style={{ background: c.color }} /> {c.name}</td>
                  <td>{catSize(c.id)}</td>
                  <td>{pct(d[0] ?? 0)}</td>
                  <td>{pct(d[1] ?? 0)}</td>
                  <td>{pct(d.slice(2).reduce((a, b) => a + b, 0))}</td>
                  <td>{pct(1 - (d2[0] ?? 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>Bedingungen</h3>
        <p className="muted small">Eine Bedingung ist erfüllt, wenn <b>eine</b> ihrer Varianten zutrifft; eine Variante verlangt <b>alle</b> ihre Anforderungen.</p>
        {deck.conditions.map((c) => (
          <div key={c.id} className="condition">
            <div className="row">
              <input value={c.name} onChange={(e) => setCond(c.id, { name: e.target.value })} aria-label="Name der Bedingung" />
              <button className="ghost small danger" onClick={() => set({ conditions: deck.conditions.filter((x) => x.id !== c.id) })}>Bedingung löschen</button>
            </div>
            {c.variants.map((v, vi) => (
              <div key={vi} className="variant">
                {vi > 0 && <div className="or">ODER</div>}
                {v.map((r, ri) => (
                  <RequirementRow
                    key={ri}
                    r={r}
                    deck={deck}
                    onChange={(nr) => setCond(c.id, { variants: c.variants.map((vv, i) => (i === vi ? vv.map((rr, j) => (j === ri ? nr : rr)) : vv)) })}
                    onRemove={() => setCond(c.id, { variants: c.variants.map((vv, i) => (i === vi ? vv.filter((_, j) => j !== ri) : vv)).filter((vv) => vv.length) })}
                  />
                ))}
                <button className="ghost small" onClick={() => setCond(c.id, { variants: c.variants.map((vv, i) => (i === vi ? [...vv, { kind: 'category', ref: deck.categories[0]?.id ?? '', min: 1 }] : vv)) })}>+ UND</button>
              </div>
            ))}
            <button className="ghost small" onClick={() => setCond(c.id, { variants: [...c.variants, [{ kind: 'category', ref: deck.categories[0]?.id ?? '', min: 1 }]] })}>+ ODER-Variante</button>
          </div>
        ))}
        <button onClick={addCond}>+ Bedingung</button>
      </section>

      <section className="panel">
        <div className="row between">
          <h3>Kategorien &amp; Karten</h3>
          <div className="row">
            {deck.categories.some((c) => c.id === 'handtrap') && <button className="ghost small" onClick={autoHandtraps}>Handtraps erkennen</button>}
            <button className="small" onClick={addCategory}>+ Kategorie</button>
          </div>
        </div>
        <div className="row wrap">
          {deck.categories.map((c) => (
            <span key={c.id} className="chip" style={{ borderColor: c.color }}>
              <span className="dot" style={{ background: c.color }} /> {c.name} ({catSize(c.id)})
              <button className="chip-x" onClick={() => removeCategory(c.id)} aria-label={`${c.name} entfernen`}>✕</button>
            </span>
          ))}
        </div>
        <table className="cat-table">
          <tbody>
            {counts.map(([id, n]) => (
              <tr key={id}>
                <td><CardView id={id} size="xs" /></td>
                <td className="name">{db.get(id)?.name}<div className="muted small">{n}×</div></td>
                <td>
                  <div className="row wrap">
                    {deck.categories.map((c) => {
                      const on = catsOf(id).includes(c.id);
                      return (
                        <button key={c.id} className={`toggle ${on ? 'on' : ''}`} style={on ? { background: c.color, borderColor: c.color } : { borderColor: c.color }} onClick={() => toggleCat(id, c.id)}>
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td><button className="ghost small" onClick={() => setRatioCard(id)} title="Kopienzahl vergleichen">Ratio</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>Ratio-Vergleich</h3>
        {ratio && ratioCard != null ? (
          <>
            <div className="row"><CardView id={ratioCard} size="xs" /> <b>{db.get(ratioCard)?.name}</b></div>
            <table className="results-table">
              <thead><tr><th>Kopien</th><th>Deckgröße</th><th>Mind. eine Bedingung (Erster)</th><th>(Zweiter)</th></tr></thead>
              <tbody>
                {ratio.map((r) => (
                  <tr key={r.n} className={deck.main.filter((x) => x === ratioCard).length === r.n ? 'current' : ''}>
                    <td>{r.n}</td><td>{r.size}</td><td><Bar p={r.first} /></td><td><Bar p={r.second} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Die Deckgröße ändert sich mit der Kopienzahl; die übrigen Karten bleiben gleich.</p>
          </>
        ) : (
          <p className="muted">Wähle bei einer Karte „Ratio“, um 0–3 Kopien zu vergleichen.</p>
        )}

        <h3>Testhand</h3>
        <div className="row">
          <button onClick={() => draw(5)}>5 Karten ziehen</button>
          <button className="ghost" onClick={() => draw(6)}>6 Karten ziehen</button>
        </div>
        {testHand && hc && (
          <>
            <div className="hand">{testHand.map((id, i) => <CardView key={i} id={id} size="md" />)}</div>
            <ul className="checklist">
              {deck.conditions.map((c) => (
                <li key={c.id} className={conditionMet(c, hc) ? 'yes' : 'no'}>{conditionMet(c, hc) ? '✓' : '✗'} {c.name}</li>
              ))}
            </ul>
            <p className="muted small">{testSize} Karten gezogen.</p>
          </>
        )}
      </section>
    </div>
  );
}

function Bar({ p }: { p: number }) {
  return (
    <div className="bar" title={pct(p, 2)}>
      <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%` }} />
      <span>{pct(p)}</span>
    </div>
  );
}

function RequirementRow({ r, deck, onChange, onRemove }: { r: Requirement; deck: Deck; onChange: (r: Requirement) => void; onRemove: () => void }) {
  const { db } = useStore();
  const distinct = [...new Set(deck.main)].sort((a, b) => (db.get(a)?.name ?? '').localeCompare(db.get(b)?.name ?? ''));
  const value = `${r.kind}:${r.ref}`;
  return (
    <div className="row req">
      <select
        value={value}
        onChange={(e) => { const [kind, ...rest] = e.target.value.split(':'); onChange({ ...r, kind: kind as Requirement['kind'], ref: rest.join(':') }); }}
        aria-label="Kategorie oder Karte"
      >
        <optgroup label="Kategorien">
          {deck.categories.map((c) => <option key={c.id} value={`category:${c.id}`}>{c.name}</option>)}
        </optgroup>
        <optgroup label="Einzelkarten">
          {distinct.map((id) => <option key={id} value={`card:${id}`}>{db.get(id)?.name}</option>)}
        </optgroup>
      </select>
      <label className="small">mind. <input type="number" min={0} max={6} value={r.min} onChange={(e) => onChange({ ...r, min: Math.max(0, Number(e.target.value)) })} /></label>
      <label className="small">max. <input type="number" min={0} max={6} value={r.max ?? ''} placeholder="–" onChange={(e) => onChange({ ...r, max: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} /></label>
      <button className="ghost small" onClick={onRemove} aria-label="Anforderung entfernen">✕</button>
    </div>
  );
}
