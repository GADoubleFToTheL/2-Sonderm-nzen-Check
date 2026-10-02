(() => {
  'use strict';

  const KEY = {
    owned: 'euro2.owned',
    seen: 'euro2.seen',
    data: 'euro2.data',
    prefs: 'euro2.prefs',
    synced: 'euro2.synced',
    custom: 'euro2.custom',
  };
  const DATA_URL = 'data/coins.json';
  const SYNC_EVERY_MS = 30 * 60 * 1000;
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const norm = (s) => s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/\p{M}/gu, '');

  // Gehostete Fassung (Claude-Artifact): Münzliste und Bilder stecken in der Seite, es gibt keinen Service Worker.
  const HOST = (() => {
    try { const n = document.getElementById('euro-host'); return n ? JSON.parse(n.textContent) : null; }
    catch { return null; }
  })();
  if (HOST) document.documentElement.classList.add('host');

  // Diese Schlüssel werden zusätzlich im Claude-Konto gesichert (siehe „cloud“ weiter unten).
  const SYNCED = new Set([KEY.owned, KEY.custom, KEY.seen]);

  let storageWarned = false;
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        if (HOST && SYNCED.has(key)) cloud.touch();
        return true;
      } catch {
        if (!storageWarned) { storageWarned = true; toast('Speichern nicht möglich – Häkchen gehen beim Schließen verloren.'); }
        return false;
      }
    },
  };

  const state = {
    base: null,
    coins: [],
    byId: new Map(),
    countries: {},
    updated: '',
    custom: store.get(KEY.custom, []),
    owned: new Set(store.get(KEY.owned, [])),
    seen: store.get(KEY.seen, null) && new Set(store.get(KEY.seen, [])),
    newIds: new Set(),
    prefs: Object.assign({ filter: 'all', country: '', year: '', group: 'year', q: '' }, store.get(KEY.prefs, {})),
  };

  const ui = {
    list: $('#list'), search: $('#search'), chips: $('#chips'), chipNew: $('#chipNew'),
    country: $('#country'), year: $('#year'), group: $('#group'),
    filters: $('#filters'), filterBtn: $('#filterBtn'), filterDot: $('#filterDot'),
    progressText: $('#progressText'), bar: $('#bar'), barFill: $('#barFill'),
    banner: $('#banner'), bannerText: $('#bannerText'),
    menu: $('#menu'), menuInfo: $('#menuInfo'), cloudInfo: $('#cloudInfo'), toast: $('#toast'), top: $('#top'),
  };

  /* ---------- Daten ---------- */

  function isValidData(d) {
    return d && typeof d === 'object' && d.countries && Array.isArray(d.coins) && d.coins.length > 0
      && d.coins.every((c) => c && typeof c.id === 'string' && d.countries[c.c] && Number.isInteger(c.y) && typeof c.t === 'string');
  }

  // Jede Münze besteht aus einer oder mehreren „Einheiten“, die einzeln abgehakt werden:
  // normalerweise eine, bei Ländern mit Prägestätten (Deutschland: A, D, F, G, J) je Prägestätte eine.
  const unitIds = (c) => (c.units ? c.units.map((u) => u.id) : [c.id]);
  const unitCount = (c) => (c.units ? c.units.length : 1);
  const ownedCount = (c) => unitIds(c).reduce((n, id) => n + (state.owned.has(id) ? 1 : 0), 0);

  function toCoin(c, countries) {
    const country = countries[c.c];
    const month = c.m ? MONTHS[c.m - 1] : '';
    const units = country.mm && !c.custom
      ? Object.entries(country.mm).map(([mark, city]) => ({ id: `${c.id}@${mark}`, mark, city }))
      : null;
    return {
      id: c.id, c: c.c, y: c.y, m: c.m || 0, t: c.t, units,
      g: c.g === 1, u: c.u === 1, custom: c.custom === true, img: c.i === 1,
      flag: country.f, countryName: country.n,
      when: month ? `${month} ${c.y}` : String(c.y),
      search: norm([country.n, c.c, c.y, month, c.t, c.g === 1 ? 'gemeinschaftsausgabe gemeinsame' : '', c.custom ? 'eigene' : ''].join(' ')),
    };
  }

  function applyData(data) {
    state.base = data;
    state.updated = data.updated || '';
    state.countries = data.countries;
    compose();
  }

  // Offizielle Liste + selbst ergänzte Münzen zusammenführen und anzeigen.
  function compose() {
    const { countries, coins } = state.base;
    const own = state.custom.filter((c) => countries[c.c]).map((c) => ({ ...c, custom: true }));
    state.coins = coins.concat(own).map((c) => toCoin(c, countries));
    state.byId = new Map(state.coins.map((c) => [c.id, c]));

    // Ältere Häkchen auf der ganzen Münze (ohne Prägestätte) gelten für alle Prägestätten.
    let migrated = false;
    for (const c of state.coins) {
      if (c.units && state.owned.has(c.id)) {
        c.units.forEach((u) => state.owned.add(u.id));
        state.owned.delete(c.id);
        migrated = true;
      }
    }
    if (migrated) store.set(KEY.owned, [...state.owned]);

    const ids = coins.map((c) => c.id);
    if (state.seen === null) {
      // Erster Start: alles, was jetzt in der Liste steht, gilt als bekannt.
      state.seen = new Set(ids);
      store.set(KEY.seen, ids);
    }
    state.newIds = new Set(ids.filter((id) => !state.seen.has(id)));

    buildSelects();
    render();
    updateBanner();
  }

  async function sync(manual = false) {
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!isValidData(data)) throw new Error('Ungültige Daten');
      const before = state.coins.length;
      const changed = JSON.stringify(data) !== JSON.stringify(store.get(KEY.data, null));
      store.set(KEY.data, data);
      store.set(KEY.synced, Date.now());
      if (changed || !before) applyData(data);
      updateMenuInfo();
      if (manual) {
        toast(state.newIds.size ? `${state.newIds.size} neue Münze(n) gefunden!` : 'Liste ist auf dem neuesten Stand.');
      }
    } catch (e) {
      if (manual) toast('Keine Verbindung – es wird die gespeicherte Liste verwendet.');
      else if (!state.coins.length) {
        ui.list.replaceChildren(el('div', 'empty', 'Die Münzliste konnte nicht geladen werden. Bitte mit Internet verbinden und neu öffnen.'));
      }
    }
  }

  /* ---------- Anzeige ---------- */

  function groupStats(keyFn) {
    const map = new Map();
    for (const c of state.coins) {
      const k = keyFn(c);
      const s = map.get(k) || { n: 0, own: 0 };
      s.n += unitCount(c);
      s.own += ownedCount(c);
      map.set(k, s);
    }
    return map;
  }

  function matches(c) {
    const p = state.prefs;
    const have = ownedCount(c);
    if (p.filter === 'missing' && have === unitCount(c)) return false;
    if (p.filter === 'owned' && have === 0) return false;
    if (p.filter === 'new' && !state.newIds.has(c.id)) return false;
    if (p.country && c.c !== p.country) return false;
    if (p.year && String(c.y) !== p.year) return false;
    const q = norm(p.q.trim());
    if (q && !q.split(/\s+/).every((w) => c.search.includes(w))) return false;
    return true;
  }

  function metaFor(c) {
    const byCountry = state.prefs.group === 'country';
    const meta = el('span', 'meta', byCountry ? c.when : `${c.countryName} · ${c.when}`);
    if (c.g) meta.append(el('span', 'tag', 'Gemeinsam'));
    if (c.u) meta.append(el('span', 'tag tag-u', 'ungeprüft'));
    if (c.custom) meta.append(el('span', 'tag tag-own', 'Eigene'));
    return meta;
  }

  // Lage einer Münze in den Bildtafeln der gehosteten Fassung (kind: 't' klein, 'l' groß).
  function spriteAt(kind, id) {
    const n = HOST && HOST.idx[id];
    if (n == null) return null;
    const g = HOST[kind];
    const i = n % g.per;
    const pct = (k) => `${(k / (g.cols - 1)) * 100}%`;
    return { sheet: Math.floor(n / g.per), pos: `${pct(i % g.cols)} ${pct(Math.floor(i / g.cols))}` };
  }

  // Rundes Münzbild (antippen = vergrößern); ohne Bild die Landesflagge.
  function medalFor(c) {
    if (!c.img || (HOST && !spriteAt('t', c.id))) return el('span', 'medal', c.flag);
    const b = el('button', 'medal img');
    b.type = 'button';
    b.dataset.zoom = c.id;
    b.setAttribute('aria-label', `Münzbild vergrößern: ${c.t}`);
    let pic;
    if (HOST) {
      const s = spriteAt('t', c.id);
      pic = el('span', `sp th th${s.sheet}`);
      pic.style.backgroundPosition = s.pos;
    } else {
      pic = el('img');
      pic.src = `img/t/${c.id}.webp`;
      pic.alt = '';
      pic.width = 54;
      pic.height = 54;
      pic.loading = 'lazy';
      pic.decoding = 'async';
    }
    b.append(pic, el('span', 'flag-badge', c.flag));
    return b;
  }

  // Münze mit Prägestätten: ein Schalter je Prägestätte, rechts „alle“.
  function multiRow(c) {
    const li = el('li');
    const row = el('div', 'coin multi');
    row.dataset.coin = c.id;
    const info = el('span', 'info');
    info.append(el('span', 'title', c.t), metaFor(c));
    const mints = el('span', 'mints');
    mints.setAttribute('role', 'group');
    mints.setAttribute('aria-label', 'Prägestätten');
    for (const u of c.units) {
      const b = el('button', 'mint', u.mark);
      b.type = 'button';
      b.dataset.unit = u.id;
      b.title = u.city;
      b.setAttribute('aria-label', `Prägestätte ${u.mark} (${u.city})`);
      mints.append(b);
    }
    info.append(mints);
    const all = el('button', 'all');
    all.type = 'button';
    all.dataset.all = c.id;
    row.append(medalFor(c), info);
    if (state.newIds.has(c.id)) row.append(el('span', 'badge-new', 'NEU'));
    row.append(all);
    li.append(row);
    paintMulti(row, c);
    return li;
  }

  function paintMulti(row, c) {
    const n = ownedCount(c);
    const full = n === c.units.length;
    row.classList.toggle('complete', full);
    row.classList.toggle('partial', n > 0 && !full);
    const all = row.querySelector('.all');
    all.textContent = full ? '✓' : `${n}/${c.units.length}`;
    all.setAttribute('aria-label', full ? 'Alle Prägestätten abwählen' : 'Alle Prägestätten abhaken');
    row.querySelectorAll('.mint').forEach((b) => b.setAttribute('aria-pressed', String(state.owned.has(b.dataset.unit))));
  }

  function coinRow(c) {
    if (c.units) return multiRow(c);
    const li = el('li');
    const label = el('label', 'coin');
    const input = el('input');
    input.type = 'checkbox';
    input.dataset.id = c.id;
    input.checked = state.owned.has(c.id);

    const info = el('span', 'info');
    info.append(el('span', 'title', c.t), metaFor(c));

    label.append(input, medalFor(c), info);
    if (state.newIds.has(c.id)) label.append(el('span', 'badge-new', 'NEU'));
    if (c.custom) {
      const del = el('button', 'del', '✕');
      del.type = 'button';
      del.dataset.del = c.id;
      del.setAttribute('aria-label', 'Eigene Münze entfernen');
      label.append(del);
    }
    label.append(el('span', 'tick'));
    li.append(label);
    return li;
  }

  function render() {
    const p = state.prefs;
    const byYear = p.group === 'year';
    const coins = state.coins.filter(matches);

    const countryOrder = (a, b) => a.countryName.localeCompare(b.countryName, 'de');
    coins.sort(byYear
      ? (a, b) => b.y - a.y || (a.m || 13) - (b.m || 13) || countryOrder(a, b)
      : (a, b) => countryOrder(a, b) || a.y - b.y || (a.m || 13) - (b.m || 13));

    const frag = document.createDocumentFragment();

    if (!coins.length) {
      const empty = el('div', 'empty', 'Keine Münzen für diese Auswahl.');
      const btn = el('button', null, 'Filter zurücksetzen');
      btn.addEventListener('click', resetFilters);
      empty.append(el('br'), btn);
      frag.append(empty);
    }

    let currentKey = null, ul = null;
    for (const c of coins) {
      const key = byYear ? c.y : c.c;
      if (key !== currentKey) {
        currentKey = key;
        const section = el('section');
        const h2 = el('h2');
        h2.append(el('span', null, byYear ? String(c.y) : `${c.flag} ${c.countryName}`));
        const small = el('small');
        small.dataset.gk = String(key);
        h2.append(small);
        ul = el('ul');
        section.append(h2, ul);
        frag.append(section);
      }
      ul.append(coinRow(c));
    }
    ui.list.replaceChildren(frag);
    updateCounts();
    syncControls();
  }

  function updateCounts() {
    const total = state.coins.reduce((n, c) => n + unitCount(c), 0);
    const own = state.coins.reduce((n, c) => n + ownedCount(c), 0);
    const pct = total ? Math.round((own / total) * 100) : 0;
    ui.progressText.textContent = `${own} / ${total}`;
    ui.barFill.style.width = `${pct}%`;
    ui.bar.setAttribute('aria-valuenow', String(pct));

    const byYear = state.prefs.group === 'year';
    const stats = groupStats((c) => (byYear ? c.y : c.c));
    ui.list.querySelectorAll('[data-gk]').forEach((node) => {
      const s = stats.get(byYear ? Number(node.dataset.gk) : node.dataset.gk);
      if (s) node.textContent = `${s.own} / ${s.n}`;
    });
  }

  function updateBanner() {
    const n = state.newIds.size;
    ui.chipNew.hidden = n === 0;
    ui.banner.hidden = n === 0;
    if (n) ui.bannerText.textContent = n === 1 ? '1 neue Münze in der Liste!' : `${n} neue Münzen in der Liste!`;
    if (!n && state.prefs.filter === 'new') { state.prefs.filter = 'all'; savePrefs(); render(); }
  }

  function updateMenuInfo() {
    const d = state.updated ? new Date(state.updated).toLocaleDateString('de-DE') : '–';
    const own = state.custom.length ? ` (davon ${state.custom.length} eigene)` : '';
    const units = state.coins.reduce((n, c) => n + unitCount(c), 0);
    const mints = units !== state.coins.length ? ` · ${units} Stück inkl. Prägestätten` : '';
    ui.menuInfo.textContent = `Liste vom ${d} · ${state.coins.length} Münzen${own}${mints}`;
  }

  function buildSelects() {
    const countries = Object.entries(state.countries)
      .sort((a, b) => a[1].n.localeCompare(b[1].n, 'de'));
    const fill = (select, firstLabel, groups) => {
      select.replaceChildren(new Option(firstLabel, ''));
      for (const [label, opts] of groups) {
        const parent = label ? Object.assign(el('optgroup'), { label }) : select;
        for (const [value, text] of opts) parent.append(new Option(text, value));
        if (label) select.append(parent);
      }
    };
    const eu = countries.filter(([, v]) => !v.s).map(([k, v]) => [k, `${v.f} ${v.n}`]);
    const small = countries.filter(([, v]) => v.s).map(([k, v]) => [k, `${v.f} ${v.n}`]);
    fill(ui.country, 'Alle Länder', [['Euro-Länder', eu], ['Kleinstaaten mit Euro', small]]);
    const years = [...new Set(state.coins.map((c) => c.y))].sort((a, b) => b - a).map((y) => [String(y), String(y)]);
    fill(ui.year, 'Alle Jahre', [['', years]]);
    if (!state.countries[state.prefs.country]) state.prefs.country = '';
    if (!years.some(([y]) => y === state.prefs.year)) state.prefs.year = '';
  }

  function syncControls() {
    const p = state.prefs;
    ui.search.value = p.q;
    ui.country.value = p.country;
    ui.year.value = p.year;
    ui.group.value = p.group;
    ui.chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === p.filter)));
    ui.filterDot.hidden = !(p.country || p.year);
    document.documentElement.style.setProperty('--head-h', `${ui.top.offsetHeight}px`);
  }

  function savePrefs() { store.set(KEY.prefs, state.prefs); }

  function resetFilters() {
    Object.assign(state.prefs, { filter: 'all', country: '', year: '', q: '' });
    savePrefs();
    render();
  }

  let toastTimer;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 3200);
  }

  // Eigener Bestätigungsdialog (confirm() wird in eingebetteten Ansichten nicht angezeigt).
  const askDlg = $('#askDlg');
  function ask(message, yes = 'Ja') {
    return new Promise((resolve) => {
      $('#askText').textContent = message;
      $('#askYes').textContent = yes;
      askDlg.returnValue = '';
      askDlg.addEventListener('close', () => resolve(askDlg.returnValue === 'yes'), { once: true });
      askDlg.showModal();
    });
  }

  /* ---------- Sicherung ---------- */

  async function exportBackup() {
    const payload = {
      app: 'euro2-sondermuenzen', v: 1, exported: new Date().toISOString(),
      owned: [...state.owned].sort(), custom: state.custom,
    };
    const name = `muenzen-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
    if (HOST) {
      try {
        const dl = window.claude && (await window.claude.use('downloads'));
        if (dl) { await dl.save({ filename: name, data: JSON.stringify(payload, null, 1) }); toast('Sicherung gespeichert.'); return; }
      } catch (e) { if (e && e.code === 'declined') return; }
      toast('Speichern als Datei geht hier nicht – deine Sammlung liegt im Claude-Konto.');
      return;
    }
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '2€ Sondermünzen – Sicherung' }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'euro2-sondermuenzen' || !Array.isArray(data.owned) || !data.owned.every((x) => typeof x === 'string')) {
        throw new Error('Format');
      }
      const known = new Set(state.coins.flatMap((c) => [c.id, ...unitIds(c)]));
      const haveCustom = new Set(state.custom.map((c) => c.id));
      const custom = (Array.isArray(data.custom) ? data.custom : []).filter((c) => c && typeof c.id === 'string'
        && state.countries[c.c] && Number.isInteger(c.y) && typeof c.t === 'string' && !haveCustom.has(c.id));
      const fresh = data.owned.filter((id) => (known.has(id) || custom.some((c) => c.id === id)) && !state.owned.has(id)).length;
      if (!(await ask(`${data.owned.length} Münzen in der Sicherung, davon ${fresh} neu für dieses Gerät.\nMit deiner Sammlung zusammenführen?`, 'Zusammenführen'))) return;
      state.custom.push(...custom);
      store.set(KEY.custom, state.custom);
      data.owned.forEach((id) => state.owned.add(id));
      store.set(KEY.owned, [...state.owned]);
      compose();
      toast(`Sicherung eingespielt (+${fresh}).`);
    } catch {
      toast('Diese Datei ist keine gültige Sicherung.');
    }
  }

  /* ---------- Cloud-Speicher (nur gehostete Fassung) ---------- */

  // Spiegelt Häkchen, eigene Münzen und „gesehen“ in den privaten Speicher des Claude-Kontos, damit sie
  // nicht verloren gehen, wenn der Browser seine Daten löscht. localStorage bleibt der schnelle Zwischenspeicher.
  const cloud = (() => {
    const RTS = 'euro2.rts';     // Zeitstempel des letzten Abgleichs mit dem Claude-Konto
    const DIRTY = 'euro2.dirty'; // lokale Änderungen, die noch nicht gesendet sind
    const OK = 'Sammlung ist im Claude-Konto gesichert.';
    const LOCAL = 'Nur in diesem Browser gespeichert. Im Menü kannst du eine Sicherung anlegen.';
    const raw = {
      get(k) { try { return localStorage.getItem(k); } catch { return null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch { /* nicht möglich */ } },
      del(k) { try { localStorage.removeItem(k); } catch { /* nicht möglich */ } },
    };
    let ref = null, timer = 0, writing = false, again = false;

    const setStatus = (text) => { ui.cloudInfo.hidden = !text; ui.cloudInfo.textContent = text; };
    const snapshot = () => ({ owned: [...state.owned].sort(), custom: state.custom, seen: [...(state.seen || [])].sort() });
    const isList = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string');

    function touch() {
      raw.set(DIRTY, '1');
      if (!ref) return;
      clearTimeout(timer);
      timer = setTimeout(push, 800);
    }

    // Immer nur ein Schreibvorgang gleichzeitig; Änderungen währenddessen gehen im Anschluss raus.
    async function push() {
      if (!ref) return;
      if (writing) { again = true; return; }
      writing = true;
      try {
        const ts = Date.now();
        await ref.set({ ...snapshot(), ts });
        raw.set(RTS, String(ts));
        raw.del(DIRTY);
        setStatus(OK);
      } catch {
        raw.set(DIRTY, '1');
        setStatus('Sichern im Claude-Konto hat nicht geklappt. Beim nächsten Häkchen wird es erneut versucht.');
      } finally {
        writing = false;
        if (again) { again = false; push(); }
      }
    }

    function apply(owned, custom, seen) {
      state.owned = new Set(owned);
      state.custom = custom;
      state.seen = new Set(seen);
      raw.set(KEY.owned, JSON.stringify([...state.owned]));
      raw.set(KEY.custom, JSON.stringify(state.custom));
      raw.set(KEY.seen, JSON.stringify([...state.seen]));
      compose();
      updateMenuInfo();
    }

    async function connect() {
      try {
        if (!window.claude || !window.claude.use) { setStatus(LOCAL); return; }
        const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        const uid = db && user ? await user.id() : null;
        if (!uid) { setStatus(LOCAL); return; }
        const doc = db.doc(`data/users/${uid}/sammlung`);
        const snap = await doc.get();
        const r = snap.exists ? snap.data() : null;
        ref = doc;
        if (!r || !isList(r.owned) || !Array.isArray(r.custom) || !isList(r.seen)) { await push(); return; }

        const rts = Number(raw.get(RTS)) || 0;
        const dirty = raw.get(DIRTY) === '1';
        if (r.ts === rts) {                       // Stand im Konto = Stand hier
          if (dirty) await push(); else setStatus(OK);
        } else if (!dirty && rts) {               // woanders geändert, hier nichts Neues: übernehmen
          apply(r.owned, r.custom, r.seen);
          raw.set(RTS, String(r.ts));
          setStatus(OK);
        } else {                                  // erster Abgleich oder beides geändert: zusammenführen
          const have = new Set(state.custom.map((c) => c.id));
          const custom = state.custom.concat(r.custom.filter((c) => c && typeof c.id === 'string' && !have.has(c.id)));
          const seen = rts ? [...new Set([...state.seen, ...r.seen])] : r.seen;
          apply([...new Set([...state.owned, ...r.owned])], custom, seen);
          await push();
        }
      } catch {
        ref = null;
        setStatus(LOCAL);
      }
    }

    return { touch, connect };
  })();

  /* ---------- Ereignisse ---------- */

  ui.list.addEventListener('change', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.id) return;
    if (input.checked) state.owned.add(input.dataset.id);
    else state.owned.delete(input.dataset.id);
    store.set(KEY.owned, [...state.owned]);
    updateCounts();
    if (navigator.vibrate) navigator.vibrate(8);
  });

  // Prägestätten-Schalter und „alle“-Knopf bei Münzen mit mehreren Prägestätten.
  ui.list.addEventListener('click', (e) => {
    const mint = e.target.closest('button.mint');
    const all = e.target.closest('button.all');
    if (!mint && !all) return;
    const row = e.target.closest('.coin.multi');
    const coin = row && state.byId.get(row.dataset.coin);
    if (!coin) return;
    if (mint) {
      const id = mint.dataset.unit;
      if (state.owned.has(id)) state.owned.delete(id);
      else state.owned.add(id);
    } else if (ownedCount(coin) === coin.units.length) {
      coin.units.forEach((u) => state.owned.delete(u.id));
    } else {
      coin.units.forEach((u) => state.owned.add(u.id));
    }
    store.set(KEY.owned, [...state.owned]);
    paintMulti(row, coin);
    updateCounts();
    if (navigator.vibrate) navigator.vibrate(8);
  });

  let searchTimer;
  ui.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.prefs.q = ui.search.value; savePrefs(); render(); }, 120);
  });

  ui.chips.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-filter]');
    if (!b) return;
    state.prefs.filter = b.dataset.filter;
    savePrefs();
    render();
    window.scrollTo({ top: 0 });
  });

  ui.country.addEventListener('change', () => { state.prefs.country = ui.country.value; savePrefs(); render(); });
  ui.year.addEventListener('change', () => { state.prefs.year = ui.year.value; savePrefs(); render(); });
  ui.group.addEventListener('change', () => { state.prefs.group = ui.group.value; savePrefs(); render(); });
  $('#resetFilters').addEventListener('click', resetFilters);

  ui.filterBtn.addEventListener('click', () => {
    const open = ui.filters.hidden;
    ui.filters.hidden = !open;
    ui.filterBtn.setAttribute('aria-expanded', String(open));
    syncControls();
  });

  $('#bannerShow').addEventListener('click', () => {
    state.prefs.filter = 'new';
    savePrefs();
    render();
    window.scrollTo({ top: 0 });
  });
  $('#bannerOk').addEventListener('click', () => {
    state.newIds.forEach((id) => state.seen.add(id));
    store.set(KEY.seen, [...state.seen]);
    state.newIds = new Set();
    updateBanner();
    render();
  });

  /* ---------- Münzbilder ---------- */

  const zoomDlg = $('#zoomDlg');
  ui.list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-zoom]');
    if (!btn) return;
    e.preventDefault();
    const c = state.byId.get(btn.dataset.zoom);
    if (!c) return;
    const img = $('#zoomImg');
    const zs = $('#zoomSprite');
    const t = spriteAt('t', c.id), l = spriteAt('l', c.id);
    img.hidden = !!HOST;
    zs.hidden = !HOST;
    if (HOST && t && l) {
      // Erst die kleine Tafel (sofort da), darüber lädt das große Bild.
      zs.className = `zs th th${t.sheet}`;
      zs.style.backgroundPosition = t.pos;
      zs.setAttribute('aria-label', c.t);
      const big = $('#zoomSpriteL');
      big.style.backgroundImage = `url(${HOST.l.files[l.sheet]})`;
      big.style.backgroundPosition = l.pos;
    } else if (!HOST) {
      img.alt = c.t;
      img.src = `img/l/${c.id}.webp`;
    }
    $('#zoomTitle').textContent = c.t;
    $('#zoomMeta').textContent = `${c.flag} ${c.countryName} · ${c.when}${c.g ? ' · Gemeinschaftsausgabe' : ''}`;
    zoomDlg.showModal();
  });
  zoomDlg.addEventListener('click', () => zoomDlg.close());

  // Alle kleinen Münzbilder einmal laden, damit sie auch offline da sind (der Service Worker merkt sie sich).
  $('#imgBtn').addEventListener('click', async () => {
    const queue = state.coins.filter((c) => c.img).map((c) => c.id);
    const total = queue.length;
    let done = 0, failed = 0;
    ui.menu.close();
    toast(`Lade ${total} Münzbilder …`);
    const worker = async () => {
      while (queue.length) {
        const id = queue.pop();
        try { const r = await fetch(`img/t/${id}.webp`); if (!r.ok) failed++; } catch { failed++; }
        if (++done % 150 === 0) toast(`Münzbilder: ${done} / ${total}`);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    toast(failed ? `${total - failed} von ${total} Bildern gespeichert – bitte später erneut versuchen.` : `Alle ${total} Münzbilder sind jetzt auch offline da.`);
  });

  /* ---------- Eigene Münzen ---------- */

  const addDlg = $('#addDlg');
  $('#addBtn').addEventListener('click', () => {
    ui.menu.close();
    const select = $('#addCountry');
    select.replaceChildren(new Option('Land wählen …', ''));
    Object.entries(state.countries)
      .sort((a, b) => a[1].n.localeCompare(b[1].n, 'de'))
      .forEach(([k, v]) => select.append(new Option(`${v.f} ${v.n}`, k)));
    select.value = state.prefs.country || '';
    $('#addYear').value = '';
    $('#addTitle').value = '';
    $('#addOwned').checked = true;
    addDlg.showModal();
  });
  $('#addForm').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const c = $('#addCountry').value;
    const y = parseInt($('#addYear').value, 10);
    const t = $('#addTitle').value.trim();
    if (!c || !(y >= 2004 && y <= 2100) || !t) { toast('Bitte Land, Jahr und Motiv ausfüllen.'); return; }
    const id = `custom-${Date.now().toString(36)}`;
    state.custom.push({ id, c, y, t });
    store.set(KEY.custom, state.custom);
    if ($('#addOwned').checked) { state.owned.add(id); store.set(KEY.owned, [...state.owned]); }
    addDlg.close();
    compose();
    toast('Münze hinzugefügt.');
  });
  ui.list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-del]');
    if (!btn) return;
    e.preventDefault();
    if (!(await ask('Diese selbst hinzugefügte Münze entfernen?', 'Entfernen'))) return;
    const id = btn.dataset.del;
    state.custom = state.custom.filter((c) => c.id !== id);
    state.owned.delete(id);
    store.set(KEY.custom, state.custom);
    store.set(KEY.owned, [...state.owned]);
    compose();
  });

  $('#menuBtn').addEventListener('click', () => { updateMenuInfo(); ui.menu.showModal(); });
  $('#syncBtn').addEventListener('click', () => { ui.menu.close(); sync(true); });
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) { ui.menu.close(); importBackup(f); }
  });
  $('#resetBtn').addEventListener('click', async () => {
    if (!state.owned.size) { toast('Es ist noch nichts abgehakt.'); return; }
    ui.menu.close();
    if (!(await ask(`Wirklich alle ${state.owned.size} Häkchen löschen?\nTipp: Vorher eine Sicherung anlegen.`, 'Alle löschen'))) return;
    state.owned = new Set();
    store.set(KEY.owned, []);
    render();
  });

  document.addEventListener('visibilitychange', () => {
    if (!HOST && !document.hidden && Date.now() - store.get(KEY.synced, 0) > SYNC_EVERY_MS) sync();
  });
  window.addEventListener('resize', () => document.documentElement.style.setProperty('--head-h', `${ui.top.offsetHeight}px`));

  /* ---------- Start ---------- */

  if (HOST) {
    $('#syncBtn').hidden = true;
    $('#imgBtn').hidden = true;
    applyData(HOST.data);
    updateMenuInfo();
    cloud.connect();
  } else {
    const cached = store.get(KEY.data, null);
    if (isValidData(cached)) { applyData(cached); updateMenuInfo(); }
    sync();
  }

  if (!HOST && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
