# Vokabeln

Eine PWA zum Sammeln, Üben und Nachschlagen von Vokabeln. Läuft vollständig offline,
alle Daten bleiben lokal auf dem Gerät — kein Konto, kein Server, keine Übertragung.

## Funktionen

- **Hefte** — beliebig viele Vokabelhefte, je mit eigener Sprache links und rechts
- **Vokabeln** — Wort, Übersetzung, optional ein Kommentar und ein Bild
- **Wörterbuch** — 593 Wörter in Deutsch, Englisch, Spanisch und Französisch.
  Erscheint beim Eintippen als Vorschlag und ist unter *Nachschlagen* durchsuchbar
- **Üben** — Tippen und Multiple Choice, in beide Richtungen oder gemischt
- **Kluges Wiederholen** — fünf Leitner-Fächer: richtig beantwortete Vokabeln kommen
  seltener dran (1 → 3 → 7 → 21 Tage), ein Fehler wirft zurück auf Fach 1
- **Sonderzeichen-Leiste** — á é í ó ú ñ ¿ ¡ ç à è ê … passend zur Sprache des Felds
- **Aussprache** — liest Wörter mit den Systemstimmen des Geräts vor, ebenfalls offline
- **Liste einfügen** — mehrere Vokabeln auf einmal, eine pro Zeile
- **Suche** und Markierung einzelner Vokabeln als *schwierig*
- **Sicherung** als JSON-Datei exportieren und wieder einlesen, Bilder inklusive

### Wie die Antwortprüfung urteilt

| Eingabe | Erwartet | Ergebnis |
|---|---|---|
| `la casa` | la casa | richtig |
| `casa` | la casa | richtig — Artikel ist optional |
| `el cafe` | el café | richtig, mit Hinweis auf die Schreibweise |
| `strasse` | die Straße | richtig — ß und ss gelten als gleich |
| `el librox` | el libro | „fast" — zählt als Fehler, aber freundlich formuliert |
| `Gebäude` | das Haus, das Gebäude | richtig — Alternativen nach Komma gelten |

## Auf GitHub Pages veröffentlichen

Safari installiert eine PWA nur über HTTPS — GitHub Pages liefert das kostenlos mit.

1. Auf [github.com/new](https://github.com/new) ein Repository `vokabeln` anlegen, **Public**.

2. In diesem Ordner:

```bash
git init && git add . && git commit -m "Vokabel-App" && git branch -M main
```

3. Remote eintragen und hochladen:

```bash
git remote add origin https://github.com/SoulP3aking/vokabeln.git && git push -u origin main
```

4. Unter **Settings → Pages** als Source `Deploy from a branch`, Branch `main`,
   Ordner `/ (root)` wählen. Nach ein bis zwei Minuten liegt die App unter
   `https://SoulP3aking.github.io/vokabeln/`.

## Aufs iPhone holen

1. Die Adresse **in Safari** öffnen (nur Safari kann PWAs installieren).
2. Teilen-Symbol antippen → **Zum Home-Bildschirm**.
3. Einmal mit Internet starten, danach läuft sie offline.

Immer über das Icon auf dem Home-Bildschirm öffnen — die installierte App und der
Safari-Tab haben getrennte Speicher.

## Lokal ansehen

```bash
python -m http.server 8124
```

## Änderungen veröffentlichen

Nach jeder Änderung an HTML, CSS oder JS die Zeile `const VERSION = 'v1'` in
[`sw.js`](sw.js) hochzählen. Sonst liefert der Service Worker auf bereits
installierten Geräten weiter die alten Dateien aus.

```bash
git add . && git commit -m "Änderung" && git push
```

## Datensicherung

Texte liegen im `localStorage`, Bilder in IndexedDB. iOS kann diesen Speicher löschen,
wenn eine Web-App über längere Zeit gar nicht geöffnet wird. Deshalb gelegentlich unter
**Einstellungen → Datensicherung → Exportieren** eine Kopie in die Dateien-App legen.
Ein Import ersetzt den kompletten Bestand.

## Aufbau

```
index.html              Grundgerüst aller Ansichten
css/style.css           Gestaltung (Glas-Optik, Beige/Grün wie der Stundenplan)
js/dict.js              Wörterbuch (593 Einträge) und die Nachschlage-Logik
js/store.js             Hefte und Vokabeln in localStorage, Bilder in IndexedDB
js/ui.js                Sheet, Hinweise, Bildverkleinerung, Aussprache, Sonderzeichen
js/train.js             Übungsrunden, Leitner-Fächer, Antwortprüfung
js/app.js               Ansichten, Formulare, Ereignisse
sw.js                   Service Worker für den Offline-Betrieb
manifest.webmanifest    App-Name, Farben, Icons
icons/                  App-Icons
tools/make_icons.py     erzeugt die Icons neu (nur bei Design-Änderung nötig)
```

## Wörterbuch erweitern

In [`js/dict.js`](js/dict.js) steht eine Liste im Format
`["Deutsch", "English", "Español", "Français"]`. Neue Zeilen einfach ergänzen —
Nomen mit Artikel, weil das Geschlecht mitgelernt werden soll. Die Suche schneidet
Artikel und Akzente beim Vergleich automatisch weg.
