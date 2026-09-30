// Rechte Seite: Tabs "Tag" (Editor für den ausgewählten Kalendertag), "Notizen", "Checklisten".
// Texteingaben werden entprellt gespeichert, OHNE die Seitenleiste neu zu rendern (sonst verliert
// das Eingabefeld den Fokus). Nur der Kalender wird bei PnL-/Notiz-Änderung aktualisiert.

import { h, fromISO, fmtMoney, signClass, uid, debounce } from './utils.js';
import { CONFIG } from '../config.js';

const imageUrlCache = new Map(); // path -> URL (Supabase: signierte URL, 1h gültig)

export function renderSidebar(root, tabsEl, state, actions) {
  for (const b of tabsEl.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tab === state.sideTab);
  const view = { day: dayPanel, notes: notesPanel, checklists: checklistsPanel }[state.sideTab];
  root.replaceChildren(view(state, actions));
}

// ======================= Tag =======================

function emptyDay(iso) { return { date: iso, pnl: null, note: '', tags: [], images: [] }; }

function dayPanel(state, actions) {
  const iso = state.selectedDate;
  const entry = state.days[iso] || emptyDay(iso);
  const d = fromISO(iso);
  const title = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Patches sammeln und gebündelt entprellt speichern (sonst überschreibt ein schneller Feldwechsel den vorigen Patch)
  let pending = {};
  const flush = debounce(() => { const p = pending; pending = {}; actions.updateDay(iso, p); }, 500);
  const saveDebounced = (patch) => { Object.assign(pending, patch); flush(); };

  const pnlInput = h('input', {
    type: 'number', step: '0.01', inputmode: 'decimal', placeholder: '0,00',
    class: `pnl-input ${signClass(entry.pnl)}`, value: entry.pnl ?? '',
    onInput: (ev) => {
      const v = ev.target.value;
      const pnl = v === '' ? null : Number(v);
      ev.target.className = `pnl-input ${signClass(pnl)}`;
      saveDebounced({ pnl });
    },
  });

  const noteArea = h('textarea', {
    class: 'note-area', placeholder: 'Was ist heute passiert? Setup, Fehler, Erkenntnisse …',
    rows: 8, onInput: (ev) => saveDebounced({ note: ev.target.value }),
  });
  noteArea.value = entry.note || '';

  const tagsInput = h('input', {
    type: 'text', class: 'tags-input', placeholder: 'Tags, durch Komma getrennt (z.B. Breakout, Overtrading)',
    value: (entry.tags || []).join(', '),
    onInput: (ev) => saveDebounced({ tags: ev.target.value.split(',').map((t) => t.trim()).filter(Boolean) }),
  });

  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden',
    onChange: async (ev) => { await actions.addImages(iso, [...ev.target.files]); ev.target.value = ''; } });

  return h('div', { class: 'panel day-panel' },
    h('h2', { class: 'panel-title' }, title),
    h('label', { class: 'field' }, h('span', {}, `Gewinn / Verlust (${CONFIG.CURRENCY})`), pnlInput),
    h('label', { class: 'field' }, h('span', {}, 'Notiz'), noteArea),
    h('label', { class: 'field' }, h('span', {}, 'Tags'), tagsInput),
    h('div', { class: 'field' },
      h('div', { class: 'field-head' },
        h('span', {}, `Screenshots (${entry.images?.length || 0})`),
        h('button', { class: 'text-btn', onClick: () => fileInput.click() }, '+ Bild hochladen'),
        fileInput),
      imageGrid(entry, iso, actions),
    ),
    h('div', { class: 'panel-footer' },
      h('button', { class: 'text-btn danger', onClick: () => { if (confirm('Alle Einträge dieses Tages löschen?')) actions.clearDay(iso); } }, 'Tag leeren'),
    ),
  );
}

function imageGrid(entry, iso, actions) {
  const imgs = entry.images || [];
  if (!imgs.length) return h('p', { class: 'muted small' }, 'Noch keine Bilder.');
  return h('div', { class: 'image-grid' }, imgs.map((img) => {
    const el = h('img', { alt: img.name || 'Screenshot', loading: 'lazy' });
    const cached = imageUrlCache.get(img.path);
    if (cached) el.src = cached;
    else actions.imageUrl(img.path).then((url) => { imageUrlCache.set(img.path, url); el.src = url; }).catch(() => el.classList.add('broken'));
    return h('figure', { class: 'thumb' },
      h('button', { class: 'thumb-open', onClick: () => actions.openLightbox(el.src) }, el),
      h('button', { class: 'thumb-del', title: 'Bild löschen', onClick: () => { if (confirm('Bild löschen?')) actions.removeImage(iso, img); } }, '×'),
    );
  }));
}

// ======================= Notizen =======================

function notesPanel(state, actions) {
  const active = state.notes.find((n) => n.id === state.activeNoteId);
  if (active) return noteEditor(active, actions);

  return h('div', { class: 'panel notes-panel' },
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-title' }, 'Notizen'),
      h('button', { class: 'primary small', onClick: () => actions.newNote() }, '+ Neue Notiz')),
    state.notes.length
      ? h('ul', { class: 'note-list' }, state.notes.map((n) => h('li', {},
        h('button', { class: 'note-item', onClick: () => actions.openNote(n.id) },
          h('span', { class: 'note-title' }, n.pinned ? '📌 ' : '', n.title || 'Ohne Titel'),
          h('span', { class: 'note-snippet' }, (n.body || '').slice(0, 90)),
          h('span', { class: 'note-date muted small' }, new Date(n.updated_at || n.created_at || Date.now()).toLocaleDateString('de-DE'))))))
      : h('p', { class: 'muted' }, 'Hier landen Strategien, Regeln, Erkenntnisse – alles, was nicht an einen Tag gebunden ist.'),
  );
}

function noteEditor(note, actions) {
  // `note` ist das Objekt aus state.notes: Änderungen sofort eintragen, nur das Speichern entprellen
  const persist = debounce(() => actions.updateNote(note.id, {}), 500);
  const body = h('textarea', { class: 'note-body', rows: 18, placeholder: 'Text …', onInput: (ev) => { note.body = ev.target.value; persist(); } });
  body.value = note.body || '';
  return h('div', { class: 'panel note-editor' },
    h('div', { class: 'panel-head' },
      h('button', { class: 'text-btn', onClick: () => actions.closeNote() }, '‹ Zurück'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'text-btn', title: 'Anpinnen', onClick: () => actions.updateNote(note.id, { pinned: !note.pinned }, true) }, note.pinned ? 'Lösen' : 'Anpinnen'),
      h('button', { class: 'text-btn danger', onClick: () => { if (confirm('Notiz löschen?')) actions.deleteNote(note.id); } }, 'Löschen')),
    h('input', { type: 'text', class: 'note-title-input', placeholder: 'Titel', value: note.title || '', onInput: (ev) => { note.title = ev.target.value; persist(); } }),
    body,
  );
}

// ======================= Checklisten =======================

function checklistsPanel(state, actions) {
  return h('div', { class: 'panel checklists-panel' },
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-title' }, 'Checklisten'),
      h('button', { class: 'primary small', onClick: () => actions.newChecklist() }, '+ Neue Liste')),
    state.checklists.length
      ? state.checklists.map((cl) => checklistCard(cl, state, actions))
      : h('p', { class: 'muted' }, 'z.B. „Vor dem Trade", „Tagesroutine", „Wochenreview".'),
  );
}

function checklistCard(cl, state, actions) {
  const items = cl.items || [];
  const done = items.filter((i) => i.done).length;
  const titleSave = debounce(() => actions.updateChecklist(cl.id, {}), 500); // cl ist das State-Objekt

  const addInput = h('input', { type: 'text', class: 'add-item', placeholder: '+ Punkt hinzufügen (Enter)',
    onKeydown: (ev) => {
      if (ev.key !== 'Enter' || !ev.target.value.trim()) return;
      actions.updateChecklist(cl.id, { items: [...items, { id: uid(), text: ev.target.value.trim(), done: false }] }, true, cl.id);
    } });
  if (state.focusChecklist === cl.id) setTimeout(() => addInput.focus(), 0);

  return h('section', { class: 'checklist' },
    h('div', { class: 'checklist-head' },
      h('input', { type: 'text', class: 'checklist-title', placeholder: 'Titel der Liste', value: cl.title || '', onInput: (ev) => { cl.title = ev.target.value; titleSave(); } }),
      h('span', { class: 'muted small' }, `${done}/${items.length}`),
      h('button', { class: 'text-btn', title: 'Alle Haken entfernen', onClick: () => actions.updateChecklist(cl.id, { items: items.map((i) => ({ ...i, done: false })) }, true) }, '↺'),
      h('button', { class: 'text-btn danger', title: 'Liste löschen', onClick: () => { if (confirm('Liste löschen?')) actions.deleteChecklist(cl.id); } }, '×'),
    ),
    h('ul', { class: 'check-items' }, items.map((it) => h('li', { class: it.done ? 'done' : '' },
      h('label', {},
        h('input', { type: 'checkbox', checked: it.done, onChange: (ev) => actions.updateChecklist(cl.id, { items: items.map((i) => i.id === it.id ? { ...i, done: ev.target.checked } : i) }, true) }),
        h('span', {}, it.text)),
      h('button', { class: 'item-del', title: 'Entfernen', onClick: () => actions.updateChecklist(cl.id, { items: items.filter((i) => i.id !== it.id) }, true) }, '×'),
    ))),
    addInput,
  );
}
