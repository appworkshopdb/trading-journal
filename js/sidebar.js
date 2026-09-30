// Rechte Seite: Tabs "Checklisten" (Standard) und "Notizen". Öffnet der Nutzer über "Öffnen" in einer
// Kalenderzelle den Detailbereich eines Tages (js/detail.js), ersetzt dieser die Tabs.
// Texteingaben werden entprellt gespeichert, OHNE die Seitenleiste neu zu rendern (sonst verliert
// das Eingabefeld den Fokus).

import { h, uid, debounce } from './utils.js';
import { detailPanel } from './detail.js';

export function renderSidebar(root, tabsEl, state, actions) {
  const inDetail = !!state.detailDate;
  tabsEl.classList.toggle('hidden', inDetail);
  for (const b of tabsEl.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tab === state.sideTab);
  const view = inDetail ? detailPanel : ({ notes: notesPanel, checklists: checklistsPanel }[state.sideTab] || checklistsPanel);
  root.replaceChildren(view(state, actions));
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

  // Neuer Punkt: Text + optionaler Infotext; Enter in einem der beiden Felder fügt hinzu
  const addItem = () => {
    const text = pointInput.value.trim();
    if (!text) { pointInput.focus(); return; }
    const info = infoInput.value.trim();
    actions.updateChecklist(cl.id, { items: [...items, { id: uid(), text, info, done: false }] }, true, cl.id);
  };
  const onEnter = (ev) => { if (ev.key === 'Enter') addItem(); };
  const pointInput = h('input', { type: 'text', class: 'add-item add-point', placeholder: '+ Punkt hinzufügen', 'aria-label': 'Neuer Punkt', onKeydown: onEnter });
  const infoInput = h('input', { type: 'text', class: 'add-item add-info', placeholder: 'Infotext (optional) – Enter', 'aria-label': 'Infotext zum Punkt', onKeydown: onEnter });
  if (state.focusChecklist === cl.id) setTimeout(() => pointInput.focus(), 0);

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
        h('span', { class: 'item-body' },
          h('span', { class: 'item-text' }, it.text),
          it.info && h('span', { class: 'item-info' }, it.info))),
      h('button', { class: 'item-del', title: 'Entfernen', onClick: () => actions.updateChecklist(cl.id, { items: items.filter((i) => i.id !== it.id) }, true) }, '×'),
    ))),
    h('div', { class: 'add-row' }, pointInput, infoInput),
  );
}
