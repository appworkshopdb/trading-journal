// Einstiegspunkt: Adapter wählen, Daten laden, Topbar binden, Aktionen definieren, rendern.

import { state, setState, subscribe } from './state.js';
import { createAdapter } from './data/index.js';
import { startAuthBg, stopAuthBg } from './authbg.js';
import { renderCalendar } from './calendar.js';
import { renderSidebar } from './sidebar.js';
import { renderDayModal } from './daymodal.js';
import { initSplitter } from './splitter.js';
import { MONTHS, MONTHS_SHORT, MARKETS, todayISO, uid, isMonthKey, fmtBytes, hasFieldValues } from './utils.js';

const $ = (id) => document.getElementById(id);
let db; // Daten-Adapter (siehe js/data/index.js)

// ---------------------------------------------------------------- Laden

let loadingAll = false;

async function ensureYear(year) {
  const key = String(year);
  if (state.loadedRanges.has(key)) return;
  const rows = await db.getDays(`${year}-01-01`, `${year}-12-31`, state.market);
  for (const r of rows) state.days[r.date] = r;
  state.loadedRanges.add(key);
}

async function loadAll() {
  state.days = {};
  state.loadedRanges = new Set();
  const [notes, checklists, fieldTemplate, monthFieldTemplate] = await Promise.all([db.listNotes(), db.listChecklists(), db.getFieldTemplate('day'), db.getFieldTemplate('month')]);
  await ensureYear(state.year);
  const threshold = checklists.find((c) => c.threshold != null)?.threshold ?? 85;
  setState({ notes, checklists, threshold, fieldTemplate, monthFieldTemplate });
  refreshAvatar(true);
}

// ---------------------------------------------------------------- Speichern (mit Statusanzeige)

let statusTimer;
function setStatus(text, isError = false) {
  const el = $('saveStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', isError);
  clearTimeout(statusTimer);
  if (!isError) statusTimer = setTimeout(() => { el.textContent = ''; }, 1500);
}

async function persist(work) {
  setStatus('Speichern …');
  try { const r = await work(); setStatus('Gespeichert ✓'); return r; }
  catch (e) { console.error(e); setStatus('Fehler: ' + (e.message || e), true); throw e; }
}

const isEmptyDay = (d) => d.pnl == null && !(d.note || '').trim() && !(d.tags || []).length && !(d.images || []).length && !hasFieldValues(d.fields) && !(d.trades || []).length;

// ---------------------------------------------------------------- Aktionen (werden an die Renderer gereicht)

const actions = {
  // Navigation
  // Tag antippen -> Popup (Gewinn/Verlust/Notiz/Farbe); "Öffnen" in der Zelle -> Detailbereich rechts
  openPopup(iso) { setState(isMonthKey(iso) ? { popupDate: iso } : { selectedDate: iso, popupDate: iso }, ['calendar', 'modal']); },
  closePopup() { setState({ popupDate: null }, ['modal']); },
  async savePopup(iso, patch) { actions.closePopup(); await actions.updateDay(iso, patch); },
  async clearPopup(iso) { actions.closePopup(); await actions.clearDay(iso); },
  // Handy: "Öffnen" im Popup speichert die Eingaben und wechselt direkt in den Detailbereich des Tages
  async savePopupAndOpen(iso, patch) {
    const hasData = state.days[iso] || patch.pnl != null || (patch.trades || []).length || (patch.note || '').trim();
    actions.closePopup();
    const saving = hasData ? actions.updateDay(iso, patch) : null; // aktualisiert den State sofort, speichert im Hintergrund
    actions.openDetail(iso);
    await saving;
  },
  openDetail(iso) { setState(isMonthKey(iso) ? { detailDate: iso, popupDate: null } : { selectedDate: iso, detailDate: iso, popupDate: null }); },
  closeDetail() { setState({ detailDate: null }); },
  refreshSidebar(focusField = null) { setState({ focusField }, ['sidebar']); },
  openMonth(y, m) { setState({ view: 'month', year: y, month: m }); },
  async setView(view) { setState({ view, detailDate: null, popupDate: null }); },
  async setYear(year) { await ensureYear(year); setState({ year }); },
  async step(dir) {
    if (state.view === 'year') return actions.setYear(state.year + dir);
    let m = state.month + dir, y = state.year;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    await ensureYear(y);
    setState({ year: y, month: m });
  },
  async goToday() {
    const t = new Date();
    await ensureYear(t.getFullYear());
    setState({ year: t.getFullYear(), month: t.getMonth(), selectedDate: todayISO() });
  },
  // Bilder-Tab zeigt Bilder aus ALLEN Jahren: fehlende Jahre einmalig nachladen (vorhandene Einträge bleiben unangetastet)
  async loadAllImages() {
    if (loadingAll || state.loadedRanges.has('all')) return;
    loadingAll = true;
    const market = state.market;
    try {
      const rows = await db.getDays('0000-01-01', '9999-12-31', market);
      if (market !== state.market) return;
      for (const r of rows) if (!state.days[r.date]) state.days[r.date] = r;
    } catch (e) { console.error(e); setStatus('Fehler: ' + (e.message || e), true); }
    finally { loadingAll = false; state.loadedRanges.add('all'); } // auch bei Fehler, sonst würde jedes Rendern neu laden
    setState({}, ['sidebar']);
  },
  setSideTab(tab) { setState({ sideTab: tab, detailDate: null, editingChecklist: null, openChecklist: null }); },

  // Kopfmenü: Seite/Markt wechseln, Menüs, Farbmodus
  async navigate({ page = 'calendar', market = null, scope = null }) {
    const patch = { page, menu: null, detailDate: null, popupDate: null };
    if (page === 'calendar') {
      if (market && market !== state.market) {
        state.market = market; // Tages-/Monatseinträge sind pro Markt getrennt: Cache leeren und neu laden
        state.days = {};
        state.loadedRanges = new Set();
        try { localStorage.setItem('tj.market', market); } catch { /* ohne Speicher weiter */ }
        await ensureYear(state.year);
      }
    } else {
      patch.analysisScope = scope;
    }
    setState(patch);
  },
  toggleMenu(which) {
    const open = state.menu !== which;
    setState({ menu: open ? which : null }, ['topbar']);
    if (open && which === 'profile') { loadUsage(); refreshAvatar(true); }
  },
  async setAvatar(file) {
    if (!file) return;
    try { await persist(() => db.setAvatar(file)); await refreshAvatar(true); } catch { /* Fehler steht in der Statusanzeige */ }
  },
  async removeAvatar() {
    try { await persist(() => db.removeAvatar()); await refreshAvatar(true); } catch { /* s. o. */ }
  },
  // Vorlage der Auswertungsfelder: je Ansicht eine eigene (kind 'day' = alle Tage, 'month' = alle Monate); nur Namen + Reihenfolge, die Werte stehen je Eintrag
  async saveFieldTemplate(tpl, kind = 'day') {
    state[kind === 'month' ? 'monthFieldTemplate' : 'fieldTemplate'] = tpl; // in place geändert, kein Re-Render (sonst verliert das Eingabefeld den Fokus)
    await persist(() => db.saveFieldTemplate(tpl, kind));
  },
  async changePassword(pw) { await persist(() => db.changePassword(pw)); },
  closeMenu() { if (state.menu) setState({ menu: null }, ['topbar']); },
  setTheme(theme) {
    try { localStorage.setItem('tj.theme', theme); } catch { /* ohne Speicher weiter */ }
    setState({ theme }, ['topbar']);
  },
  signOut() { actions.closeMenu(); db.signOut(); },

  // Tage
  async updateDay(iso, patch) {
    const market = state.market;
    const merged = { date: iso, pnl: null, note: '', note_color: null, tags: [], trades: [], images: [], fields: {}, ...(state.days[iso] || {}), ...patch };
    if (isEmptyDay(merged)) {
      delete state.days[iso];
      setState({}, ['calendar']);
      await persist(() => db.deleteDay(iso, market));
      return;
    }
    state.days[iso] = merged;
    setState({}, ['calendar']);
    const saved = await persist(() => db.saveDay(merged, market));
    // Nur Server-Metadaten übernehmen – Inhalte könnten inzwischen weiter bearbeitet worden sein
    if (saved && state.days[iso]) state.days[iso].updated_at = saved.updated_at;
  },
  async clearDay(iso) {
    const entry = state.days[iso];
    if (entry?.images?.length) await Promise.allSettled(entry.images.map((i) => db.deleteImage(i.path)));
    delete state.days[iso];
    await persist(() => db.deleteDay(iso, state.market));
    setState({});
  },
  async addImages(iso, files) {
    const entry = state.days[iso] || { date: iso, pnl: null, note: '', note_color: null, tags: [], images: [], fields: {} };
    const market = state.market;
    const uploaded = [];
    await persist(async () => { for (const f of files) uploaded.push(await db.uploadImage(iso, f, market)); });
    const merged = { ...entry, images: [...(entry.images || []), ...uploaded] };
    state.days[iso] = merged;
    await persist(() => db.saveDay(merged, market));
    setState({});
  },
  async removeImage(iso, img) {
    const entry = state.days[iso];
    if (!entry) return;
    await persist(() => db.deleteImage(img.path));
    await actions.updateDay(iso, { images: entry.images.filter((i) => i.id !== img.id) });
    setState({}, ['sidebar']);
  },
  imageUrl: (path) => db.imageUrl(path),
  openLightbox(src) {
    if (!src) return;
    $('lightbox').querySelector('img').src = src;
    $('lightbox').classList.remove('hidden');
  },

  // Notizen
  async newNote() {
    const note = { id: uid(), title: '', body: '', pinned: false, created_at: new Date().toISOString() };
    const saved = await persist(() => db.saveNote(note));
    state.notes.unshift(saved || note);
    setState({ activeNoteId: note.id });
  },
  openNote(id) { setState({ activeNoteId: id }); },
  closeNote() { setState({ activeNoteId: null }); },
  async updateNote(id, patch, rerender = false) {
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    Object.assign(note, patch); // in place: der Editor hält eine Referenz auf dieses Objekt
    if (rerender) setState({}, ['sidebar']);
    const saved = await persist(() => db.saveNote(note));
    if (saved) Object.assign(note, { updated_at: saved.updated_at, created_at: saved.created_at });
  },
  async deleteNote(id) {
    await persist(() => db.deleteNote(id));
    setState({ notes: state.notes.filter((n) => n.id !== id), activeNoteId: null });
  },

  // Checklisten
  async newChecklist() {
    const cl = { id: uid(), title: '', items: [], threshold: state.threshold, position: state.checklists.length, created_at: new Date().toISOString() };
    const saved = await persist(() => db.saveChecklist(cl));
    // Neue Liste öffnet direkt in der Bearbeitungsansicht, Fokus auf dem Titel
    setState({ checklists: [...state.checklists, saved || cl], focusTitle: cl.id, editingChecklist: cl.id, openChecklist: cl.id });
  },
  // Globaler Richtwert (%): wird an allen Listen gespeichert, damit er auf allen Geräten gleich ist
  async setThreshold(value) {
    const t = Math.max(0, Math.min(100, Math.round(Number(value))));
    if (!Number.isFinite(t)) return setState({}, ['sidebar']);
    state.threshold = t;
    for (const cl of state.checklists) cl.threshold = t;
    setState({}, ['sidebar']);
    await persist(async () => { for (const cl of state.checklists) await db.saveChecklist(cl); });
  },
  openChecklist(id) { setState({ openChecklist: id, editingChecklist: null }, ['sidebar']); },
  editChecklist(id) { setState({ editingChecklist: id }, ['sidebar']); },
  async updateChecklist(id, patch, rerender = false, focusId = null) {
    const cl = state.checklists.find((c) => c.id === id);
    if (!cl) return;
    Object.assign(cl, patch); // in place, siehe updateNote
    if (rerender) setState({ focusChecklist: focusId }, ['sidebar']);
    const saved = await persist(() => db.saveChecklist(cl));
    if (saved) Object.assign(cl, { updated_at: saved.updated_at, created_at: saved.created_at });
  },
  async deleteChecklist(id) {
    await persist(() => db.deleteChecklist(id));
    setState({ checklists: state.checklists.filter((c) => c.id !== id), openChecklist: null, editingChecklist: null });
  },
};

// ---------------------------------------------------------------- Topbar

function applyTheme() {
  document.documentElement.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
  const meta = $('metaTheme');
  if (meta) meta.content = state.theme === 'light' ? '#ffffff' : '#000000';
}

const el = (tag, cls, text, attrs = {}) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e[k] = v;
  return e;
};

// ---- Profilbild + Speicheranzeige (Profilmenü) ----
let avatarCache = { path: null, url: null };
async function refreshAvatar(force = false) {
  const path = db.getAvatarPath?.() || null;
  if (!force && path === avatarCache.path) return;
  let url = null;
  if (path) { try { url = await db.imageUrl(path); } catch { url = null; } } // Supabase: signierte URL, läuft nach 1 h ab
  avatarCache = { path, url };
  setState({}, ['topbar']);
}

let usage = null; // { ...Werte } | { error } | null (lädt)
async function loadUsage() {
  try { usage = await db.getUsage(); } catch (e) { console.error(e); usage = { error: true }; }
  if (state.menu === 'profile') renderMenus();
}

let pwOpen = false; // Formular "Passwort ändern" im Profilmenü sichtbar

function usageBlock() {
  const wrap = el('div', 'usage');
  wrap.append(el('div', 'menu-label', 'Speicher'));
  if (!usage) { wrap.append(el('div', 'profile-note', 'Lädt …')); return wrap; }
  if (usage.error) { wrap.append(el('div', 'profile-note', 'Nicht verfügbar. Bitte supabase/schema.sql einmal erneut im SQL Editor ausführen.')); return wrap; }
  const bar = (used, limit) => {
    const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
    const b = el('div', `usage-bar${pct >= 90 ? ' full' : ''}`);
    b.append(el('div', 'usage-fill', null, { style: `width:${pct.toFixed(1)}%` }));
    return b;
  };
  wrap.append(el('div', 'usage-row', `${usage.images} Bild${usage.images === 1 ? '' : 'er'} hochgeladen`));
  wrap.append(bar(usage.bytes, usage.limitBytes));
  const free = Math.max(0, usage.limitBytes - usage.bytes);
  wrap.append(el('div', 'profile-note', `${fmtBytes(usage.bytes)} von ${fmtBytes(usage.limitBytes)} belegt · ${fmtBytes(free)} frei${usage.local ? ' (Browser-Speicher dieses Geräts)' : ''}`));
  if (usage.dbBytes != null) {
    wrap.append(el('div', 'usage-row', 'Datenbank'));
    wrap.append(bar(usage.dbBytes, usage.dbLimitBytes));
    wrap.append(el('div', 'profile-note', `${fmtBytes(usage.dbBytes)} von ${fmtBytes(usage.dbLimitBytes)} belegt`));
  }
  return wrap;
}

function passwordBlock() {
  const wrap = el('div', 'pw-block');
  if (!pwOpen) {
    const b = el('button', 'menu-item', 'Passwort ändern', { onclick: () => { pwOpen = true; renderMenus(); } });
    b.setAttribute('role', 'menuitem');
    wrap.append(b);
    return wrap;
  }
  const input = el('input', 'pw-input', null, { type: 'password', placeholder: 'Neues Passwort (mind. 6 Zeichen)', autocomplete: 'new-password' });
  input.setAttribute('aria-label', 'Neues Passwort');
  const eye = el('button', 'pw-eye', 'Anzeigen', { type: 'button' }); // Passwort ist standardmäßig verdeckt
  eye.onclick = () => { const show = input.type === 'password'; input.type = show ? 'text' : 'password'; eye.textContent = show ? 'Verbergen' : 'Anzeigen'; };
  const msg = el('div', 'profile-note');
  const save = el('button', 'primary small', 'Speichern', { type: 'button' });
  save.onclick = async () => {
    if (input.value.length < 6) { msg.textContent = 'Mindestens 6 Zeichen.'; msg.className = 'profile-note err'; return; }
    try { await actions.changePassword(input.value); pwOpen = false; renderMenus(); }
    catch (e) { msg.textContent = e.message || 'Fehler beim Ändern.'; msg.className = 'profile-note err'; }
  };
  const cancel = el('button', 'text-btn', 'Abbrechen', { type: 'button', onclick: () => { pwOpen = false; renderMenus(); } });
  const row = el('div', 'pw-row'); row.append(input, eye);
  const btns = el('div', 'pw-btns'); btns.append(cancel, save);
  wrap.append(row, msg, btns);
  return wrap;
}

function renderMenus() {
  const onCalendar = state.page === 'calendar';
  const item = (label, active, onClick, cls = 'menu-item') => {
    const b = el('button', `${cls}${active ? ' active' : ''}`, label, { onclick: onClick });
    b.setAttribute('role', 'menuitem');
    return b;
  };
  const main = $('mainMenu');
  const children = [];
  for (const mk of MARKETS) {
    children.push(item(mk, onCalendar && state.market === mk, () => actions.navigate({ page: 'calendar', market: mk })));
    children.push(item('Auswertungen', !onCalendar && state.analysisScope === mk, () => actions.navigate({ page: 'analysis', scope: mk }), 'menu-item sub'));
  }
  children.push(el('div', 'menu-sep'));
  const theme = el('div', 'menu-theme');
  const seg = el('div', 'seg');
  for (const [id, label] of [['light', 'Hell'], ['dark', 'Dunkel']]) {
    const b = el('button', state.theme === id ? 'active' : '', label, { onclick: () => actions.setTheme(id) });
    b.title = `Farbmodus: ${label}`;
    b.setAttribute('aria-pressed', String(state.theme === id));
    seg.append(b);
  }
  theme.append(seg);
  children.push(theme);
  main.replaceChildren(...children);
  main.classList.toggle('hidden', state.menu !== 'main');
  $('btnMenu').setAttribute('aria-expanded', String(state.menu === 'main'));

  // Profil: Zugangsdaten (E-Mail) und Abmelden
  const info = db.getUserInfo?.() || null;
  const email = info?.email || state.user?.email || '';
  const initial = (email || '?').trim().charAt(0).toUpperCase();
  const fillAvatar = (node) => {
    node.replaceChildren();
    if (avatarCache.url) node.append(el('img', 'avatar-img', null, { src: avatarCache.url, alt: '' }));
    else node.textContent = initial;
  };
  fillAvatar($('btnProfile'));
  const prof = $('profileMenu');
  const big = el('div', 'avatar big'); fillAvatar(big);
  const file = el('input', 'hidden', null, { type: 'file', accept: 'image/*' });
  file.onchange = () => { actions.setAvatar(file.files[0]); file.value = ''; };
  // Profilbild antippen -> Auswahl: Bild hinzufügen/tauschen oder löschen. Der kleine Stift am Rand zeigt, dass es bearbeitbar ist.
  const picActions = el('div', 'profile-pics hidden');
  picActions.append(el('button', 'text-btn', avatarCache.url ? 'Bild tauschen' : 'Bild hinzufügen', { onclick: () => file.click() }));
  if (avatarCache.url) picActions.append(el('button', 'text-btn danger', 'Bild löschen', { onclick: () => { if (confirm('Profilbild löschen?')) actions.removeAvatar(); } }));
  const editBtn = el('button', 'avatar-edit', null, { type: 'button', title: 'Profilbild bearbeiten', 'aria-label': 'Profilbild bearbeiten' });
  editBtn.setAttribute('aria-expanded', 'false');
  editBtn.append(big, el('span', 'avatar-pen', null, { 'aria-hidden': 'true' }));
  editBtn.lastChild.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
  editBtn.onclick = () => { const open = picActions.classList.toggle('hidden') === false; editBtn.setAttribute('aria-expanded', String(open)); };
  const head = el('div', 'profile-head');
  const who = el('div', 'profile-who');
  who.append(el('div', 'menu-label', 'Angemeldet als'), el('div', 'profile-email', email || '–'));
  head.append(editBtn, who);
  const picRow = el('div', 'profile-pic-row'); picRow.append(picActions, file);
  const rows = [head, picRow, el('div', 'profile-note', state.mode === 'supabase' ? 'Sync über Supabase aktiv.' : 'Lokaler Modus: Daten nur auf diesem Gerät.'), el('div', 'menu-sep'), usageBlock()];
  if (state.mode === 'supabase' && state.user) {
    rows.push(el('div', 'menu-sep'), passwordBlock());
    rows.push(el('div', 'menu-sep'));
    const out = el('button', 'menu-item danger', 'Abmelden', { onclick: () => actions.signOut() });
    out.setAttribute('role', 'menuitem');
    rows.push(out);
  }
  prof.replaceChildren(...rows);
  prof.classList.toggle('hidden', state.menu !== 'profile');
  $('btnProfile').setAttribute('aria-expanded', String(state.menu === 'profile'));
}

function renderTopbar() {
  applyTheme();
  const onCalendar = state.page === 'calendar';
  $('marketPill').textContent = onCalendar ? state.market : (state.analysisScope ? `Auswertungen · ${state.analysisScope}` : 'Auswertungen');
  document.querySelector('.period-nav').classList.toggle('hidden', !onCalendar);
  document.querySelector('.view-toggle').classList.toggle('hidden', !onCalendar);

  const period = $('btnPeriod');
  period.replaceChildren(el('span', 'pl-full', MONTHS[state.month]), el('span', 'pl-short', MONTHS_SHORT[state.month])); // schmale Handys zeigen die Kurzform
  period.title = `${MONTHS[state.month]} – zum heutigen Monat`;
  $('btnPeriod').classList.toggle('hidden', state.view !== 'month');
  $('btnToday').classList.toggle('hidden', state.view !== 'month'); // "Heute" nur in der Monatsansicht
  for (const b of document.querySelectorAll('.view-toggle button')) b.classList.toggle('active', b.dataset.view === state.view);

  const sel = $('yearSelect');
  const thisYear = new Date().getFullYear();
  const years = new Set([state.year, ...Object.keys(state.days).map((d) => Number(d.slice(0, 4)))]);
  for (let y = thisYear - 5; y <= thisYear + 1; y++) years.add(y);
  const sorted = [...years].sort((a, b) => a - b);
  if (sel.options.length !== sorted.length || Number(sel.value) !== state.year) {
    sel.replaceChildren(...sorted.map((y) => { const o = document.createElement('option'); o.value = y; o.textContent = y; return o; }));
    sel.value = state.year;
  }
  renderMenus();
}

function renderAnalysis() {
  const root = $('analysisPage');
  root.classList.toggle('hidden', state.page !== 'analysis');
  $('workspace').classList.toggle('hidden', state.page === 'analysis');
  if (state.page !== 'analysis') return;
  root.replaceChildren(
    el('h1', 'analysis-title', state.analysisScope ? `Auswertungen · ${state.analysisScope}` : 'Auswertungen'),
    el('p', 'muted', 'Hier entstehen später die Auswertungsdiagramme.'));
}

function bindTopbar() {
  $('btnMenu').onclick = () => actions.toggleMenu('main');
  $('btnProfile').onclick = () => actions.toggleMenu('profile');
  // composedPath statt closest(): Buttons im Menü werden beim Klick neu gerendert und hängen dann nicht mehr im DOM
  document.addEventListener('click', (e) => {
    const inside = e.composedPath().some((n) => n.classList?.contains('menu-wrap') || n.classList?.contains('profile-wrap'));
    if (state.menu && !inside) actions.closeMenu();
  });
  $('btnPrev').onclick = () => actions.step(-1);
  $('btnNext').onclick = () => actions.step(1);
  $('btnToday').onclick = () => actions.goToday();
  $('btnPeriod').onclick = () => actions.goToday();
  $('yearSelect').onchange = (e) => actions.setYear(Number(e.target.value));
  for (const b of document.querySelectorAll('.view-toggle button')) b.onclick = () => actions.setView(b.dataset.view);
  for (const b of document.querySelectorAll('#sideTabs button[data-tab]')) b.onclick = () => actions.setSideTab(b.dataset.tab);
  $('lightbox').onclick = () => $('lightbox').classList.add('hidden');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('lightbox').classList.add('hidden'); actions.closeMenu(); if (state.popupDate) actions.closePopup(); }
    if (state.page !== 'calendar' || state.popupDate || e.target.matches('input, textarea, select')) return;
    if (e.key === 'ArrowLeft') actions.step(-1);
    if (e.key === 'ArrowRight') actions.step(1);
  });
}

// ---------------------------------------------------------------- Login

function showAuth(show) {
  $('authOverlay').classList.toggle('hidden', !show);
  if (show) startAuthBg($('authBg')); else stopAuthBg();
}

let registering = false; // Login-Karte: Anmelden oder neu registrieren

function renderAuthMode() {
  $('authTitle').textContent = registering ? 'Konto erstellen' : 'Anmelden';
  $('authHint').textContent = registering
    ? 'Lege mit deiner E-Mail und einem Passwort (mind. 6 Zeichen) dein eigenes Konto an. Eine Bestätigungs-E-Mail ist nicht nötig.'
    : 'Melde dich mit deiner E-Mail und deinem Passwort an. Das ist nur einmal pro Gerät nötig.';
  $('authSubmit').textContent = registering ? 'Registrieren' : 'Anmelden';
  $('authSwitch').textContent = registering ? 'Schon ein Konto? Anmelden' : 'Noch kein Konto? Registrieren';
  $('authPw2Wrap').classList.toggle('hidden', !registering);
  $('authPw2').required = registering;
  $('authPw').autocomplete = registering ? 'new-password' : 'current-password';
  $('authError').textContent = '';
}

function bindAuth() {
  $('authSwitch').onclick = () => { registering = !registering; renderAuthMode(); };
  $('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $('authError').textContent = '';
    if (registering && f.get('password') !== f.get('password2')) { $('authError').textContent = 'Die Passwörter stimmen nicht überein.'; return; }
    $('authSubmit').disabled = true;
    try { await (registering ? db.signUp(f.get('email'), f.get('password')) : db.signIn(f.get('email'), f.get('password'))); }
    catch (err) { $('authError').textContent = err.message || 'Anmeldung fehlgeschlagen'; }
    finally { $('authSubmit').disabled = false; }
  };
}

// ---------------------------------------------------------------- Render + Start

function render(_s, parts) {
  const all = !parts;
  if (all || parts.includes('topbar')) renderTopbar();
  if (all) renderAnalysis();
  if (all || parts.includes('calendar')) renderCalendar($('calendarPane'), state, actions);
  if (all || parts.includes('sidebar')) renderSidebar($('sideContent'), $('sideTabs'), state, actions);
  if (all || parts.includes('modal')) renderDayModal($('dayModal'), state, actions);
}

async function main() {
  db = await createAdapter();
  initSplitter($('workspace'), $('splitter'));
  bindTopbar();
  bindAuth();
  subscribe(render);

  const user = await db.init();
  state.mode = db.mode;
  state.user = user;

  if (db.mode === 'supabase') {
    db.onAuthChange(async (u) => {
      const changed = (u?.id || null) !== (state.user?.id || null);
      state.user = u;
      showAuth(!u);
      if (!u) { state.days = {}; state.notes = []; state.checklists = []; usage = null; avatarCache = { path: null, url: null }; pwOpen = false; setState({ menu: null }); }
      else if (changed) await loadAll();
      else refreshAvatar();
    });
    if (!user) { showAuth(true); setState({}); return; }
  }
  await loadAll();
}

main().catch((e) => { console.error(e); alert('Start fehlgeschlagen: ' + (e.message || e)); });
