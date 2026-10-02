#!/usr/bin/env python3
"""Münzbild für die App vorbereiten.

    python3 tools/make-image.py FOTO.jpg DE-2026-hb

Erzeugt app/img/t/<ID>.webp (klein, für die Liste) und app/img/l/<ID>.webp (groß, für die
Vergrößerung), jeweils rund ausgeschnitten, und setzt in app/data/coins.json bei dieser Münze
"i": 1, damit die App das Bild anzeigt.

Quadratische Münzfotos werden unverändert verkleinert, Querformat-Bilder (z. B. 3:2-Renderings der
EU-Kommission) in der Mitte quadratisch ausgeschnitten, alles andere mit Weiß aufgefüllt.
Benötigt:  pip install pillow
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "app"
SIZES = ((128, "t", 70), (300, "l", 72))  # (Kantenlänge, Ordner, WebP-Qualität)


def square(im: Image.Image) -> Image.Image:
    w, h = im.size
    if w > h * 1.2:  # Querformat: Mitte ausschneiden
        left = (w - h) // 2
        return im.crop((left, 0, left + h, h))
    s = max(w, h)  # sonst mit Weiß auffüllen
    bg = Image.new("RGB", (s, s), (255, 255, 255))
    bg.paste(im, ((s - w) // 2, (s - h) // 2))
    return bg


def circle_mask(size: int) -> Image.Image:
    k = 4  # Überabtastung für glatte Kanten
    m = Image.new("L", (size * k, size * k), 0)
    inset = int(size * k * 0.008)
    ImageDraw.Draw(m).ellipse((inset, inset, size * k - inset, size * k - inset), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, coin_id = Path(sys.argv[1]), sys.argv[2]
    if not re.fullmatch(r"[A-Z]{2}-\d{4}-[a-z0-9-]+", coin_id):
        sys.exit(f"Ungültige Münz-ID: {coin_id}")

    if not src.is_file():
        sys.exit(f"Bilddatei nicht gefunden: {src}")

    data_file = ROOT / "data" / "coins.json"
    text = data_file.read_text(encoding="utf-8")
    line = next((l for l in text.splitlines() if f'"id": "{coin_id}"' in l), None)
    if line is None:
        sys.exit(f"{coin_id} steht nicht in app/data/coins.json – erst die Münze eintragen.")

    im = square(Image.open(src).convert("RGB"))
    for size, folder, quality in SIZES:
        out = im.resize((size, size), Image.LANCZOS).convert("RGBA")
        out.putalpha(circle_mask(size))
        target = ROOT / "img" / folder / f"{coin_id}.webp"
        target.parent.mkdir(parents=True, exist_ok=True)
        out.save(target, "WEBP", quality=quality, method=4)
        print(f"geschrieben: {target.relative_to(ROOT.parent)}")

    if '"i": 1' not in line:
        data_file.write_text(text.replace(line, re.sub(r"\}(,?)$", r', "i": 1}\1', line)), encoding="utf-8")
        print('coins.json: "i": 1 gesetzt')
    print("Fertig. Danach: node tools/validate.mjs")


if __name__ == "__main__":
    main()
