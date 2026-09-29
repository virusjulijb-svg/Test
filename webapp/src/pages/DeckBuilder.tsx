import { useMemo, useRef, useState } from 'react';
import { CardDetail, CardView } from '../components/CardView';
import { Modal } from '../components/Modal';
import type { SearchFilter } from '../lib/carddb';
import {
  addCard, newDeck, normalizeImport, parseYdk, parseYdke, removeCard, sortIds, toYdk, toYdke, validateDeck, zoneName,
} from '../lib/deck';
import type { Deck, DeckZone } from '../lib/types';
import { uid } from '../lib/util';
import { useStore } from '../store';

const ATTRIBUTES = ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'];
const PAGE = 60;

export default function DeckBuilder() {
  const { db, state, activeDeck, saveDeck, deleteDeck, setSettings, toast } = useStore();
  const [filter, setFilter] = useState<SearchFilter>({ text: '', kind: '' });
  const [page, setPage] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const format = state.settings.format;

  const races = useMemo(() => [...new Set(db.cards.filter((c) => c.type.includes('Monster')).map((c) => c.race))].sort(), [db]);
  const archetypes = useMemo(() => db.archetypes(), [db]);
  const results = useMemo(() => db.search({ ...filter, format }), [db, filter, format]);
  const shown = results.slice(page * PAGE, (page + 1) * PAGE);

  if (!activeDeck) return null;
  const deck = activeDeck;
  const errors = validateDeck(deck, db, format);

  const update = (f: Partial<SearchFilter>) => { setFilter((x) => ({ ...x, ...f })); setPage(0); };
  const add = (id: number, zone: 'auto' | 'side' = 'auto') => {
    const r = addCard(deck, id, db, format, zone);
    if (typeof r === 'string') toast(r);
    else saveDeck(r);
  };
  const remove = (id: number, zone: DeckZone) => saveDeck(removeCard(deck, id, zone));

  const create = () => {
    const d = newDeck(`Deck ${state.decks.length + 1}`);
    saveDeck(d);
    setSettings({ activeDeckId: d.id });
  };
  const duplicate = () => {
    const d: Deck = { ...structuredClone(deck), id: uid(), name: `${deck.name} (Kopie)`, updatedAt: Date.now() };
    saveDeck(d);
    setSettings({ activeDeckId: d.id });
  };
  const rename = () => {
    const n = prompt('Neuer Name', deck.name);
    if (n?.trim()) saveDeck({ ...deck, name: n.trim() });
  };
  const del = () => {
    if (confirm(`„${deck.name}“ und die zugehörigen Combos löschen?`)) deleteDeck(deck.id);
  };
  const download = () => {
    const blob = new Blob([toYdk(deck)], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${deck.name.replace(/[^\w-]+/g, '_')}.ydk`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copyYdke = async () => {
    try {
      await navigator.clipboard.writeText(toYdke(deck));
      toast('ydke://-Link kopiert.');
    } catch {
      prompt('ydke://-Link', toYdke(deck));
    }
  };

  const zone = (z: DeckZone) => (
    <section className="deck-zone" key={z}>
      <h3>{zoneName(z)} <span className="muted">({deck[z].length})</span></h3>
      <div className="card-grid">
        {sortIds(deck[z], db).map((id, i) => (
          <CardView
            key={`${id}-${i}`}
            id={id}
            onClick={() => remove(id, z)}
            onContextMenu={(e) => { e.preventDefault(); if (z !== 'side') { remove(id, z); add(id, 'side'); } }}
            title={`${db.get(id)?.name} – Klick: entfernen${z !== 'side' ? ', Rechtsklick: ins Side Deck' : ''}`}
            className="hoverable"
            onMouseEnter={() => setHover(id)}
          />
        ))}
        {deck[z].length === 0 && <div className="muted empty-zone">leer</div>}
      </div>
    </section>
  );

  return (
    <div className="builder">
      <aside className="panel">
        <div className="row wrap">
          <button onClick={create}>Neues Deck</button>
          <button onClick={() => setImportOpen(true)}>Importieren</button>
        </div>
        <ul className="deck-list">
          {state.decks.map((d) => (
            <li key={d.id} className={d.id === deck.id ? 'active' : ''} onClick={() => setSettings({ activeDeckId: d.id })}>
              <span>{d.name}</span>
              <span className="muted small">{d.main.length}/{d.extra.length}/{d.side.length}</span>
            </li>
          ))}
        </ul>
        <div className="row wrap">
          <button className="ghost small" onClick={rename}>Umbenennen</button>
          <button className="ghost small" onClick={duplicate}>Duplizieren</button>
          <button className="ghost small danger" onClick={del}>Löschen</button>
        </div>
        <div className="row wrap">
          <button className="ghost small" onClick={download}>.ydk speichern</button>
          <button className="ghost small" onClick={copyYdke}>ydke:// kopieren</button>
        </div>
        <CardDetail id={hover} />
      </aside>

      <section className="panel deck-view">
        <h2>{deck.name}</h2>
        {errors.length > 0 ? (
          <ul className="errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        ) : (
          <div className="ok">Deck ist regelkonform ({format.toUpperCase()}-Banlist).</div>
        )}
        {(['main', 'extra', 'side'] as DeckZone[]).map(zone)}
        <p className="muted small">Klick auf eine Karte entfernt sie, Rechtsklick verschiebt sie ins Side Deck.</p>
      </section>

      <section className="panel search">
        <input
          type="search"
          placeholder="Kartenname suchen …"
          value={filter.text}
          onChange={(e) => update({ text: e.target.value })}
          aria-label="Kartensuche"
        />
        <div className="filters">
          <label className="check"><input type="checkbox" checked={!!filter.inDesc} onChange={(e) => update({ inDesc: e.target.checked })} /> auch Kartentext</label>
          <select value={filter.kind} onChange={(e) => update({ kind: e.target.value as SearchFilter['kind'] })} aria-label="Kartenart">
            <option value="">Alle Arten</option>
            <option value="monster">Monster (Main)</option>
            <option value="extra">Extra Deck</option>
            <option value="spell">Zauber</option>
            <option value="trap">Fallen</option>
          </select>
          <select value={filter.attribute ?? ''} onChange={(e) => update({ attribute: e.target.value || undefined })} aria-label="Attribut">
            <option value="">Attribut</option>
            {ATTRIBUTES.map((a) => <option key={a}>{a}</option>)}
          </select>
          <select value={filter.race ?? ''} onChange={(e) => update({ race: e.target.value || undefined })} aria-label="Typ">
            <option value="">Typ</option>
            {races.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select value={filter.level ?? ''} onChange={(e) => update({ level: e.target.value ? Number(e.target.value) : undefined })} aria-label="Stufe">
            <option value="">Stufe/Rang/Link</option>
            {Array.from({ length: 13 }, (_, i) => i + 1).map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={filter.archetype ?? ''} onChange={(e) => update({ archetype: e.target.value || undefined })} aria-label="Archetyp">
            <option value="">Archetyp</option>
            {archetypes.map((a) => <option key={a}>{a}</option>)}
          </select>
          <select value={filter.banlist ?? ''} onChange={(e) => update({ banlist: e.target.value as SearchFilter['banlist'] })} aria-label="Banlist">
            <option value="">Banlist: alle</option>
            <option value="legal">nicht verboten</option>
            <option value="Forbidden">verboten</option>
            <option value="Limited">limitiert</option>
            <option value="Semi-Limited">semi-limitiert</option>
          </select>
        </div>
        <div className="muted small">{results.length.toLocaleString('de-DE')} Treffer · Klick: hinzufügen, Rechtsklick: ins Side Deck</div>
        <div className="card-grid results">
          {shown.map((c) => (
            <CardView
              key={c.id}
              id={c.id}
              onClick={() => add(c.id)}
              onContextMenu={(e) => { e.preventDefault(); add(c.id, 'side'); }}
              className="hoverable"
              onMouseEnter={() => setHover(c.id)}
            />
          ))}
        </div>
        {results.length > PAGE && (
          <div className="row pager">
            <button className="ghost small" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ zurück</button>
            <span className="muted small">Seite {page + 1} / {Math.ceil(results.length / PAGE)}</span>
            <button className="ghost small" disabled={(page + 1) * PAGE >= results.length} onClick={() => setPage(page + 1)}>weiter ›</button>
          </div>
        )}
      </section>

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const { db, saveDeck, setSettings, toast } = useStore();
  const [name, setName] = useState('Importiertes Deck');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (raw: string, deckName: string) => {
    try {
      const parsed = raw.trim().startsWith('ydke://') ? parseYdke(raw) : parseYdk(raw);
      const n = normalizeImport(parsed, db);
      if (!n.main.length && !n.extra.length) throw new Error('Keine Karten erkannt. Erwartet wird eine .ydk-Datei oder ein ydke://-Link.');
      const d = { ...newDeck(deckName), main: n.main, extra: n.extra, side: n.side };
      saveDeck(d);
      setSettings({ activeDeckId: d.id });
      toast(`${deckName} importiert${n.unknown.length ? ` (${n.unknown.length} unbekannte Karten übersprungen)` : ''}.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal title="Deck importieren" onClose={onClose}>
      <label className="field">Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field">
        ydke://-Link oder Inhalt einer .ydk-Datei
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'ydke://…  oder\n#main\n14558127\n…'} />
      </label>
      <div className="row">
        <button onClick={() => run(text, name)} disabled={!text.trim()}>Importieren</button>
        <button className="ghost" onClick={() => fileRef.current?.click()}>.ydk-Datei wählen …</button>
        <input
          ref={fileRef}
          type="file"
          accept=".ydk,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) run(await f.text(), f.name.replace(/\.ydk$/i, ''));
          }}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted small">
        Decklisten aus Turnierberichten lassen sich z. B. auf YGOPRODeck, DuelingBook oder in EDOPro als .ydk bzw. ydke:// exportieren.
      </p>
    </Modal>
  );
}
