import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadCards } from './lib/api';
import { CardDb } from './lib/carddb';
import { newDeck } from './lib/deck';
import { loadState, saveState, type Persisted, type Settings } from './lib/storage';
import type { Combo, Deck } from './lib/types';
import { StoreContext, type Store } from './store';
import DeckBuilder from './pages/DeckBuilder';
import ConsistencyLab from './pages/ConsistencyLab';
import ComboLab from './pages/ComboLab';
import DuelBot from './pages/DuelBot';

const TABS = [
  { id: 'deck', label: 'Deckbuilder', short: 'Deck', icon: '▦' },
  { id: 'consistency', label: 'Consistency Lab', short: 'Konsistenz', icon: '％' },
  { id: 'combo', label: 'Combo Lab', short: 'Combos', icon: '⑂' },
  { id: 'duel', label: 'Duell-Bot', short: 'Duell', icon: '⚔' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const tabFromHash = (): Tab => {
  const h = location.hash.replace('#', '');
  return (TABS.find((t) => t.id === h)?.id ?? 'deck') as Tab;
};

export default function App() {
  const [db, setDb] = useState<CardDb | null>(null);
  const [dbInfo, setDbInfo] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState('Lade Kartendatenbank …');
  const [state, setState] = useState<Persisted>(loadState);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const load = useCallback((force = false) => {
    setLoadError(null);
    loadCards({ force, onStatus: setStatus })
      .then((r) => {
        setDb(new CardDb(r.cards));
        setDbInfo(`${r.cards.length.toLocaleString('de-DE')} Karten · DB-Version ${r.version}${r.source === 'cache-offline' ? ' · offline (Cache)' : ''}`);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => load(), [load]);
  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    const h = () => setTab(tabFromHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Beim ersten Start ein leeres Deck anlegen
  useEffect(() => {
    if (state.decks.length === 0) {
      const d = newDeck('Mein Deck');
      setState((s) => ({ ...s, decks: [d], settings: { ...s.settings, activeDeckId: d.id } }));
    }
  }, [state.decks.length]);

  const store = useMemo<Store | null>(() => {
    if (!db) return null;
    const activeDeck = state.decks.find((d) => d.id === state.settings.activeDeckId) ?? state.decks[0];
    return {
      db,
      state,
      activeDeck,
      saveDeck: (d: Deck) =>
        setState((s) => ({
          ...s,
          decks: s.decks.some((x) => x.id === d.id) ? s.decks.map((x) => (x.id === d.id ? d : x)) : [...s.decks, d],
        })),
      deleteDeck: (id: string) =>
        setState((s) => {
          const decks = s.decks.filter((d) => d.id !== id);
          return {
            ...s,
            decks,
            combos: s.combos.filter((c) => c.deckId !== id),
            settings: {
              ...s.settings,
              activeDeckId: s.settings.activeDeckId === id ? decks[0]?.id : s.settings.activeDeckId,
              opponentDeckId: s.settings.opponentDeckId === id ? undefined : s.settings.opponentDeckId,
            },
          };
        }),
      saveCombo: (c: Combo) =>
        setState((s) => ({
          ...s,
          combos: s.combos.some((x) => x.id === c.id) ? s.combos.map((x) => (x.id === c.id ? c : x)) : [...s.combos, c],
        })),
      deleteCombo: (id: string) => setState((s) => ({ ...s, combos: s.combos.filter((c) => c.id !== id) })),
      setSettings: (p: Partial<Settings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...p } })),
      toast: setToastMsg,
    };
  }, [db, state]);

  if (!store) {
    return (
      <div className="splash">
        <h1>YGO Lab</h1>
        {loadError ? (
          <>
            <p className="error">Die Kartendatenbank konnte nicht geladen werden: {loadError}</p>
            <p className="muted">
              Die Daten kommen von der öffentlichen YGOPRODeck-API. Prüfe die Internetverbindung oder ob ein Werbeblocker
              db.ygoprodeck.com blockiert.
            </p>
            <button onClick={() => load(true)}>Erneut versuchen</button>
          </>
        ) : (
          <p className="muted">{status}</p>
        )}
      </div>
    );
  }

  const go = (t: Tab) => { location.hash = t; setTab(t); window.scrollTo(0, 0); };

  return (
    <StoreContext.Provider value={store}>
      <header className="topbar">
        <div className="brand">YGO <span>Lab</span></div>
        <nav className="tabs" aria-label="Bereiche">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => go(t.id)} aria-label={t.label} aria-current={tab === t.id ? 'page' : undefined}>
              <span className="tab-icon" aria-hidden>{t.icon}</span>
              <span className="tab-label">{t.label}</span>
              <span className="tab-short" aria-hidden>{t.short}</span>
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <label className="deck-select">
            <span className="hide-mobile">Deck </span>
            <select aria-label="Aktives Deck" value={store.activeDeck?.id ?? ''} onChange={(e) => store.setSettings({ activeDeckId: e.target.value })}>
              {state.decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label>
            <span className="hide-mobile">Banlist </span>
            <select aria-label="Banlist" value={state.settings.format} onChange={(e) => store.setSettings({ format: e.target.value as Settings['format'] })}>
              <option value="tcg">TCG</option>
              <option value="ocg">OCG</option>
            </select>
          </label>
          <button className="ghost small" title="Datenbank neu laden" onClick={() => { setDb(null); load(true); }}>⟳</button>
        </div>
      </header>
      <main>
        {tab === 'deck' && <DeckBuilder />}
        {tab === 'consistency' && <ConsistencyLab />}
        {tab === 'combo' && <ComboLab />}
        {tab === 'duel' && <DuelBot />}
      </main>
      <footer className="footer muted">
        {dbInfo} · Kartendaten und Bilder: <a href="https://ygoprodeck.com/api-guide/" target="_blank" rel="noreferrer">YGOPRODeck API</a>.
        Inoffizielles Fanprojekt, nicht mit Konami verbunden.
      </footer>
      {toastMsg && <div className="toast" role="status" onClick={() => setToastMsg(null)}>{toastMsg}</div>}
    </StoreContext.Provider>
  );
}
