// Popup zum Antippen eines Kalendertags: Gewinn, Verlust, Notiz, Notizfarbe.
// Wird nur neu gebaut, wenn sich der geöffnete Tag ändert – so gehen Eingaben bei Hintergrund-Renderings nicht verloren.

import { h, periodTitle, isMonthKey, monthBreakdown, fmtMoney, signClass, NOTE_COLORS, noteColor } from './utils.js';
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
  const title = periodTitle(iso);
  const isMonth = isMonthKey(iso);
  const brk = isMonth ? monthBreakdown(state.days, iso) : null;

  // Bestehendes Ergebnis auf Gewinn-/Verlustfeld verteilen
  const pnl = entry?.pnl ?? null;
  const gainVal = pnl != null && pnl >= 0 ? toField(pnl) : '';
  const lossVal = pnl != null && pnl < 0 ? toField(-pnl) : '';

  const gain = h('input', { type: 'text', inputmode: 'decimal', class: 'pnl-gain', placeholder: '0,00', value: gainVal, 'aria-label': `Gewinn (${CONFIG.CURRENCY})` });
  const loss = h('input', { type: 'text', inputmode: 'decimal', class: 'pnl-loss', placeholder: '0,00', value: lossVal, 'aria-label': `Verlust (${CONFIG.CURRENCY})` });
  const note = h('textarea', { class: 'note-area', rows: 4, placeholder: isMonth ? 'Kurze Notiz zum Monat …' : 'Kurze Notiz zum Tag …' });
  note.value = entry?.note || '';

  // Eigene Dropdown-Liste, damit jede Farbe schon in der Liste sichtbar ist (ein <select> kann das nicht überall)
  let colorId = noteColor(entry?.note_color).id;
  const dot = h('span', { class: 'color-dot' });
  const colorName = h('span', { class: 'color-name' });
  const trigger = h('button', { type: 'button', class: 'color-trigger', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-labelledby': 'noteColorLabel' },
    dot, colorName, h('span', { class: 'color-caret', 'aria-hidden': 'true' }, '▾'));
  const options = NOTE_COLORS.map((c) => h('li', { role: 'option', class: 'color-option', tabindex: '-1', dataset: { id: c.id } },
    h('span', { class: 'color-dot', style: `background:${c.hex}` }), h('span', {}, c.name)));
  const list = h('ul', { class: 'color-list hidden', role: 'listbox', 'aria-labelledby': 'noteColorLabel' }, options);

  const paintColor = () => {
    const c = noteColor(colorId);
    dot.style.background = c.hex;
    colorName.textContent = c.name;
    for (const o of options) o.setAttribute('aria-selected', String(o.dataset.id === colorId));
  };
  const openList = (open) => {
    list.classList.toggle('hidden', !open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) options.find((o) => o.dataset.id === colorId)?.focus();
  };
  const choose = (id) => { colorId = id; paintColor(); openList(false); trigger.focus(); };
  trigger.addEventListener('click', () => openList(list.classList.contains('hidden')));
  trigger.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowDown') { ev.preventDefault(); openList(true); } });
  options.forEach((o, i) => {
    o.addEventListener('click', () => choose(o.dataset.id));
    o.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(o.dataset.id); }
      else if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') { ev.preventDefault(); options[(i + 1) % options.length].focus(); }
      else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') { ev.preventDefault(); options[(i - 1 + options.length) % options.length].focus(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); openList(false); trigger.focus(); } // schließt nur die Liste, nicht das Popup
    });
  });
  paintColor();

  const collect = () => {
    const g = parseAmount(gain.value);
    const v = parseAmount(loss.value);
    // Gewinn und Verlust zusammen ergeben das Tagesergebnis; beide leer = kein Ergebnis
    const result = g == null && v == null ? null : Math.abs(g || 0) - Math.abs(v || 0);
    return { pnl: isMonth ? null : result, note: note.value, note_color: colorId }; // Monat: Ergebnis kommt aus den Tagen
  };
  const save = (ev) => { ev.preventDefault(); actions.savePopup(iso, collect()); };

  const form = h('form', { class: 'day-modal', onSubmit: save },
    h('div', { class: 'modal-head' },
      h('h2', {}, title),
      h('button', { type: 'button', class: 'text-btn', 'aria-label': 'Schließen', onClick: () => actions.closePopup() }, '×')),
    isMonth
      // Monat: Ergebnis ergibt sich aus den Tagen (Gewinne - Verluste), keine Eingabefelder
      ? h('div', { class: 'month-sum' },
        h('span', { class: 'month-sum-label' }, 'Ergebnis des Monats · Gewinne − Verluste der Tage'),
        brk.traded
          ? h('div', { class: 'month-sum-formula' },
            h('span', { class: 'pos' }, fmtMoney(brk.gains, CONFIG.CURRENCY, false)),
            h('span', { class: 'op' }, '−'),
            h('span', { class: 'neg' }, fmtMoney(brk.losses, CONFIG.CURRENCY, false)),
            h('span', { class: 'op' }, '='),
            h('strong', { class: signClass(brk.result) }, fmtMoney(brk.result, CONFIG.CURRENCY)))
          : h('p', { class: 'muted small' }, 'Noch keine Tage mit Gewinn oder Verlust in diesem Monat.'))
      : h('div', { class: 'modal-pnl' },
        h('label', { class: 'field' }, h('span', {}, `Gewinn (${CONFIG.CURRENCY})`), gain),
        h('label', { class: 'field' }, h('span', {}, `Verlust (${CONFIG.CURRENCY})`), loss)),
    h('label', { class: 'field' }, h('span', {}, 'Notiz'), note),
    h('div', { class: 'field' }, h('span', { id: 'noteColorLabel' }, 'Farbe der Notiz'), trigger, list),
    // Nur auf dem Handy sichtbar (CSS): dort fehlt "Öffnen" in der Kalenderzelle
    h('button', { type: 'button', class: 'modal-open', onClick: () => actions.savePopupAndOpen(iso, collect()) }, 'Öffnen · Bilder & Auswertung'),
    h('div', { class: 'modal-actions' },
      entry && h('button', { type: 'button', class: 'text-btn danger',
        onClick: () => { if (confirm(isMonth ? 'Alle Einträge dieses Monats (Notiz, Bilder, Auswertung) löschen? Die Tage bleiben erhalten.' : 'Alle Einträge dieses Tages löschen?')) actions.clearPopup(iso); } }, isMonth ? 'Monat leeren' : 'Tag leeren'),
      h('div', { class: 'spacer' }),
      h('button', { type: 'button', class: 'text-btn', onClick: () => actions.closePopup() }, 'Abbrechen'),
      h('button', { type: 'submit', class: 'primary' }, 'Speichern')),
  );

  root.onclick = (ev) => { if (ev.target === root) actions.closePopup(); };
  root.replaceChildren(form);
  root.classList.remove('hidden');
  // Kein Auto-Fokus: die Tastatur soll erst erscheinen, wenn ein Eingabefeld angetippt wird
  form.tabIndex = -1;
  form.focus({ preventScroll: true });
}
