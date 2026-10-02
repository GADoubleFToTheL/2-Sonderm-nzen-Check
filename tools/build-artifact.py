#!/usr/bin/env python3
"""Baut die Fassung für ein Claude-Artifact (private Seite, die in der Claude-App auf dem Handy läuft).

    python3 tools/build-artifact.py [AUSGABEORDNER]      # Standard: build/artifact

Im Artifact gibt es weder Service Worker noch 600 einzelne Bilddateien (Höchstgrenze 511 Dateien).
Darum packt das Skript die runden Münzbilder in Bildtafeln:
  * kleine Bilder (128 px, 8×8 je Tafel) werden direkt in die Seite eingebettet,
  * große Bilder (300 px, 4×4 je Tafel) liegen als Dateien img/l0.webp, img/l1.webp, … daneben.
Münzliste und Tafel-Index stecken als JSON in der Seite (<script id="euro-host">), app.js erkennt daran
die gehostete Fassung. Ausgabe: index.html + img/l*.webp  ->  mit dem Artifact-Werkzeug veröffentlichen.
Benötigt:  pip install pillow
"""
import base64
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
SHEETS = {"t": {"cell": 128, "cols": 8, "q": 78}, "l": {"cell": 300, "cols": 4, "q": 78}}


def build_sheets(ids, kind, out_dir):
    """Packt die Bilder zu Tafeln. Gibt (Tafeln als Bytes) zurück."""
    cfg = SHEETS[kind]
    cell, cols = cfg["cell"], cfg["cols"]
    per = cols * cols
    sheets = []
    for start in range(0, len(ids), per):
        sheet = Image.new("RGBA", (cell * cols, cell * cols), (0, 0, 0, 0))
        for i, coin_id in enumerate(ids[start:start + per]):
            with Image.open(APP / "img" / kind / f"{coin_id}.webp") as im:
                sheet.paste(im.convert("RGBA"), ((i % cols) * cell, (i // cols) * cell))
        buf = io.BytesIO()
        sheet.save(buf, "WEBP", quality=cfg["q"], method=4)
        sheets.append(buf.getvalue())
    return sheets


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "build" / "artifact"
    data = json.loads((APP / "data" / "coins.json").read_text(encoding="utf-8"))

    # Reihenfolge der Bilder: neueste Jahre zuerst, damit die ersten Tafeln den Listenanfang abdecken.
    with_img = sorted((c for c in data["coins"] if c.get("i") == 1), key=lambda c: (-c["y"], c["id"]))
    ids = [c["id"] for c in with_img]

    small = build_sheets(ids, "t", out)
    large = build_sheets(ids, "l", out)

    (out / "img").mkdir(parents=True, exist_ok=True)
    for old in (out / "img").glob("l*.webp"):
        old.unlink()
    files = []
    for n, blob in enumerate(large):
        name = f"img/l{n}.webp"
        (out / name).write_bytes(blob)
        files.append(name)

    host = {
        "data": data,
        "idx": {coin_id: n for n, coin_id in enumerate(ids)},
        "t": {"cols": SHEETS["t"]["cols"], "per": SHEETS["t"]["cols"] ** 2},
        "l": {"cols": SHEETS["l"]["cols"], "per": SHEETS["l"]["cols"] ** 2, "files": files},
    }
    host_json = json.dumps(host, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    css = (APP / "style.css").read_text(encoding="utf-8")
    css += "\n" + "\n".join(
        f".th{n}{{background-image:url(data:image/webp;base64,{base64.b64encode(blob).decode()})}}"
        for n, blob in enumerate(small)
    ) + "\n"

    html = (APP / "index.html").read_text(encoding="utf-8")
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    body = re.sub(r"\s*<noscript>.*?</noscript>", "", body, flags=re.S)
    body = re.sub(r'\s*<script src="app.js"></script>', "", body)
    js = (APP / "app.js").read_text(encoding="utf-8")
    assert "</script" not in js.lower(), "app.js darf kein </script enthalten"

    page = (
        "<title>2€ Sondermünzen</title>\n"
        f"<style>\n{css}</style>\n"
        f"{body.strip()}\n"
        f'<script type="application/json" id="euro-host">{host_json}</script>\n'
        f"<script>\n{js}</script>\n"
    )
    (out / "index.html").write_text(page, encoding="utf-8")

    size = len(page.encode("utf-8")) + sum(len(b) for b in large)
    print(f"{len(ids)} Münzbilder in {len(small)} kleinen + {len(large)} großen Tafeln")
    print(f"index.html: {len(page.encode('utf-8')) / 1e6:.1f} MB, Bilddateien: {sum(len(b) for b in large) / 1e6:.1f} MB, gesamt {size / 1e6:.1f} MB")
    print(f"Ausgabe: {out}")


if __name__ == "__main__":
    main()
