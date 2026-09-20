# Football Playbook Creator

Desktop-Programm (Python + PySide6) zum Erstellen von Football-Playbooks: Formationen aufstellen, Plays mit Routen und Blockzuweisungen einzeichnen und das fertige Playbook als PDF exportieren.

## Funktionen

- Spielfeld-Editor: Spieler per Klick platzieren (Offense als Kreis, Defense als Kreuz), frei verschiebbar
- Vordefinierte Offense-Formationen (I-Formation, Shotgun Spread, Singleback Trips Right, Pistol, Empty) und Defense-Grundstellungen (4-3 Base, 3-4 Base) per Klick einfügen
- Pass-Routen, Blocklinien (mit T-Symbol am Ende) und Motion-Linien (gestrichelt) zeichnen
- Freie Textlabels auf dem Feld (z.B. Spielaufruf, Hinweise)
- Mehrere Plays in einem Playbook verwalten (anlegen, duplizieren, löschen, umsortieren)
- Play-Details: Name, Formation, Spielkonzept, Notizen
- Playbook als JSON speichern/laden
- Komplettes Playbook als PDF exportieren (Deckblatt + eine Seite pro Play)

## Installation

```bash
cd football-playbook
pip install -r requirements.txt
```

Benötigt Python 3.10+.

## Start

```bash
python main.py
```

## Bedienung

1. Über die Werkzeugleiste eine Offense- und/oder Defense-Formation aus der Dropdown-Liste auswählen und mit "Einfügen" auf das Feld setzen.
2. Mit "+ Offense" / "+ Defense" einzelne Spieler manuell hinzufügen (Position auf dem Feld anklicken, Kürzel eingeben).
3. Mit "Route zeichnen" / "Block zeichnen" / "Motion zeichnen" den jeweiligen Linientyp aktivieren: Klicks setzen Wegpunkte, ein Doppelklick oder Rechtsklick schließt die Linie ab.
4. Im rechten Bereich ("Play-Details") Name, Formation, Spielkonzept und Notizen zur aktuellen Play eintragen.
5. Über die linke Seitenleiste ("Plays") weitere Plays anlegen, duplizieren, löschen oder umsortieren.
6. Über **Datei → Speichern** das Playbook als JSON-Datei sichern, über **Datei → Als PDF exportieren…** das komplette Playbook als PDF ausgeben.

Ausgewählte Elemente lassen sich mit `Entf`/`Rückschritt` löschen, ein laufender Linienzug mit `Esc` abbrechen. Ein Doppelklick im Auswahl-Modus auf einen Spieler bzw. ein Textlabel öffnet die Umbenennen-Bearbeitung.

## Als Windows-.exe installieren

Die App ist reines Python und läuft nicht "nativ" als .exe – mit [PyInstaller](https://pyinstaller.org) lässt sich daraus aber eine eigenständige Windows-.exe bauen.

**Automatisch per GitHub Actions (empfohlen):**

Im Repository liegt der Workflow `.github/workflows/build-football-playbook-exe.yml`. Er baut die .exe auf einem echten Windows-Runner:

1. Im GitHub-Repo auf **Actions → Football Playbook Creator - Windows EXE → Run workflow** klicken (oder er läuft automatisch bei einem Push auf `main`, der Dateien unter `football-playbook/` ändert).
2. Nach Abschluss im Run das Artifact **FootballPlaybookCreator-windows-exe** herunterladen – darin liegt `FootballPlaybookCreator.exe`.

**Manuell auf einem Windows-Rechner:**

```powershell
cd football-playbook
pip install -r requirements.txt
pip install pyinstaller
pyinstaller --noconfirm --onefile --windowed --name FootballPlaybookCreator main.py
```

Die fertige `.exe` liegt danach in `dist\FootballPlaybookCreator.exe` und lässt sich ohne installiertes Python weitergeben/starten.

## Projektstruktur

```
football-playbook/
  main.py                          Einstiegspunkt
  requirements.txt
  src/football_playbook/
    models.py                      Datenmodelle (Play, Playbook, Player, Route, TextLabel) + JSON-Serialisierung
    formations.py                  Formations-Presets (Offense/Defense)
    items.py                       Zeichenbare Elemente (Spieler-Symbol, Routen/Blocklinie)
    field_scene.py                 Spielfeld-Zeichenfläche inkl. Werkzeug-Modi
    main_window.py                 Hauptfenster (Menü, Toolbar, Play-Liste, Play-Details)
    pdf_export.py                  PDF-Export (rendert jede Play als Bild und baut das PDF via reportlab)
```

## Hinweis zu diesem Repository

Die App wurde in dieser (Linux-)Umgebung automatisiert getestet: einmal ohne Display (Qt "offscreen"-Plattform) und zusätzlich in einem echten, sichtbaren Fenster über einen virtuellen X-Server (Xvfb) inkl. Screenshots. Geprüft wurden Formationen einfügen, Routen/Blocks/Motion/Text zeichnen, Play-Wechsel, JSON-Speichern/Laden und PDF-Export. Eine manuelle Maus-/Tastatur-Bedienung durch einen Menschen fand dabei nicht statt.
