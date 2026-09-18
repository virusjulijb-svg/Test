# Yu-Gi-Oh Deckbuilder

Android-App (Kotlin, Jetpack Compose) zum Erstellen und Verwalten von Yu-Gi-Oh!-Decks.

## Funktionen

- Kartensuche über die öffentliche [YGOPRODeck-API](https://ygoprodeck.com/api-guide/), lokal in einer Room-Datenbank zwischengespeichert
- Kartendetailansicht (Bild, Text, ATK/DEF, Attribut, Typ, Banlist-Status)
- Mehrere Decks anlegen, umbenennen, löschen und ein aktives Deck auswählen
- Deckeditor mit Haupt-, Extra- und Side-Deck; Karten hinzufügen/entfernen und zwischen Zonen verschieben
- Automatische Deckvalidierung nach den offiziellen Regeln:
  - Hauptdeck 40–60 Karten
  - Extra Deck und Side Deck je maximal 15 Karten
  - Maximal 3 Kopien pro Karte (bzw. weniger, falls die Karte laut Banlist limitiert/verboten ist)

## Architektur

- **UI**: Jetpack Compose, Navigation-Compose, MVVM
- **Daten**: Retrofit + Gson (Netzwerk), Room (lokaler Cache & Deckspeicher), DataStore Preferences (aktives Deck)
- Kein Dependency-Injection-Framework – ein einfacher manueller `AppContainer` (`di/AppContainer.kt`) reicht für den Projektumfang aus

## Projekt öffnen

1. Projekt in Android Studio (Hedgehog oder neuer) öffnen
2. Gradle-Sync abwarten (lädt AGP 8.2.2, Kotlin 1.9.22, Compose BOM 2024.02.00 etc. von Google/Maven Central)
3. App auf einem Gerät/Emulator mit Android 7.0 (API 24) oder neuer starten

## Hinweis zu diesem Repository

Diese Umgebung hat keinen Zugriff auf das Android SDK und keine Internetverbindung zu Googles Maven-Repository (`dl.google.com` ist per Netzwerkrichtlinie blockiert). Der Code wurde daher sorgfältig von Hand geschrieben und geprüft, konnte hier aber **nicht** mit `./gradlew assembleDebug` gebaut oder in einem Emulator getestet werden. Bitte beim ersten Öffnen in Android Studio auf Compiler-/Sync-Fehler prüfen.
