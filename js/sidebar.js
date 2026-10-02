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

/** "40" / "12,5" -> Zahl >= 0, sonst null */
function parseWeight(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const fmtWeight = (w) => String(w).replace('.', ',');
const hasWeights = (items) => items.some((i) => i.weight != null);
/** Summe der Gewichte aller Punkte (in %) */
const weightSum = (items) => items.reduce((sum, i) => sum + (i.weight || 0), 0);

/**
 * Erfüllungsgrad in % und ob der Richtwert erreicht ist (leere Liste: nie erlaubt).
 * Hat mindestens ein Punkt ein Gewicht, zählt die Summe der Gewichte der erledigten Punkte (max. 100 %; Punkte ohne Gewicht = 0 %).
 * Ohne jedes Gewicht zählen alle Punkte gleich: erledigt / gesamt.
 */
function checkStatus(cl, threshold) {
  const items = cl.items || [];
  const done = items.filter((i) => i.done).length;
  const weighted = hasWeights(items);
  const raw = weighted ? items.filter((i) => i.done).reduce((sum, i) => sum + (i.weight || 0), 0) : (items.length ? (done / items.length) * 100 : 0);
  const pct = Math.min(100, raw);
  return { done, total: items.length, pct, shown: Math.round(pct), allowed: items.length > 0 && pct >= threshold, weighted };
}

function statusBadge(st) {
  return h('span', { class: `allow-badge ${st.allowed ? 'ok' : 'no'}` }, st.allowed ? '✓ Erlaubt' : 'Noch nicht erlaubt');
}

function checklistsPanel(state, actions) {
  const open = state.checklists.find((c) => c.id === state.openChecklist);
  if (open) {
    return h('div', { class: 'panel checklists-panel' },
      h('div', { class: 'panel-head' },
        h('button', { class: 'text-btn', onClick: () => actions.openChecklist(null) }, '‹ Alle Listen')),
      checklistCard(open, state, actions));
  }
  // Übersicht: alle Listen, Tippen öffnet die einzelne Liste
  return h('div', { class: 'panel checklists-panel' },
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-title' }, 'Checklisten'),
      h('label', { class: 'threshold-box', title: 'Richtwert: ab diesem Anteil erledigter Punkte ist ein Trade erlaubt' },
        h('span', {}, 'Richtwert'),
        h('input', { type: 'number', class: 'threshold-input', min: 0, max: 100, step: 1, inputmode: 'numeric', value: state.threshold, 'aria-label': 'Richtwert in Prozent',
          onChange: (ev) => actions.setThreshold(ev.target.value) }),
        h('span', {}, '%')),
      h('button', { class: 'primary small', onClick: () => actions.newChecklist() }, '+ Neue Liste')),
    state.checklists.length
      ? h('ul', { class: 'checklist-overview' }, state.checklists.map((cl) => {
        const st = checkStatus(cl, state.threshold);
        return h('li', {},
          h('button', { class: 'checklist-row', onClick: () => actions.openChecklist(cl.id) },
            h('span', { class: 'checklist-row-title' }, cl.title || 'Ohne Titel'),
            h('span', { class: 'muted small' }, `${st.done}/${st.total} · ${st.shown} %`),
            statusBadge(st),
            h('span', { class: 'checklist-row-caret', 'aria-hidden': 'true' }, '›')));
      }))
      : h('p', { class: 'muted' }, 'z.B. „Vor dem Trade", „Tagesroutine", „Wochenreview".'),
  );
}

const PENCIL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';

function checklistCard(cl, state, actions) {
  const items = cl.items || [];
  const done = items.filter((i) => i.done).length;
  const editing = state.editingChecklist === cl.id;
  // cl und seine Punkte sind State-Objekte: Eingaben werden direkt eingetragen, nur das Speichern wird entprellt
  const save = debounce(() => actions.updateChecklist(cl.id, {}), 500);

  // Neuer Punkt: Text + optionaler Infotext; Enter in einem der beiden Felder fügt hinzu
  const addItem = () => {
    const text = pointInput.value.trim();
    if (!text) { pointInput.focus(); return; }
    const info = infoInput.value.trim();
    actions.updateChecklist(cl.id, { items: [...items, { id: uid(), text, info, weight: parseWeight(weightInput.value), done: false }] }, true, cl.id);
  };
  const onEnter = (ev) => { if (ev.key === 'Enter') addItem(); };
  const pointInput = h('input', { type: 'text', class: 'add-item add-point', placeholder: '+ Punkt hinzufügen', 'aria-label': 'Neuer Punkt', onKeydown: onEnter });
  const infoInput = h('input', { type: 'text', class: 'add-item add-info', placeholder: 'Infotext (optional)', 'aria-label': 'Infotext zum Punkt', onKeydown: onEnter });
  const weightInput = h('input', { type: 'text', inputmode: 'decimal', class: 'add-item add-weight', placeholder: '%', 'aria-label': 'Gewichtung des Punkts in Prozent', onKeydown: onEnter });
  const saveBtn = h('button', { type: 'button', class: 'primary small add-save', onClick: addItem }, 'Speichern');
  const addRow = () => h('div', { class: 'add-row' }, pointInput, weightInput, saveBtn, infoInput);
  if (state.focusChecklist === cl.id) setTimeout(() => pointInput.focus(), 0);

  const delBtn = h('button', { class: 'text-btn danger', title: 'Liste löschen', 'aria-label': 'Liste löschen', onClick: () => { if (confirm('Liste löschen?')) actions.deleteChecklist(cl.id); } }, '×');

  // ---------- Bearbeitungsansicht: Titel + Text und Infotext jedes Punkts
  if (editing) {
    const titleInput = h('input', { type: 'text', class: 'checklist-title editing', placeholder: 'Titel der Liste', 'aria-label': 'Titel der Liste', value: cl.title || '',
      onInput: (ev) => { cl.title = ev.target.value; save(); } });
    if (state.focusTitle === cl.id) { state.focusTitle = null; setTimeout(() => titleInput.focus(), 0); }
    const finish = () => {
      actions.updateChecklist(cl.id, { items: items.filter((i) => (i.text || '').trim()) }); // leere Punkte verwerfen
      actions.editChecklist(null);
    };
    return h('section', { class: 'checklist is-editing' },
      h('div', { class: 'checklist-head' }, titleInput, h('button', { class: 'primary small', onClick: finish }, 'Fertig'), delBtn),
      h('ul', { class: 'check-items' }, items.map((it) => h('li', { class: 'edit-item' },
        h('div', { class: 'edit-item-fields' },
          h('input', { type: 'text', class: 'edit-input', placeholder: 'Punkt', 'aria-label': 'Text des Punkts', value: it.text || '',
            onInput: (ev) => { it.text = ev.target.value; save(); } }),
          h('input', { type: 'text', class: 'edit-input info', placeholder: 'Infotext (optional)', 'aria-label': 'Infotext des Punkts', value: it.info || '',
            onInput: (ev) => { it.info = ev.target.value; save(); } })),
        h('label', { class: 'edit-weight', title: 'Gewichtung in Prozent' },
          h('input', { type: 'text', inputmode: 'decimal', class: 'edit-input', placeholder: '–', 'aria-label': 'Gewichtung des Punkts in Prozent', value: it.weight == null ? '' : fmtWeight(it.weight),
            onInput: (ev) => { it.weight = parseWeight(ev.target.value); save(); },
            onChange: () => actions.refreshSidebar() }), h('span', {}, '%')),
        h('button', { class: 'item-del', title: 'Punkt entfernen', 'aria-label': 'Punkt entfernen',
          onClick: () => actions.updateChecklist(cl.id, { items: items.filter((i) => i.id !== it.id) }, true) }, '×'),
      ))),
      addRow(),
      hasWeights(items) && h('p', { class: `muted small weight-sum${weightSum(items) === 100 ? '' : ' warn'}` },
        `Summe der Gewichte: ${fmtWeight(Math.round(weightSum(items) * 100) / 100)} % – erreichbar sind höchstens 100 %.`),
    );
  }

  // ---------- Normalansicht
  const st = checkStatus(cl, state.threshold);
  return h('section', { class: 'checklist' },
    h('div', { class: 'checklist-head' },
      h('span', { class: 'checklist-title-static' }, cl.title || 'Ohne Titel'),
      h('span', { class: 'muted small' }, `${st.done}/${st.total}`),
      h('button', { class: 'text-btn', title: 'Alle Haken entfernen', 'aria-label': 'Alle Haken entfernen', onClick: () => actions.updateChecklist(cl.id, { items: items.map((i) => ({ ...i, done: false })) }, true) }, '↺'),
      h('button', { class: 'text-btn icon-edit', title: 'Liste bearbeiten', 'aria-label': 'Liste bearbeiten', html: PENCIL, onClick: () => actions.editChecklist(cl.id) }),
      delBtn,
    ),
    h('div', { class: `gauge ${st.allowed ? 'ok' : 'no'}` },
      h('div', { class: 'gauge-top' },
        h('span', { class: 'gauge-pct' }, `${st.shown} %`),
        h('span', { class: 'muted small' }, `Richtwert ${state.threshold} %`),
        statusBadge(st)),
      h('div', { class: 'gauge-bar' },
        h('div', { class: 'gauge-fill', style: `width:${Math.min(100, st.pct)}%` }),
        h('div', { class: 'gauge-mark', style: `left:${Math.min(100, state.threshold)}%` }))),
    h('ul', { class: 'check-items' }, items.map((it) => h('li', { class: it.done ? 'done' : '' },
      h('label', {},
        h('input', { type: 'checkbox', checked: it.done, onChange: (ev) => actions.updateChecklist(cl.id, { items: items.map((i) => i.id === it.id ? { ...i, done: ev.target.checked } : i) }, true) }),
        h('span', { class: 'item-body' },
          h('span', { class: 'item-text' }, it.text),
          it.info && h('span', { class: 'item-info' }, it.info)),
        it.weight != null && h('span', { class: 'item-weight' }, `${fmtWeight(it.weight)} %`)),
      h('button', { class: 'item-del', title: 'Entfernen', 'aria-label': 'Punkt entfernen', onClick: () => actions.updateChecklist(cl.id, { items: items.filter((i) => i.id !== it.id) }, true) }, '×'),
    ))),
    addRow(),
  );
}
