# 2€-Sondermünzen-Check

Handy-App zum Nachkontrollieren, welche 2-Euro-Gedenkmünzen man schon hat. Alle Münzen sind hinterlegt,
man hakt ab, was man besitzt – und sieht sofort, was noch fehlt.

- **Alle 2€-Sondermünzen** von 2004 bis heute (24 Länder, inkl. Andorra, Monaco, San Marino, Vatikan)
- **Abhaken** mit einem Tipp, Fortschrittsanzeige gesamt und je Jahr/Land
- **Deutsche Münzen nach Prägestätte** (A Berlin, D München, F Stuttgart, G Karlsruhe, J Hamburg): je Münze
  fünf Schalter, dazu ein Knopf „alle“. Gezählt wird pro Prägestätte.
- **Suchen & filtern**: nach Land, Jahr, Motiv; „Fehlen“ / „Hab ich“; Gruppierung nach Jahr oder Land
- **Neue Münzen erscheinen automatisch** und werden mit **NEU** markiert
- **Funktioniert offline** und lässt sich wie eine normale App aufs Handy legen (Android & iPhone)
- **Sicherung** der Sammlung als Datei (und wieder einspielen)
- **Fehlende Münze selbst ergänzen**, falls etwas in der Liste fehlt

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
| `u` | `1` = Angaben noch nicht bestätigt (wird in der App als „ungeprüft“ angezeigt) |

**Prägestätten:** Bei einem Land mit Prägestätten steht unter `countries` zusätzlich `"mm"`, z. B. bei Deutschland
`"mm": {"A": "Berlin", "D": "München", ...}`. Dann gibt es *jede* Münze dieses Landes in allen genannten
Varianten – eine neue deutsche Münze braucht also nichts Besonderes. Die Häkchen werden je Prägestätte unter
`DE-2026-hb@A`, `DE-2026-hb@D` usw. gespeichert.

Nach dem Eintragen zusätzlich `"updated"` (Datum) oben in der Datei anpassen und `node tools/validate.mjs`
ausführen – das Skript prüft Format, doppelte IDs und Auffälligkeiten. Sobald die Änderung auf `main` liegt,
veröffentlicht der Workflow die neue Liste (und führt die Prüfung vorher selbst aus). Die App holt sich die
neue Liste beim Öffnen automatisch und zeigt neue Münzen mit **NEU**.

Wird ein Land neu aufgenommen (z. B. Bulgarien, sobald es eine Gedenkmünze gibt), muss es zusätzlich unter
`countries` eingetragen werden (`"BG": {"n": "Bulgarien", "f": "🇧🇬"}`).

## Wie verlässlich ist die Liste?

**Stand der Liste: 2. Oktober 2026 – 609 Münzen** (729 Stück, weil jede der 30 deutschen Münzen in fünf Prägestätten vorliegt). Die Daten wurden per Websuche zusammengetragen und gegen
Gesamtzahlen (z. B. Italien 40, Finnland 39, Belgien 33, Monaco 17, Irland 10) und die erlaubte Zahl
nationaler Münzen je Land und Jahr gegengeprüft. Amtliche Listen (EZB, EU-Kommission, Wikipedia) waren in der
Entwicklungsumgebung nicht abrufbar. Deshalb gilt:

- **10 Einträge sind als „ungeprüft“ markiert** (`"u": 1`) – bei denen ist Motiv oder Jahr nicht sicher bestätigt.
- **Es fehlen vermutlich noch ein paar Münzen** (rechnerisch rund ein Dutzend; Hinweise gibt es u. a. bei
  Griechenland, Portugal, Spanien). Fehlt bei dir eine, kann sie in der App über
  *Menü → Fehlende Münze hinzufügen* ergänzt werden.
- Noch **nicht enthalten** (weil nicht erschienen bzw. Motiv nicht bekannt): Österreich „Beethoven“ (Ausgabe
  2027; Proof-Ausgabe ab 2.12.2026), die beiden Andorra-Münzen 2026, Bulgarien (geplante Münze wurde
  blockiert).
- **Prägestätten:** Ich gehe davon aus, dass jede deutsche 2€-Gedenkmünze in allen fünf Prägestätten geprägt wurde
  (so ist es bei den mir bekannten Ausgaben). Das ist nicht für jedes Jahr einzeln geprüft.
  Andere Länder haben ebenfalls Varianten (z. B. Münzmeisterzeichen), die noch nicht unterschieden werden.

## Entwicklung

```bash
cd app && python3 -m http.server 8000     # App lokal ansehen: http://localhost:8000
node tools/validate.mjs                   # Münzliste prüfen
```

Technik: reines HTML/CSS/JavaScript ohne Build-Schritt. Offline-Betrieb über einen Service Worker
(`app/sw.js`, „Netz zuerst“: online immer die neueste Version, offline der letzte Stand). Häkchen, eigene
Münzen und Einstellungen liegen im `localStorage` des Geräts.
