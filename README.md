# 2€-Sondermünzen-Check

Handy-App zum Nachkontrollieren, welche Euro-Sondermünzen man schon hat. Alle Münzen sind hinterlegt,
man hakt ab, was man besitzt – und sieht sofort, was noch fehlt.

- **Vier Münzarten** (Leiste unten): **2 €** Gedenkmünzen aller Euro-Länder, **5 €** Kupfermünzen und
  **25 €** Silber-Niob-Münzen der Münze Österreich sowie **Kursmünzensätze** (1 Cent bis 2 Euro) je Land und
  Motivserie, jede der acht Münzen einzeln abhakbar. Jede Münzart hat ihren eigenen Zähler.
- **Alle 2€-Sondermünzen** von 2004 bis heute (24 Länder, inkl. Andorra, Monaco, San Marino, Vatikan)
- **Motiv jeder Münze als Foto** (antippen = vergrößern), dazu der Ausgabemonat
- **Abhaken** mit einem Tipp, Fortschrittsanzeige gesamt und je Jahr/Land
- **Deutsche Münzen nach Prägestätte** (A Berlin, D München, F Stuttgart, G Karlsruhe, J Hamburg): je Münze
  fünf Schalter, dazu ein Knopf „alle“. Gezählt wird pro Prägestätte.
- **Suchen & filtern**: nach Land, Jahr, Motiv; „Fehlen“ / „Hab ich“; Gruppierung nach Jahr oder Land
- **Neue Münzen erscheinen automatisch** und werden mit **NEU** markiert
- **Funktioniert offline** und lässt sich wie eine normale App aufs Handy legen (Android & iPhone)
- **Sicherung** der Sammlung als Datei (und wieder einspielen)
- **Fehlende Münze selbst ergänzen**, falls etwas in der Liste fehlt

## Aussehen

Das Design folgt dem der eigenen Arbeits-Tools: dunkles Farbsystem mit Blau→Cyan-Akzent, Glas-Flächen, abgerundete Ecken,
feines Raster im Hintergrund. Alle Farben, Radien und Schatten stehen als Variablen am Anfang von
`app/style.css`. Es gibt nur diese eine dunkle Fassung.

## Aufs Handy bringen

Die App ist eine „PWA“: eine Webseite, die sich wie eine App installieren lässt. Kein App-Store nötig.

1. **Einmalig veröffentlichen:** Diesen Branch nach `main` mergen und auf GitHub unter
   *Settings → Pages → Build and deployment → Source* **„GitHub Actions“** wählen. Der Workflow
   „App veröffentlichen“ (`.github/workflows/pages.yml`) legt die App dann online. Die Adresse
   steht danach unter *Settings → Pages* (`https://<name>.github.io/2-Sonderm-nzen-Check/`).
   *(Pages in privaten Repos gibt es nur mit bezahltem GitHub-Tarif. Alternativ den Ordner `app/`
   bei Netlify Drop oder Cloudflare Pages hochladen.)*
2. **Auf dem Handy öffnen** und installieren:
   - **Android (Chrome):** Menü ⋮ → *App installieren* bzw. *Zum Startbildschirm hinzufügen*
   - **iPhone (Safari):** Teilen-Symbol → *Zum Home-Bildschirm*

Die Häkchen liegen nur auf dem jeweiligen Gerät. Mit *Menü → Sammlung sichern* lässt sich eine
Sicherungsdatei erzeugen (z. B. für ein neues Handy).

### Sofort-Variante: private Seite in der Claude-App

Ohne Veröffentlichung läuft die App auch als **privates Claude-Artifact** (nur für dich sichtbar, öffnet
sich in der Claude-App/auf claude.ai, auch am Handy). Dort gibt es keinen Service Worker und keine
Installation, dafür speichert die Seite Häkchen, eigene Münzen und „gesehen“ zusätzlich im **Claude-Konto**
(`db`-Funktion, privat pro Person), sodass sie auch nach dem Löschen von Browserdaten wieder da sind.

```bash
python3 tools/build-artifact.py            # baut build/artifact/ (index.html + img/l*.webp)
```

Das Skript packt die runden Münzbilder in Bildtafeln (die Artifact-Grenze liegt bei 511 Dateien) und
legt Münzliste und Tafel-Index in die Seite. Neue Münzen kommen dort an, indem die Seite mit der
aktualisierten `coins.json` neu veröffentlicht wird; die Häkchen bleiben dabei erhalten.

## Automatische Updates

Eine geplante Routine in Claude prüft zweimal im Monat, ob es neue 2-Euro-Gedenkmünzen gibt. Sie folgt
dabei `tools/update-anleitung.md`: Quellen abfragen, `coins.json` ergänzen, Münzbilder erzeugen,
`node tools/validate.mjs` ausführen und die Änderung nach `main` bringen. Sobald etwas auf `main` landet,
veröffentlicht der Workflow die neue Liste online; die App holt sie beim nächsten Öffnen und zeigt neue
Münzen mit **NEU**. Gibt es nichts Neues, passiert nichts.

## Neue Münzen eintragen

Die ganze Münzliste steht in **`app/data/coins.json`** – eine Münze pro Zeile:

```json
{"id": "DE-2026-hb", "c": "DE", "y": 2026, "t": "Bremen – Klimahaus Bremerhaven"},
{"id": "AT-2007-rom", "c": "AT", "y": 2007, "t": "50 Jahre Römische Verträge", "g": 1}
```

| Feld | Bedeutung |
|------|-----------|
| `id` | eindeutige Kennung `LAND-JAHR-kurzname` (nur a–z, 0–9, `-`). **Nie ändern**, sonst gehen die Häkchen dieser Münze verloren. |
| `c` | Ländercode (muss unter `countries` stehen) |
| `y` | Jahr |
| `t` | Titel/Motiv |
| `g` | `1` = Gemeinschaftsausgabe (mehrere Länder, gleiches Motiv) |
| `m` | Ausgabemonat (1–12), optional |
| `u` | `1` = Angaben noch nicht bestätigt (wird in der App als „ungeprüft“ angezeigt) |
| `i` | `1` = es gibt ein Münzbild (siehe unten) |
| `k` | Münzart: fehlt = 2 €, `1` = Kursmünzensatz (8 Münzen, ID mit `-satz`, `y` = erstes Jahr der Serie), `5` = 5-€-Kupfermünze, `25` = 25-€-Silber-Niob-Münze. Die ID enthält dann die Münzart, z. B. `AT-2012-5-musikverein`. `y` ist der Jahrgang auf der Münze; `m` nur, wenn das Ausgabejahr gleich dem Jahrgang ist (Neujahrsmünzen erscheinen im Dezember davor). |

**Prägestätten:** Bei einem Land mit Prägestätten steht unter `countries` zusätzlich `"mm"`, z. B. bei Deutschland
`"mm": {"A": "Berlin", "D": "München", ...}`. Dann gibt es *jede* Münze dieses Landes in allen genannten
Varianten – eine neue deutsche Münze braucht also nichts Besonderes. Die Häkchen werden je Prägestätte unter
`DE-2026-hb@A`, `DE-2026-hb@D` usw. gespeichert.

**Münzbilder:** Zu jeder Münze gehören zwei Dateien `app/img/t/<ID>.webp` (klein, Liste) und
`app/img/l/<ID>.webp` (groß, Vergrößerung). Ein neues Foto bereitet dieses Werkzeug vor und setzt dabei
auch `"i": 1`:

```bash
pip install pillow
python3 tools/make-image.py FOTO.jpg DE-2026-hb
```

Nach dem Eintragen zusätzlich `"updated"` (Datum) oben in der Datei anpassen und `node tools/validate.mjs`
ausführen – das Skript prüft Format, doppelte IDs und Auffälligkeiten. Sobald die Änderung auf `main` liegt,
veröffentlicht der Workflow die neue Liste (und führt die Prüfung vorher selbst aus). Die App holt sich die
neue Liste beim Öffnen automatisch und zeigt neue Münzen mit **NEU**.

Wird ein Land neu aufgenommen (z. B. Bulgarien, sobald es eine Gedenkmünze gibt), muss es zusätzlich unter
`countries` eingetragen werden (`"BG": {"n": "Bulgarien", "f": "🇧🇬"}`).

## Wie verlässlich ist die Liste?

**Stand der Liste: 2. Oktober 2026 – 677 Münzen** (621 × 2 €, 32 × 5 €, 24 × 25 €; 817 Stück, weil jede der
35 deutschen 2-€-Münzen in fünf Prägestätten vorliegt).

- **2004–2025 (584 Münzen):** Gegen die amtlichen Jahresseiten der Europäischen Zentralbank abgeglichen
  (ecb.europa.eu/euro/coins/comm): Land, Jahr, Anzahl und Motiv jeder nationalen Münze stimmen überein, die
  fünf Gemeinschaftsausgaben (2007, 2009, 2012, 2015, 2022) sind vollständig. Jedes Foto wurde mit dem Titel
  verglichen.
- **2026 (37 Münzen):** Die EZB hat für 2026 noch keine Seite. Diese Einträge stammen aus Pressemeldungen und
  sind **nicht amtlich geprüft** und noch **ohne Foto** (dort steht die Landesflagge). Sobald die EZB das
  Jahr 2026 veröffentlicht, lässt sich das nachholen.
- **5 € Kupfer (32 Münzen) und 25 € Silber-Niob (24 Münzen):** Alle österreichischen Ausgaben seit der ersten
  5-€-Kupfermünze (Ausgabe 14.12.2011, Jahrgang 2012) bzw. seit 2003 (25 €). Quelle für Titel, Jahrgang und
  Ausgabedatum: die Übersichten auf geldmarie.at, abgeglichen mit dem Katalog der Münze Österreich
  (muenzeoesterreich.at). **Fotos:** 21 der 24 Silber-Niob-Münzen (2003–2023) haben ein Foto von Wikimedia
  Commons (frei lizenziert, CC BY-SA, mit Nachweis beim Antippen des Bildes). Ohne Foto sind die 25-€-Münzen
  2024–2026 und alle 5-€-Kupfermünzen: Die Münze Österreich erlaubt die Verwendung ihrer Bilder nur für den
  persönlichen Gebrauch (Impressum), eine Veröffentlichung braucht ihre Zustimmung; frei lizenzierte Fotos
  dieser Münzen gibt es nicht. Dort steht eine Wert-Kachel. Eigene Fotos lassen sich mit
  `tools/make-image.py` einbinden (bei fremden Fotos Eintrag in `app/data/credits.json` nicht vergessen). **Nicht enthalten**: 10-€-Kupfermünzen, Silber-/Goldmünzen, die
  Neujahrsmünze 2027 (Ausgabe 2.12.2026).
- **Kursmünzensätze (39 Sätze, 312 Münzen):** Je Land und Motivserie, abgeglichen mit den Länderseiten der EZB
  (ecb.europa.eu/euro/coins/html/…). Mehrere Serien haben Belgien (3), Spanien (3), Frankreich (3), Niederlande (2),
  Monaco (3), San Marino (2) und Vatikan (5); Bulgarien ist seit 2026 dabei. Deutsche Sätze werden nicht nach
  Prägestätte unterschieden. Neue Serien, die die EZB noch nicht zeigt (z. B. Luxemburg mit Großherzog Guillaume,
  Vatikan mit Papst Leo XIV.), fehlen noch. Bild je Satz: die 2-€-Münze der Serie von der EZB.
- Noch **nicht enthalten** (2 €): Österreich „Beethoven“ (Ausgabe 2027; Proof-Ausgabe ab 2.12.2026), Andorra 2026
  (zwei Münzen, Motive noch nicht bekannt), Bulgarien (die geplante Gedenkmünze wurde blockiert).
- **Prägestätten:** Die EZB-Beschreibungen nennen für die meisten deutschen Münzen ausdrücklich alle fünf
  Prägestätten (A, D, F, G, J). Bei den übrigen steht dazu nichts, es gilt dieselbe Annahme. Andere Länder
  haben ebenfalls Varianten (z. B. Münzmeisterzeichen), die noch nicht unterschieden werden.
- Fehlt dir trotzdem eine Münze, kannst du sie in der App über *Menü → Fehlende Münze hinzufügen* ergänzen.

**Fotos der 25-€-Münzen (Wikimedia Commons):** Aufnahmen von NobbiP (2003, 2005–2014) und KenzoMogi (2004,
2015–2023), lizenziert unter CC BY-SA 3.0 bzw. 4.0. Die Bilder in der App sind verkleinert und rund
ausgeschnitten und stehen deshalb ebenfalls unter CC BY-SA. Die genauen Dateinamen und Lizenzen je Münze stehen
in `app/data/credits.json`; die App zeigt sie beim Vergrößern des Bildes samt Link.

**Quellen der Münzbilder (2 €):** Europäische Zentralbank (ecb.europa.eu, verkleinert und rund zugeschnitten) und
Europäische Kommission (economy-finance.ec.europa.eu) für Monaco „Carladès“ sowie Vatikan 2024/2025. Die
Münzmotive gehören den jeweiligen Ausgabeländern.

## Entwicklung

```bash
cd app && python3 -m http.server 8000     # App lokal ansehen: http://localhost:8000
node tools/validate.mjs                   # Münzliste und Bilder prüfen
```

Technik: reines HTML/CSS/JavaScript ohne Build-Schritt. Offline-Betrieb über einen Service Worker
(`app/sw.js`, „Netz zuerst“: online immer die neueste Version, offline der letzte Stand). Häkchen, eigene
Münzen und Einstellungen liegen im `localStorage` des Geräts. Die Münzbilder werden beim Ansehen und auf
Wunsch (*Menü → Münzbilder offline speichern*) im Gerät zwischengespeichert.
