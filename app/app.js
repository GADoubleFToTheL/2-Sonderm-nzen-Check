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

  let storageWarned = false;
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch {
        if (!storageWarned) { storageWarned = true; toast('Speichern nicht möglich – Häkchen gehen beim Schließen verloren.'); }
        return false;
      }
    },
  };

  const state = {
    base: null,
    coins: [],
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
    menu: $('#menu'), menuInfo: $('#menuInfo'), toast: $('#toast'), top: $('#top'),
  };

  /* ---------- Daten ---------- */

  function isValidData(d) {
    return d && typeof d === 'object' && d.countries && Array.isArray(d.coins) && d.coins.length > 0
      && d.coins.every((c) => c && typeof c.id === 'string' && d.countries[c.c] && Number.isInteger(c.y) && typeof c.t === 'string');
  }

  function toCoin(c, countries) {
    const country = countries[c.c];
    const month = c.m ? MONTHS[c.m - 1] : '';
    return {
      id: c.id, c: c.c, y: c.y, m: c.m || 0, t: c.t,
      g: c.g === 1, u: c.u === 1, custom: c.custom === true,
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
      s.n++;
      if (state.owned.has(c.id)) s.own++;
      map.set(k, s);
    }
    return map;
  }

  function matches(c) {
    const p = state.prefs;
    const has = state.owned.has(c.id);
    if (p.filter === 'missing' && has) return false;
    if (p.filter === 'owned' && !has) return false;
    if (p.filter === 'new' && !state.newIds.has(c.id)) return false;
    if (p.country && c.c !== p.country) return false;
    if (p.year && String(c.y) !== p.year) return false;
    const q = norm(p.q.trim());
    if (q && !q.split(/\s+/).every((w) => c.search.includes(w))) return false;
    return true;
  }

  function coinRow(c) {
    const li = el('li');
    const label = el('label', 'coin');
    const input = el('input');
    input.type = 'checkbox';
    input.dataset.id = c.id;
    input.checked = state.owned.has(c.id);

    const medal = el('span', 'medal', c.flag);
    const info = el('span', 'info');
    info.append(el('span', 'title', c.t));
    const byCountry = state.prefs.group === 'country';
    const meta = el('span', 'meta', byCountry ? c.when : `${c.countryName} · ${c.when}`);
    if (c.g) meta.append(el('span', 'tag', 'Gemeinsam'));
    if (c.u) meta.append(el('span', 'tag tag-u', 'ungeprüft'));
    if (c.custom) meta.append(el('span', 'tag tag-own', 'Eigene'));
    info.append(meta);

    label.append(input, medal, info);
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
    const total = state.coins.length;
    const own = state.coins.reduce((n, c) => n + (state.owned.has(c.id) ? 1 : 0), 0);
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
    ui.menuInfo.textContent = `Liste vom ${d} · ${state.coins.length} Münzen${own}`;
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
      const known = new Set(state.coins.map((c) => c.id));
      const haveCustom = new Set(state.custom.map((c) => c.id));
      const custom = (Array.isArray(data.custom) ? data.custom : []).filter((c) => c && typeof c.id === 'string'
        && state.countries[c.c] && Number.isInteger(c.y) && typeof c.t === 'string' && !haveCustom.has(c.id));
      const fresh = data.owned.filter((id) => (known.has(id) || custom.some((c) => c.id === id)) && !state.owned.has(id)).length;
      if (!confirm(`${data.owned.length} Münzen in der Sicherung, davon ${fresh} neu für dieses Gerät.\nMit deiner Sammlung zusammenführen?`)) return;
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
  ui.list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-del]');
    if (!btn) return;
    e.preventDefault();
    if (!confirm('Diese selbst hinzugefügte Münze entfernen?')) return;
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
  $('#resetBtn').addEventListener('click', () => {
    if (!state.owned.size) { toast('Es ist noch nichts abgehakt.'); return; }
    if (!confirm(`Wirklich alle ${state.owned.size} Häkchen löschen?\nTipp: Vorher eine Sicherung anlegen.`)) return;
    state.owned = new Set();
    store.set(KEY.owned, []);
    ui.menu.close();
    render();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - store.get(KEY.synced, 0) > SYNC_EVERY_MS) sync();
  });
  window.addEventListener('resize', () => document.documentElement.style.setProperty('--head-h', `${ui.top.offsetHeight}px`));

  /* ---------- Start ---------- */

  const cached = store.get(KEY.data, null);
  if (isValidData(cached)) { applyData(cached); updateMenuInfo(); }
  sync();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
