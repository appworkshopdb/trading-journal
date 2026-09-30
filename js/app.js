// Einstiegspunkt: Adapter wählen, Daten laden, Topbar binden, Aktionen definieren, rendern.

import { state, setState, subscribe } from './state.js';
import { createAdapter } from './data/index.js';
import { renderCalendar } from './calendar.js';
import { renderSidebar } from './sidebar.js';
import { renderDayModal } from './daymodal.js';
import { initSplitter } from './splitter.js';
import { MONTHS, todayISO, uid } from './utils.js';

const $ = (id) => document.getElementById(id);
let db; // Daten-Adapter (siehe js/data/index.js)

// ---------------------------------------------------------------- Laden

async function ensureYear(year) {
  const key = String(year);
  if (state.loadedRanges.has(key)) return;
  const rows = await db.getDays(`${year}-01-01`, `${year}-12-31`);
  for (const r of rows) state.days[r.date] = r;
  state.loadedRanges.add(key);
}

async function loadAll() {
  state.days = {};
  state.loadedRanges = new Set();
  const [notes, checklists] = await Promise.all([db.listNotes(), db.listChecklists()]);
  await ensureYear(state.year);
  setState({ notes, checklists });
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

const isEmptyDay = (d) => d.pnl == null && !(d.note || '').trim() && !(d.tags || []).length && !(d.images || []).length && !(d.fields || []).length;

// ---------------------------------------------------------------- Aktionen (werden an die Renderer gereicht)

const actions = {
  // Navigation
  // Tag antippen -> Popup (Gewinn/Verlust/Notiz/Farbe); "Öffnen" in der Zelle -> Detailbereich rechts
  openPopup(iso) { setState({ selectedDate: iso, popupDate: iso }, ['calendar', 'modal']); },
  closePopup() { setState({ popupDate: null }, ['modal']); },
  async savePopup(iso, patch) { actions.closePopup(); await actions.updateDay(iso, patch); },
  async clearPopup(iso) { actions.closePopup(); await actions.clearDay(iso); },
  // Handy: "Öffnen" im Popup speichert die Eingaben und wechselt direkt in den Detailbereich des Tages
  async savePopupAndOpen(iso, patch) {
    const hasData = state.days[iso] || patch.pnl != null || (patch.note || '').trim();
    actions.closePopup();
    const saving = hasData ? actions.updateDay(iso, patch) : null; // aktualisiert den State sofort, speichert im Hintergrund
    actions.openDetail(iso);
    await saving;
  },
  openDetail(iso) { setState({ selectedDate: iso, detailDate: iso, popupDate: null }); },
  closeDetail() { setState({ detailDate: null }); },
  refreshSidebar(focusField = null) { setState({ focusField }, ['sidebar']); },
  openMonth(y, m) { setState({ view: 'month', year: y, month: m }); },
  async setView(view) { setState({ view }); },
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
  setSideTab(tab) { setState({ sideTab: tab, detailDate: null, editingChecklist: null, openChecklist: null }); },

  // Tage
  async updateDay(iso, patch) {
    const merged = { date: iso, pnl: null, note: '', note_color: null, tags: [], images: [], fields: [], ...(state.days[iso] || {}), ...patch };
    if (isEmptyDay(merged)) {
      delete state.days[iso];
      setState({}, ['calendar']);
      await persist(() => db.deleteDay(iso));
      return;
    }
    state.days[iso] = merged;
    setState({}, ['calendar']);
    const saved = await persist(() => db.saveDay(merged));
    // Nur Server-Metadaten übernehmen – Inhalte könnten inzwischen weiter bearbeitet worden sein
    if (saved && state.days[iso]) state.days[iso].updated_at = saved.updated_at;
  },
  async clearDay(iso) {
    const entry = state.days[iso];
    if (entry?.images?.length) await Promise.allSettled(entry.images.map((i) => db.deleteImage(i.path)));
    delete state.days[iso];
    await persist(() => db.deleteDay(iso));
    setState({});
  },
  async addImages(iso, files) {
    const entry = state.days[iso] || { date: iso, pnl: null, note: '', note_color: null, tags: [], images: [], fields: [] };
    const uploaded = [];
    await persist(async () => { for (const f of files) uploaded.push(await db.uploadImage(iso, f)); });
    const merged = { ...entry, images: [...(entry.images || []), ...uploaded] };
    state.days[iso] = merged;
    await persist(() => db.saveDay(merged));
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
    const cl = { id: uid(), title: '', items: [], position: state.checklists.length, created_at: new Date().toISOString() };
    const saved = await persist(() => db.saveChecklist(cl));
    // Neue Liste öffnet direkt in der Bearbeitungsansicht, Fokus auf dem Titel
    setState({ checklists: [...state.checklists, saved || cl], focusTitle: cl.id, editingChecklist: cl.id, openChecklist: cl.id });
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

function renderTopbar() {
  $('btnPeriod').textContent = MONTHS[state.month];
  $('btnPeriod').classList.toggle('hidden', state.view !== 'month');
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

  const st = $('status');
  st.replaceChildren();
  const label = document.createElement('span');
  label.className = 'mode-label';
  label.textContent = state.mode === 'supabase' ? (state.user?.email || '') : 'Lokal';
  label.title = state.mode === 'supabase' ? 'Supabase-Sync aktiv' : 'Daten nur auf diesem Gerät (config.js ausfüllen für Sync)';
  const save = document.createElement('span');
  save.id = 'saveStatus';
  st.append(save, label);
  if (state.mode === 'supabase' && state.user) {
    const out = document.createElement('button');
    out.className = 'text-btn';
    out.textContent = 'Abmelden';
    out.onclick = () => db.signOut();
    st.append(out);
  }
}

function bindTopbar() {
  $('btnPrev').onclick = () => actions.step(-1);
  $('btnNext').onclick = () => actions.step(1);
  $('btnToday').onclick = () => actions.goToday();
  $('btnPeriod').onclick = () => actions.goToday();
  $('yearSelect').onchange = (e) => actions.setYear(Number(e.target.value));
  for (const b of document.querySelectorAll('.view-toggle button')) b.onclick = () => actions.setView(b.dataset.view);
  for (const b of document.querySelectorAll('#sideTabs button[data-tab]')) b.onclick = () => actions.setSideTab(b.dataset.tab);
  $('lightbox').onclick = () => $('lightbox').classList.add('hidden');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('lightbox').classList.add('hidden'); if (state.popupDate) actions.closePopup(); }
    if (state.popupDate || e.target.matches('input, textarea, select')) return;
    if (e.key === 'ArrowLeft') actions.step(-1);
    if (e.key === 'ArrowRight') actions.step(1);
  });
}

// ---------------------------------------------------------------- Login

function showAuth(show) { $('authOverlay').classList.toggle('hidden', !show); }

function bindAuth() {
  $('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $('authError').textContent = '';
    try { await db.signIn(f.get('email'), f.get('password')); }
    catch (err) { $('authError').textContent = err.message || 'Anmeldung fehlgeschlagen'; }
  };
}

// ---------------------------------------------------------------- Render + Start

function render(_s, parts) {
  const all = !parts;
  if (all || parts.includes('topbar')) renderTopbar();
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
      if (!u) { state.days = {}; state.notes = []; state.checklists = []; setState({}); }
      else if (changed) await loadAll();
    });
    if (!user) { showAuth(true); setState({}); return; }
  }
  await loadAll();
}

main().catch((e) => { console.error(e); alert('Start fehlgeschlagen: ' + (e.message || e)); });
