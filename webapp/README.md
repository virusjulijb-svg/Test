# YGO Lab – Webapp

Browser-App für Yu-Gi-Oh!-Spieler mit vier Bereichen:

| Bereich | Funktionen |
|---|---|
| **Deckbuilder** | Kartensuche (Name, Text, Art, Attribut, Typ, Stufe, Archetyp, Banlist), Main/Extra/Side Deck, Prüfung nach TCG- oder OCG-Banlist, mehrere Decks, Import/Export als `.ydk` und `ydke://` |
| **Consistency Lab** | Karten Kategorien zuordnen (Starter, Extender, Handtrap, Brick, eigene), Erfolgsbedingungen als ODER/UND-Kombinationen, **exakte** Wahrscheinlichkeiten für 5 bzw. 6 Karten (+ weitere Züge), Verteilung pro Kategorie, Ratio-Vergleich 0–3 Kopien, Testhände |
| **Combo Lab** | Combos Schritt für Schritt mit Kartenraster aufbauen, Effekt-Eigenschaften (Suche, Beschwörung aus Deck/Friedhof …) werden aus dem Kartentext vorgeschlagen, Alternativen („Wenn Ash Blossom …“) als Verzweigungen, Choke Points, Anzeige, welche Handtraps welchen Schritt treffen, Nibiru-Zähler, Droll-Warnung, JSON-Export |
| **Duell-Bot** | Du beginnst, der Bot hält 5 Karten aus einem Gegner-Deck (z. B. importiertes Meta-Deck oder Vorlage) und setzt Handtraps ein; danach spielt er Board-Breaker gegen dein Endboard. Combos aus dem Combo Lab lassen sich Schritt für Schritt abspielen, bei einer Unterbrechung wird automatisch die passende Alternative gewählt. Auswertung und Verlauf über mehrere Duelle |

## Handy und Tablet

Die App passt sich an kleine Bildschirme und Touch-Bedienung an:

- Navigation als Leiste am unteren Rand, kompakte Kopfzeile, Rücksicht auf Notch und Home-Indikator
- Deckbuilder mit Umschalter *Decks / Deck / Suche*; Suchfilter einklappbar
- Antippen einer Karte öffnet ein Blatt mit Kartentext und Plus/Minus für Main/Extra und Side Deck
  (am Desktop gilt weiter: Klick fügt hinzu bzw. entfernt, Rechtsklick legt ins Side Deck)
- Dialoge erscheinen als Blatt vom unteren Rand, Tippflächen sind mindestens 40 px hoch,
  Eingabefelder nutzen 16 px Schrift (kein automatisches Zoomen in iOS)
- Duell: kompaktes Spielfeld, Handkarten als seitlich wischbare Reihe, letzte Aktion direkt auf dem
  Spielfeld, Protokoll einklappbar, Auswertung wird nach dem Zug automatisch angezeigt
- **Installierbar** („Zum Home-Bildschirm“ in Safari bzw. „App installieren“ in Chrome): startet im
  Vollbild; App-Dateien werden per Service Worker zwischengespeichert, die Kartendatenbank liegt in
  IndexedDB. Ohne Netz startet die App daher mit den zuletzt geladenen Daten; Kartenbilder brauchen
  weiterhin eine Verbindung, sofern der Browser sie nicht im Cache hat.

Zum Testen auf dem eigenen Handy im selben WLAN: `npm run build && npx vite preview --host` und die
angezeigte Netzwerk-Adresse öffnen. Der Service Worker (Offline-Start, Installation) funktioniert
außerhalb von `localhost` nur über HTTPS, z. B. nach dem Hochladen des `dist/`-Ordners auf GitHub Pages.

## Starten

Node.js 20 oder neuer:

```bash
cd webapp
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm run build      # statischer Build in dist/ (läuft auch aus einem Unterordner, z. B. GitHub Pages)
npm test           # Unit-Tests (Wahrscheinlichkeiten, Import/Export, Effekterkennung, Duell-Engine, Combo-Baum)
npm run e2e        # Browser-Tests mit Playwright (nach npm run build): Desktop und Handy/Tablet mit Touch
npm run icons      # App-Icons (PNG) aus public/icon.svg neu erzeugen
```

Beim ersten Öffnen lädt die App die komplette Kartenliste einmalig von der
[YGOPRODeck-API](https://ygoprodeck.com/api-guide/) und speichert sie in IndexedDB. Danach wird
höchstens alle 12 Stunden die Datenbankversion geprüft. Decks, Combos und Einstellungen liegen im
`localStorage` des Browsers.

### Kartenbilder

Standardmäßig werden die Bilder von `images.ygoprodeck.com` geladen. YGOPRODeck bittet darum, Bilder
nicht dauerhaft direkt zu verlinken. Für eine öffentlich gehostete Version die Bilder spiegeln:

```bash
npm run mirror-images                 # alle Karten (lange Laufzeit, 10 Anfragen/s)
npm run mirror-images -- mein.ydk     # nur die Karten eines Decks
VITE_IMAGE_BASE=./images npm run build
```

Fehlt ein Bild, zeigt die App eine Textkarte in der Farbe des Kartenrahmens.

## Duell-Bot: was simuliert wird

Der Bot ist keine vollständige Regel-Engine. Du führst deine Aktionen selbst aus (Beschwören,
Aktivieren, Karten bewegen); die Engine entscheidet, ob und womit der Bot reagieren darf.

- **Dein Zug:** Ash Blossom, Maxx "C", Effect Veiler, Infinite Impermanence, Ghost Ogre, Ghost Belle,
  PSY-Framegear Gamma, D.D. Crow, Droll & Lock Bird, Nibiru und Dimension Shifter.
- **Zug des Bots:** Harpie's Feather Duster, Lightning Storm, Raigeki, Dark Ruler No More, Forbidden
  Droplet, Evenly Matched.
- **Antworten:** Auf jede Aktion des Bots kannst du mit einer Karte aus Hand oder Feld antworten.
  Called by the Grave und Crossout Designator sperren zusätzlich den Namen für den Rest des Zuges.
- **Schwierigkeit:** *Leicht* reagiert zufällig, *Normal* bevorzugt Starter/Extender und Suchen,
  *Schwer* wartet auf markierte Choke Points und wertvolle Aktionen.
- Karten im Gegner-Deck werden per Namen erkannt. Neuere Handtraps oder ähnliche Karten lassen sich im
  Setup über „verhält sich wie …“ einer bekannten Unterbrechung zuordnen.
- Welche Eigenschaften eine Aktivierung hat (Suche aus dem Deck usw.), schlägt die App aus dem
  englischen Kartentext vor. Die Erkennung ist eine Heuristik; die Häkchen lassen sich vor jeder
  Aktivierung anpassen.
- Nicht simuliert: Kampfphase, LP, Kettenaufbau des Spielers, Spezialfälle der Rulings (z. B. Kosten
  vs. Effekt bei Ghost Belle, der Bedarf von PSY-Frame Driver bei Gamma). Der Bot geht immer als
  Zweiter.

## Projektstruktur

```
src/lib/        Logik ohne UI: API/Cache, Deckregeln, Wahrscheinlichkeit, Effekterkennung,
                Unterbrechungen, Duell-Engine, Combo-Baum
src/pages/      Deckbuilder, ConsistencyLab, ComboLab, DuelBot
src/components/ Kartenanzeige, Modal
tests/          Vitest-Unit-Tests (nutzen e2e/fixtures/cardinfo.json)
e2e/            Playwright-Tests (smoke.mjs Desktop, mobile.mjs Handy/Tablet); die API wird dort mit
                einem kleinen Testdatensatz simuliert
public/         Manifest, Icons und Service Worker für die Installation als App
```

Die Texte im Testdatensatz `e2e/fixtures/cardinfo.json` sind gekürzt und nur für Tests gedacht;
„Test Starter“ und „Test Extender“ sind erfundene Karten.

Inoffizielles Fanprojekt, nicht mit Konami verbunden.
