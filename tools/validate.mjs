// Prüft app/data/coins.json auf Formatfehler und Auffälligkeiten.
//   node tools/validate.mjs            -> Prüfung + Zusammenfassung
// Fehler beenden das Skript mit Exit-Code 1 (blockiert die Veröffentlichung),
// Hinweise sind nur Warnungen.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'data', 'coins.json');
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`coins.json ist kein gültiges JSON: ${e.message}`);
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(data.updated ?? '')) err('„updated“ fehlt oder ist kein Datum (JJJJ-MM-TT).');

const countries = data.countries ?? {};
for (const [code, c] of Object.entries(countries)) {
  if (!/^[A-Z]{2}$/.test(code)) err(`Ländercode „${code}“ ist ungültig.`);
  if (!c.n || !c.f) err(`Land ${code}: Name („n“) und Flagge („f“) sind Pflicht.`);
  // Optional: Prägestätten – dann gibt es jede Münze dieses Landes in allen genannten Varianten.
  if (c.mm !== undefined) {
    const ok = c.mm && typeof c.mm === 'object' && Object.keys(c.mm).length > 0
      && Object.entries(c.mm).every(([k, v]) => /^[A-Z]$/.test(k) && typeof v === 'string' && v.trim());
    if (!ok) err(`Land ${code}: „mm“ muss wie {"A": "Berlin", "D": "München"} aussehen.`);
  }
}

const ALLOWED_KEYS = new Set(['id', 'c', 'y', 'm', 't', 'g', 'u', 'i']);
const imgDir = join(dirname(file), '..', 'img');
const maxYear = new Date().getFullYear() + 1;
const ids = new Set();
const perCountryYear = new Map();
const byYear = new Map();
const byCountry = new Map();
let withImg = 0;

if (!Array.isArray(data.coins) || !data.coins.length) err('„coins“ fehlt oder ist leer.');

for (const c of data.coins ?? []) {
  const label = c.id ?? JSON.stringify(c);
  for (const k of Object.keys(c)) if (!ALLOWED_KEYS.has(k)) err(`${label}: unbekanntes Feld „${k}“.`);
  if (typeof c.id !== 'string' || !/^[A-Z]{2}-\d{4}-[a-z0-9-]+$/.test(c.id)) { err(`${label}: ID muss wie „DE-2006-sh“ aussehen.`); continue; }
  if (ids.has(c.id)) err(`${label}: ID kommt doppelt vor.`);
  ids.add(c.id);
  if (!countries[c.c]) err(`${label}: Land „${c.c}“ ist nicht unter „countries“ eingetragen.`);
  if (!Number.isInteger(c.y) || c.y < 2004 || c.y > maxYear) err(`${label}: Jahr „${c.y}“ ist unplausibel.`);
  if (c.id.slice(0, 2) !== c.c) err(`${label}: ID passt nicht zum Land „${c.c}“.`);
  if (Number(c.id.slice(3, 7)) !== c.y) err(`${label}: ID passt nicht zum Jahr ${c.y}.`);
  if (c.m !== undefined && !(Number.isInteger(c.m) && c.m >= 1 && c.m <= 12)) err(`${label}: Monat muss 1–12 sein.`);
  if (typeof c.t !== 'string' || !c.t.trim() || c.t.length > 140) err(`${label}: Titel fehlt oder ist zu lang.`);
  for (const f of ['g', 'u', 'i']) if (c[f] !== undefined && c[f] !== 1) err(`${label}: „${f}“ darf nur 1 sein.`);
  // Münzbild: i = 1 setzt voraus, dass beide Dateien da sind (klein: img/t, groß: img/l).
  const hasFiles = existsSync(join(imgDir, 't', `${c.id}.webp`)) && existsSync(join(imgDir, 'l', `${c.id}.webp`));
  if (c.i === 1 && !hasFiles) err(`${label}: „i“ ist gesetzt, aber die Bilddateien fehlen (img/t und img/l).`);
  if (c.i !== 1 && hasFiles) warn(`${label}: Bilddateien vorhanden, aber „i“ fehlt – Bild wird nicht angezeigt.`);
  if (c.i === 1) withImg++;

  byYear.set(c.y, (byYear.get(c.y) ?? 0) + 1);
  byCountry.set(c.c, (byCountry.get(c.c) ?? 0) + 1);
  if (!c.g) {
    const k = `${c.c}-${c.y}`;
    perCountryYear.set(k, (perCountryYear.get(k) ?? 0) + 1);
  }
}

// Regel: bis 2011 höchstens eine, ab 2012 höchstens zwei nationale Gedenkmünzen je Land und Jahr
// (Gemeinschaftsausgaben zählen nicht mit). Verstöße sind nur Hinweise – es gibt Sonderfälle.
for (const [k, n] of perCountryYear) {
  const y = Number(k.split('-')[1]);
  const limit = y < 2012 ? 1 : 2;
  if (n > limit) warn(`${k}: ${n} nationale Münzen (üblich: höchstens ${limit}) – bitte prüfen.`);
}

const unverified = data.coins.filter((c) => c.u).map((c) => c.id);
const units = data.coins.reduce((n, c) => n + (countries[c.c]?.mm ? Object.keys(countries[c.c].mm).length : 1), 0);
console.log(`Münzen: ${data.coins.length} (${units} Stück inkl. Prägestätten) · Länder: ${Object.keys(countries).length} · Stand: ${data.updated}`);
console.log(`Mit Münzbild: ${withImg} von ${data.coins.length}`);
console.log('Je Jahr:', [...byYear].sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y}:${n}`).join(' '));
console.log('Je Land:', [...byCountry].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(' '));
if (unverified.length) console.log(`Als „ungeprüft“ markiert (${unverified.length}): ${unverified.join(', ')}`);
for (const w of warnings) console.warn(`Hinweis: ${w}`);
for (const e of errors) console.error(`FEHLER: ${e}`);
if (errors.length) {
  console.error(`\n${errors.length} Fehler – coins.json wird nicht veröffentlicht.`);
  process.exit(1);
}
console.log('\nOK');
