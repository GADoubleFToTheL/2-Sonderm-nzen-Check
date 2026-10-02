# Münzliste aktualisieren (Anleitung für die automatische Prüfung)

Ziel: Neue 2-Euro-Gedenkmünzen in `app/data/coins.json` eintragen, Münzbilder ergänzen, prüfen,
nach `main` bringen. Danach veröffentlicht der Workflow „App veröffentlichen“ die neue Liste von selbst.
Format der Einträge, Felder und Münzbilder: siehe `README.md`, Abschnitt „Neue Münzen eintragen“.

## 1. Was ist neu?

Quellen, in dieser Reihenfolge:

1. **EZB, amtliche Liste je Jahr:** `https://www.ecb.europa.eu/euro/coins/comm/html/comm_<JAHR>.en.html`
   (für das laufende und das nächste Jahr abrufen; gibt es die Seite noch nicht, kommt „Sorry, this page does not
   exist“). Die Seite nennt je Münze Land, Motiv („feature“), Beschreibung, Ausgabedatum und Bildpfad
   (`comm_<JAHR>/comm_<JAHR>_<land>.jpg`, relativ zu `.../comm/html/`). Gemeinschaftsausgaben stehen in einem eigenen
   Abschnitt, ihre Bilder heißen `joint_comm_<JAHR>_<Land>.jpg`.
2. **EU-Kommission:** `https://economy-finance.ec.europa.eu/euro/euro-coins-and-notes/euro-coins/commemorative-coins_en`
   und die Einzelseiten dort (zeigt neue Münzen früher als die EZB, Abrufe werden bei zu vielen Anfragen mit HTTP 429
   abgelehnt: dann warten und es später erneut versuchen).
3. **Amtsblatt der EU** („Neue nationale Seite von Euro-Umlaufmünzen“) für angekündigte Münzen.

**5 € Kupfer und 25 € Silber-Niob (Münze Österreich, Feld `k`):** Zusätzlich auf neue Ausgaben prüfen:
`https://www.geldmarie.at/gold/kupfermünzen-5-und-10-euro-österreich.html` (5 € mit Ausgabedatum),
`https://www.geldmarie.at/gold/silber-niob-25-euro-preise.html` (25 € mit Jahr und Motiv) und die Seiten der
Münze Österreich (`https://www.muenzeoesterreich.at/sammeln/euro-muenzen/5-euro-muenzen`,
`.../sammlermuenzen/silber-niob-muenzen`). Eintragen mit `"k": 5` bzw. `"k": 25`, ID `AT-<Jahrgang>-<k>-<name>`.
`y` = Jahrgang auf der Münze; `m` nur setzen, wenn das Ausgabejahr gleich dem Jahrgang ist (Neujahrsmünzen
erscheinen im Dezember davor, dann ohne `m`). Normalerweise erscheinen zwei 5-€-Kupfermünzen pro Jahr (Neujahrs- und
Ostermünze, gelegentlich eine dritte) und eine 25-€-Silber-Niob-Münze. Nur bereits **ausgegebene** Münzen eintragen
(Ausgabedatum erreicht). 10-€-Kupfermünzen, Silber- und Goldmünzen gehören nicht in die Liste. **Fotos:** Bilder
der Münze Österreich dürfen nicht verwendet werden (nur persönlicher Gebrauch laut Impressum). Erlaubt sind frei
lizenzierte Fotos von Wikimedia Commons (CC BY, CC BY-SA oder CC0; Autor und Lizenz auf der Dateiseite prüfen,
Kategorie „Euro coins (25 euro)“ bzw. „Commemorative Euro coins of Austria“). Dann Eintrag in
`app/data/credits.json` (`{"a": Autor, "l": "CC BY-SA 4.0", "f": "Dateiname.jpg"}`) und Bild mit
`tools/make-image.py` erzeugen; `node tools/validate.mjs` meldet fehlende Nachweise als Fehler. Ohne freies Foto
`i` weglassen (die App zeigt dann eine Wert-Kachel). Die API von Wikimedia lehnt viele Abrufe ab (HTTP 429):
Kategorieseiten und Dateiseiten per `curl` mit eigenem User-Agent und Pausen abrufen.

**Kursmünzensätze (Feld `"k": 1`):** Je Land und Motivserie ein Eintrag (ID `LAND-<erstes Jahr>-satz…`, `y` = erstes
Jahr der Serie, Titel z. B. „3. Serie – König Philippe“). Quelle: die Länderseiten der EZB
`https://www.ecb.europa.eu/euro/coins/html/<code>.en.html` (Codes wie `be`, `fr`; Estland `et`, Slowenien `sl`,
Monaco `mo`). Zeigt eine Länderseite eine neue Serie oder kommt ein neues Euro-Land hinzu, einen Satz ergänzen (Land
unter `countries` eintragen) und als Bild die 2-€-Münze der Serie von der EZB-Seite mit `tools/make-image.py` erzeugen.

Abgleich mit `coins.json`: nach **Land + Jahr + Motiv** vergleichen (Titel in der Liste sind deutsch, die EZB-Seite
ist englisch). Eine Münze gilt als „schon drin“, wenn Land, Jahr und Motiv zusammenpassen, auch bei anderer
Wortwahl. Nie eine Münze doppelt anlegen.

## 2. Eintragen

* **Neue Münze:** Eintrag wie in der README (ID `LAND-JAHR-kurzname`, `c`, `y`, `m`, `t` deutscher Titel, `g` bei
  Gemeinschaftsausgaben). Quelle nur die amtlichen Seiten oben, nichts erfinden. Ist ein Eintrag nur von einer
  Ankündigung gedeckt (EZB-Seite fehlt noch), `"u": 1` setzen.
* **Bestehende Einträge mit `"u": 1`:** Sobald die EZB-Seite des Jahres da ist, mit ihr abgleichen: Titel, Monat und
  Land korrigieren, `u` entfernen. Fehlen Münzen der EZB-Liste in `coins.json`, ergänzen; steht eine Münze in
  `coins.json`, die die EZB nicht kennt, **nicht löschen**, sondern `u` lassen und im Bericht erwähnen.
* **Bilder:** Bild von der EZB-Seite laden (`curl -sS -o foto.jpg "<URL>"`) und mit
  `python3 tools/make-image.py foto.jpg <ID>` umwandeln (`pip install pillow`). Das Skript setzt `"i": 1`.
  Fehlt das Bild (EZB zeigt „New image coming soon“), die Münze ohne Bild lassen.
* **Neues Land** zusätzlich unter `countries` eintragen.
* Oben in der Datei `"updated"` auf das heutige Datum setzen.

## 3. Regeln

* IDs bestehender Münzen **nie ändern**, Münzen **nie löschen**: Sonst gehen Häkchen verloren.
* Im Zweifel `"u": 1` setzen statt zu raten.
* Bis 2011 höchstens eine, ab 2012 höchstens zwei nationale Münzen je Land und Jahr (Gemeinschaftsausgaben
  zählen nicht mit); der Prüfer meldet Ausnahmen als Hinweis.
* Urheberrecht: Bilder von EZB/EU-Kommission dürfen mit Quellenangabe genutzt werden; die App nennt die Quelle
  im Menü und verkleinert die Bilder. Keine Bilder aus anderen Quellen übernehmen.

## 4. Prüfen und veröffentlichen

1. `node tools/validate.mjs` muss mit `OK` enden. Bei Fehlern korrigieren; wird es nicht grün, **nichts
   veröffentlichen** und im Bericht schreiben, woran es hängt.
2. Gibt es **nichts Neues**, nichts ändern, keinen Branch und keinen Pull Request anlegen.
3. Sonst: Branch `claude/muenzliste-update` (nur auf diesen Branch darf die Pflege-Sitzung pushen). Er wird jedes
   Mal frisch von `main` gestartet, weil der vorige Pull Request schon zusammengeführt ist:
   `git fetch origin main && git checkout -B claude/muenzliste-update origin/main` (bei Arbeit von Hand reicht
   ein beliebiger eigener Branch). Commit mit kurzer deutscher Nachricht (z. B. „2 neue Münzen: …“),
   `git push -u origin claude/muenzliste-update --force-with-lease`, Pull Request nach `main` (Beschreibung:
   welche Münzen neu, welche korrigiert, welche ungeprüft) und den Pull Request zusammenführen (Squash), sobald
   die Prüfung grün ist.
4. Abschlussbericht auf Deutsch, kurz: Anzahl neuer Münzen mit Land, Jahr und Motiv, Korrekturen, offene Fragen.
