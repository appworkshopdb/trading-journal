// Popup zum Antippen eines Kalendertags: Gewinn, Verlust, Notiz, Notizfarbe.
// Wird nur neu gebaut, wenn sich der geöffnete Tag ändert – so gehen Eingaben bei Hintergrund-Renderings nicht verloren.

import { h, fromISO, NOTE_COLORS, noteColor } from './utils.js';
import { CONFIG } from '../config.js';

let shownFor = null;

/** "1.250,50" / "1250.5" / "40" -> Zahl, sonst null */
function parseAmount(text) {
  let t = String(text ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const toField = (n) => String(n).replace('.', ',');

export function renderDayModal(root, state, actions) {
  const iso = state.popupDate;
  if (!iso) {
    shownFor = null;
    root.classList.add('hidden');
    root.replaceChildren();
    return;
  }
  if (shownFor === iso && !root.classList.contains('hidden')) return;
  shownFor = iso;

  const entry = state.days[iso];
  const title = fromISO(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Bestehendes Ergebnis auf Gewinn-/Verlustfeld verteilen
  const pnl = entry?.pnl ?? null;
  const gainVal = pnl != null && pnl >= 0 ? toField(pnl) : '';
  const lossVal = pnl != null && pnl < 0 ? toField(-pnl) : '';

  const gain = h('input', { type: 'text', inputmode: 'decimal', class: 'pnl-gain', placeholder: '0,00', value: gainVal, 'aria-label': `Gewinn (${CONFIG.CURRENCY})` });
  const loss = h('input', { type: 'text', inputmode: 'decimal', class: 'pnl-loss', placeholder: '0,00', value: lossVal, 'aria-label': `Verlust (${CONFIG.CURRENCY})` });
  const note = h('textarea', { class: 'note-area', rows: 4, placeholder: 'Kurze Notiz zum Tag …' });
  note.value = entry?.note || '';

  const dot = h('span', { class: 'color-dot' });
  const colorSel = h('select', { 'aria-label': 'Farbe der Notiz' },
    NOTE_COLORS.map((c) => h('option', { value: c.id }, c.name)));
  colorSel.value = noteColor(entry?.note_color).id;
  const paintDot = () => { dot.style.background = noteColor(colorSel.value).hex; };
  colorSel.addEventListener('change', paintDot);
  paintDot();

  const save = (ev) => {
    ev.preventDefault();
    const g = parseAmount(gain.value);
    const v = parseAmount(loss.value);
    // Gewinn und Verlust zusammen ergeben das Tagesergebnis; beide leer = kein Ergebnis
    const result = g == null && v == null ? null : Math.abs(g || 0) - Math.abs(v || 0);
    actions.savePopup(iso, { pnl: result, note: note.value, note_color: colorSel.value });
  };

  const form = h('form', { class: 'day-modal', onSubmit: save },
    h('div', { class: 'modal-head' },
      h('h2', {}, title),
      h('button', { type: 'button', class: 'text-btn', 'aria-label': 'Schließen', onClick: () => actions.closePopup() }, '×')),
    h('div', { class: 'modal-pnl' },
      h('label', { class: 'field' }, h('span', {}, `Gewinn (${CONFIG.CURRENCY})`), gain),
      h('label', { class: 'field' }, h('span', {}, `Verlust (${CONFIG.CURRENCY})`), loss)),
    h('label', { class: 'field' }, h('span', {}, 'Notiz'), note),
    h('label', { class: 'field' }, h('span', {}, 'Farbe der Notiz'),
      h('div', { class: 'color-row' }, dot, colorSel)),
    h('div', { class: 'modal-actions' },
      entry && h('button', { type: 'button', class: 'text-btn danger',
        onClick: () => { if (confirm('Alle Einträge dieses Tages löschen?')) actions.clearPopup(iso); } }, 'Tag leeren'),
      h('div', { class: 'spacer' }),
      h('button', { type: 'button', class: 'text-btn', onClick: () => actions.closePopup() }, 'Abbrechen'),
      h('button', { type: 'submit', class: 'primary' }, 'Speichern')),
  );

  root.onclick = (ev) => { if (ev.target === root) actions.closePopup(); };
  root.replaceChildren(form);
  root.classList.remove('hidden');
  setTimeout(() => (gainVal || !lossVal ? gain : loss).focus(), 0);
}
