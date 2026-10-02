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

  // Münzarten: 2 € (Gedenkmünzen aller Euro-Länder), 5 € (Kupfermünzen) und 25 € (Silber-Niob), beide aus Österreich.
  const CATS = [
    { k: 2, label: '2 €', title: '2 € Sondermünzen' },
    { k: 5, label: '5 €', title: '5 € Kupfermünzen' },
    { k: 25, label: '25 €', title: '25 € Silber-Niob' },
    { k: 1, label: 'Sätze', title: 'Kursmünzensätze' },
  ];
  // Ein Kursmünzensatz besteht aus acht Münzen, jede wird einzeln abgehakt.
  const DENOMS = [['1c', '1 Cent'], ['2c', '2 Cent'], ['5c', '5 Cent'], ['10c', '10 Cent'],
    ['20c', '20 Cent'], ['50c', '50 Cent'], ['1€', '1 Euro'], ['2€', '2 Euro']];

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const norm = (s) => s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/\p{M}/gu, '');

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
        return true;
      } catch {
        if (!storageWarned) { storageWarned = true; toast('Speichern nicht möglich – Häkchen gehen beim Schließen verloren.'); }
        return false;
      }
    },
  };

  const state = {
    credits: {},      // Bildnachweise (Wikimedia Commons), je Münz-ID
    base: null,
    coins: [],
    byId: new Map(),
    countries: {},
    updated: '',
    custom: store.get(KEY.custom, []),
    owned: new Set(store.get(KEY.owned, [])),
    seen: store.get(KEY.seen, null) && new Set(store.get(KEY.seen, [])),
    newIds: new Set(),
    prefs: Object.assign({ filter: 'all', country: '', year: '', group: 'year', q: '', cat: 2 }, store.get(KEY.prefs, {})),
  };

  if (!CATS.some((c) => c.k === state.prefs.cat)) state.prefs.cat = 2;

  const ui = {
    tabbar: $('#tabbar'), list: $('#list'), search: $('#search'), chips: $('#chips'), chipNew: $('#chipNew'),
    country: $('#country'), year: $('#year'), group: $('#group'),
    filterDlg: $('#filterDlg'), filterBtn: $('#filterBtn'), filterDot: $('#filterDot'),
    searchRow: $('#searchRow'), searchBtn: $('#searchBtn'), catTitle: $('#catTitle'), catSub: $('#catSub'),
    bar: $('#bar'), ringFill: $('#ringFill'), pct: $('#pct'), ownCount: $('#ownCount'), totalCount: $('#totalCount'),
    banner: $('#banner'), bannerText: $('#bannerText'),
    menu: $('#menu'), menuInfo: $('#menuInfo'), toast: $('#toast'), top: $('#top'),
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
    const units = c.k === 1
      ? DENOMS.map(([mark, city]) => ({ id: `${c.id}@${mark.replace('€', 'e')}`, mark, city }))
      : country.mm && !c.custom && !c.k
        ? Object.entries(country.mm).map(([mark, city]) => ({ id: `${c.id}@${mark}`, mark, city }))
        : null;
    return {
      id: c.id, c: c.c, y: c.y, m: c.m || 0, t: c.t, units, k: c.k || 2,
      g: c.g === 1, u: c.u === 1, custom: c.custom === true, img: c.i === 1,
      flag: country.f, countryName: country.n,
      when: c.k === 1 ? `ab ${c.y}` : month ? `${month} ${c.y}` : String(c.y),
      search: norm([country.n, c.c, c.y, month, c.t, c.g === 1 ? 'gemeinschaftsausgabe gemeinsame' : '',
        c.k === 1 ? 'satz kursmünzen' : '', c.custom ? 'eigene' : ''].join(' ')),
    };
  }

  // Quellenangabe für ein Foto (CC BY-SA verlangt Urheber, Lizenz und Hinweis auf Bearbeitung).
  function creditNode(id) {
    const c = state.credits[id];
    if (!c) return null;
    const lic = /^CC BY-SA (\d\.\d)$/.exec(c.l);
    const link = (href, text) => Object.assign(el('a', null, text), { href, target: '_blank', rel: 'noopener' });
    const p = el('p', 'muted small');
    p.append('Foto: ',
      link(`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(c.f.replace(/ /g, '_'))}`, c.a),
      ' · ',
      lic ? link(`https://creativecommons.org/licenses/by-sa/${lic[1]}/`, c.l) : c.l,
      ' · Wikimedia Commons · verkleinert, rund ausgeschnitten');
    return p;
  }

  async function loadCredits() {
    try {
      const res = await fetch('data/credits.json');
      if (res.ok) state.credits = await res.json();
    } catch { /* ohne Nachweis weiter: betrifft nur die Anzeige */ }
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

  const inCat = (c) => c.k === state.prefs.cat;
  // Gibt es in der Münzart nur ein Land (5 € und 25 €: Österreich), entfällt die Gruppierung „Je Land“.
  let singleCountry = false;
  let searchPending = false;
  let searchOpen = false;
  const groupMode = () => (state.prefs.cat === 1 ? 'country' : singleCountry ? 'year' : state.prefs.group);

  function groupStats(keyFn) {
    const map = new Map();
    for (const c of state.coins.filter(inCat)) {
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
    if (!inCat(c)) return false;
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
    const byCountry = groupMode() === 'country';
    const meta = el('span', 'meta', byCountry ? c.when : `${c.countryName} · ${c.when}`);
    if (c.g) meta.append(el('span', 'tag', 'Gemeinsam'));
    if (c.u) meta.append(el('span', 'tag tag-u', 'ungeprüft'));
    if (c.custom) meta.append(el('span', 'tag tag-own', 'Eigene'));
    return meta;
  }

  // Rundes Münzbild (antippen = vergrößern); ohne Bild die Landesflagge.
  function medalFor(c) {
    if (!c.img) {
      if (c.k === 2) return el('span', 'medal', c.flag);
      const m = el('span', `medal denom d${c.k}`);   // ohne Foto: Wert-Kachel in der Farbe der Münzart
      m.append(el('b', null, c.k === 1 ? '€' : `${c.k} €`), el('span', 'flag-badge', c.flag));
      return m;
    }
    const b = el('button', 'medal img');
    b.type = 'button';
    b.dataset.zoom = c.id;
    b.setAttribute('aria-label', `Münzbild vergrößern: ${c.t}`);
    const pic = el('img');
    pic.src = `img/t/${c.id}.webp`;
    pic.alt = '';
    pic.width = 54;
    pic.height = 54;
    pic.loading = 'lazy';
    pic.decoding = 'async';
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
    mints.setAttribute('aria-label', c.k === 1 ? 'Münzen des Satzes' : 'Prägestätten');
    for (const u of c.units) {
      const b = el('button', 'mint', u.mark);
      b.type = 'button';
      b.dataset.unit = u.id;
      b.title = u.city;
      b.setAttribute('aria-label', c.k === 1 ? u.city : `Prägestätte ${u.mark} (${u.city})`);
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
    const byYear = groupMode() === 'year';
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
    const filterName = { all: 'Alle', owned: 'Hab ich', missing: 'Fehlen', new: 'Neu' }[p.filter];
    const extra = [p.year, p.country && state.countries[p.country]?.n, p.q.trim() && `„${p.q.trim()}“`].filter(Boolean);
    const noun = p.cat === 1 ? (coins.length === 1 ? 'Satz' : 'Sätze') : (coins.length === 1 ? 'Münze' : 'Münzen');
    ui.catSub.textContent = [filterName, ...extra, `${coins.length} ${noun}`].join(' · ');
    updateCounts();
    syncControls();
  }

  function catStats() {
    const stats = new Map(CATS.map((c) => [c.k, { n: 0, own: 0 }]));
    for (const c of state.coins) {
      const s = stats.get(c.k);
      if (s) { s.n += unitCount(c); s.own += ownedCount(c); }
    }
    return stats;
  }

  function updateCounts() {
    const stats = catStats();
    const { n: total, own } = stats.get(state.prefs.cat);
    for (const c of CATS) {
      const s = stats.get(c.k);
      ui.tabbar.querySelector(`.tab[data-cat="${c.k}"] small`).textContent = `${s.own} / ${s.n}`;
    }
    const pct = total ? Math.round((own / total) * 100) : 0;
    ui.ownCount.textContent = String(own);
    ui.totalCount.textContent = String(total);
    ui.pct.textContent = `${pct} %`;
    ui.ringFill.style.strokeDasharray = `${total ? (own / total) * 100 : 0} 100`;
    ui.ringFill.style.opacity = own ? '1' : '0';   // bei 0 keinen Punkt zeigen
    ui.bar.setAttribute('aria-valuenow', String(pct));
    const tile = (f, n) => { ui.chips.querySelector(`[data-filter="${f}"] .n`).textContent = String(n); };
    tile('all', total);
    tile('owned', own);
    tile('missing', total - own);

    const byYear = groupMode() === 'year';
    const groups = groupStats((c) => (byYear ? c.y : c.c));
    ui.list.querySelectorAll('[data-gk]').forEach((node) => {
      const s = groups.get(byYear ? Number(node.dataset.gk) : node.dataset.gk);
      if (s) node.textContent = `${s.own} / ${s.n}`;
    });
  }

  function updateBanner() {
    const n = state.newIds.size;
    const newIn = (k) => [...state.newIds].filter((id) => state.byId.get(id)?.k === k).length;
    const here = newIn(state.prefs.cat);
    ui.chipNew.hidden = here === 0;
    ui.chipNew.querySelector('.n').textContent = String(here);
    ui.banner.hidden = n === 0;
    for (const c of CATS) ui.tabbar.querySelector(`.tab[data-cat="${c.k}"] .dot`).hidden = newIn(c.k) === 0;
    if (n) ui.bannerText.textContent = n === 1 ? '1 neue Münze in der Liste!' : `${n} neue Münzen in der Liste!`;
    if (!here && state.prefs.filter === 'new') { state.prefs.filter = 'all'; savePrefs(); render(); }
  }

  function updateMenuInfo() {
    const d = state.updated ? new Date(state.updated).toLocaleDateString('de-DE') : '–';
    const own = state.custom.length ? ` (davon ${state.custom.length} eigene)` : '';
    const units = state.coins.reduce((n, c) => n + unitCount(c), 0);
    const mints = units !== state.coins.length ? ` · ${units} Stück inkl. Prägestätten` : '';
    const perCat = CATS.map((c) => `${c.label}: ${state.coins.filter((x) => x.k === c.k).length}`).join(' · ');
    ui.menuInfo.textContent = `Liste vom ${d} · ${state.coins.length} Münzen (${perCat})${own}${mints}`;
  }

  function buildSelects() {
    const inThisCat = state.coins.filter(inCat);
    const codes = new Set(inThisCat.map((c) => c.c));
    singleCountry = codes.size <= 1;
    $('#countryField').hidden = singleCountry;
    $('#groupField').hidden = singleCountry || state.prefs.cat === 1;   // Sätze stehen immer nach Land
    $('#yearField').hidden = state.prefs.cat === 1;
    const countries = Object.entries(state.countries)
      .filter(([k]) => codes.has(k))
      .sort((a, b) => a[1].n.localeCompare(b[1].n, 'de'));
    const fill = (select, firstLabel, groups) => {
      select.replaceChildren(new Option(firstLabel, ''));
      for (const [label, opts] of groups) {
        if (label && !opts.length) continue;
        const parent = label ? Object.assign(el('optgroup'), { label }) : select;
        for (const [value, text] of opts) parent.append(new Option(text, value));
        if (label) select.append(parent);
      }
    };
    const eu = countries.filter(([, v]) => !v.s).map(([k, v]) => [k, `${v.f} ${v.n}`]);
    const small = countries.filter(([, v]) => v.s).map(([k, v]) => [k, `${v.f} ${v.n}`]);
    fill(ui.country, 'Alle Länder', [['Euro-Länder', eu], ['Kleinstaaten mit Euro', small]]);
    const years = [...new Set(inThisCat.map((c) => c.y))].sort((a, b) => b - a).map((y) => [String(y), String(y)]);
    fill(ui.year, 'Alle Jahre', [['', years]]);
    if (!codes.has(state.prefs.country)) state.prefs.country = '';
    if (!years.some(([y]) => y === state.prefs.year)) state.prefs.year = '';
  }

  function syncControls() {
    const p = state.prefs;
    if (!searchPending) ui.search.value = p.q;   // Eingabe nicht überschreiben, solange sie noch verarbeitet wird
    ui.country.value = p.country;
    ui.year.value = p.year;
    ui.group.value = p.group;
    ui.chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === p.filter)));
    ui.filterDot.hidden = !(p.country || p.year);
    ui.catTitle.textContent = CATS.find((c) => c.k === p.cat).title;
    ui.searchRow.hidden = !(searchOpen || p.q);
    ui.searchBtn.setAttribute('aria-expanded', String(!ui.searchRow.hidden));
    document.documentElement.dataset.cat = String(p.cat);
    ui.tabbar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.cat) === p.cat)));
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

  // Alle Fenster über showDialog öffnen: Solange eines offen ist, wird „Ziehen zum Neuladen“ abgeschaltet,
  // und ein Tipp neben das Fenster (auf den abgedunkelten Bereich) schließt es.
  function showDialog(d) {
    document.documentElement.classList.add('modal-open');
    d.showModal();
  }
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) document.documentElement.classList.remove('modal-open');
    });
    d.addEventListener('click', (e) => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (outside) d.close();
    });
  });

  // Filterfenster am Griff nach unten wegziehen.
  (() => {
    const sheet = $('#filterDlg');
    const head = $('#sheetHead');
    let startY = 0, lastY = 0, lastT = 0, speed = 0, dragging = false;
    const move = (y) => sheet.style.setProperty('transform', `translateY(${Math.max(0, y - startY)}px)`);
    head.addEventListener('pointerdown', (e) => {
      dragging = true;
      startY = lastY = e.clientY; lastT = e.timeStamp; speed = 0;
      sheet.classList.remove('settle');
      sheet.classList.add('dragging');
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dt = Math.max(1, e.timeStamp - lastT);
      speed = (e.clientY - lastY) / dt;   // Pixel je Millisekunde
      lastY = e.clientY; lastT = e.timeStamp;
      move(e.clientY);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove('dragging');
      sheet.classList.add('settle');
      const dy = lastY - startY;
      if (dy > 90 || (dy > 30 && speed > 0.5)) {
        sheet.style.setProperty('transform', 'translateY(100%)');
        setTimeout(() => { sheet.close(); sheet.style.removeProperty('transform'); sheet.classList.remove('settle'); }, 200);
      } else {
        sheet.style.removeProperty('transform');
      }
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  })();

  // Eigener Bestätigungsdialog (confirm() wird in eingebetteten Ansichten nicht angezeigt).
  const askDlg = $('#askDlg');
  function ask(message, yes = 'Ja') {
    return new Promise((resolve) => {
      $('#askText').textContent = message;
      $('#askYes').textContent = yes;
      askDlg.returnValue = '';
      askDlg.addEventListener('close', () => resolve(askDlg.returnValue === 'yes'), { once: true });
      showDialog(askDlg);
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
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Münzalbum – Sicherung' }); return; }
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
        && state.countries[c.c] && Number.isInteger(c.y) && typeof c.t === 'string' && !haveCustom.has(c.id)
        && (c.k === undefined || c.k === 1 || c.k === 5 || c.k === 25));
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
    searchPending = true;
    searchTimer = setTimeout(() => { searchPending = false; state.prefs.q = ui.search.value; savePrefs(); render(); }, 120);
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

  ui.filterBtn.addEventListener('click', () => { syncControls(); showDialog(ui.filterDlg); });

  // Suche klappt in der Kopfzeile auf; „Fertig“ leert sie und klappt sie wieder zu.
  ui.searchBtn.addEventListener('click', () => {
    searchOpen = ui.searchRow.hidden;
    syncControls();
    if (searchOpen) ui.search.focus();
  });
  $('#searchClose').addEventListener('click', () => {
    searchOpen = false;
    clearTimeout(searchTimer);
    searchPending = false;
    state.prefs.q = '';
    savePrefs();
    render();
  });

  function setCategory(k) {
    state.prefs.cat = k;
    Object.assign(state.prefs, { country: '', year: '' });   // Land und Jahr gelten je Münzart
    buildSelects();
  }

  ui.tabbar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (!b) return;
    const k = Number(b.dataset.cat);
    if (k === state.prefs.cat) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setCategory(k);
    savePrefs();
    updateBanner();
    render();
    window.scrollTo({ top: 0 });
  });

  $('#bannerShow').addEventListener('click', () => {
    // Zur ersten Münzart mit neuen Münzen wechseln (die aktuelle zuerst).
    const k = [state.prefs.cat, ...CATS.map((c) => c.k)].find((x) => [...state.newIds].some((id) => state.byId.get(id)?.k === x));
    if (k !== undefined && k !== state.prefs.cat) setCategory(k);
    state.prefs.filter = 'new';
    savePrefs();
    updateBanner();
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
    img.alt = c.t;
    img.src = `img/l/${c.id}.webp`;
    $('#zoomTitle').textContent = c.t;
    $('#zoomMeta').textContent = `${c.flag} ${c.countryName} · ${c.when}${c.g ? ' · Gemeinschaftsausgabe' : ''}`;
    $('#zoomCredit').replaceChildren(...[creditNode(c.id)].filter(Boolean));
    showDialog(zoomDlg);
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
    select.value = state.prefs.country || (state.prefs.cat !== 2 ? 'AT' : '');
    $('#addCat').value = String(state.prefs.cat);
    $('#addYear').value = '';
    $('#addTitle').value = '';
    $('#addOwned').checked = true;
    showDialog(addDlg);
  });
  $('#addForm').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const c = $('#addCountry').value;
    const y = parseInt($('#addYear').value, 10);
    const t = $('#addTitle').value.trim();
    if (!c || !(y >= 2002 && y <= 2100) || !t) { toast('Bitte Land, Jahr und Motiv ausfüllen.'); return; }
    const id = `custom-${Date.now().toString(36)}`;
    const k = Number($('#addCat').value) || 2;
    state.custom.push(k === 2 ? { id, c, y, t } : { id, c, y, t, k });
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

  $('#menuBtn').addEventListener('click', () => { updateMenuInfo(); showDialog(ui.menu); });
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
    if (!document.hidden && Date.now() - store.get(KEY.synced, 0) > SYNC_EVERY_MS) sync();
  });
  window.addEventListener('resize', () => document.documentElement.style.setProperty('--head-h', `${ui.top.offsetHeight}px`));

  /* ---------- Start ---------- */

  loadCredits();
  const cached = store.get(KEY.data, null);
  if (isValidData(cached)) { applyData(cached); updateMenuInfo(); }
  sync();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
