// Popup zum Antippen eines Kalendertags: Trades (Gewinn, Verlust, RR – optional mehrere), Notiz, Notizfarbe.
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

  // Trades: je Zeile Gewinn, Verlust, RR. Ohne gespeicherte Trades wird das bisherige Tagesergebnis in Zeile 1 verteilt.
  const pnl = entry?.pnl ?? null;
  const initial = entry?.trades?.length
    ? entry.trades
    : [{ gain: pnl != null && pnl >= 0 ? pnl : null, loss: pnl != null && pnl < 0 ? -pnl : null, rr: null, status: null }];
  const tradeRows = [];
  let onTradeChange = () => {}; // wird weiter unten gesetzt (Farb-Automatik)
  const tradesBox = h('div', { class: 'trade-rows' });
  const addTrade = (t = {}) => {
    const mk = (cls, val, label, ph) => h('input', { type: 'text', inputmode: 'decimal', class: cls, placeholder: ph, value: val == null ? '' : toField(val), 'aria-label': label });
    const row = {
      gain: mk('pnl-gain', t.gain, `Gewinn (${CONFIG.CURRENCY})`, '0,00'),
      loss: mk('pnl-loss', t.loss, `Verlust (${CONFIG.CURRENCY})`, '0,00'),
      rr: mk('pnl-rr', t.rr, 'RR', '0,0'),
      status: t.status || null, // null | 'missed' | 'skipped'
    };
    for (const input of [row.gain, row.loss]) input.addEventListener('input', () => onTradeChange());
    const idx = tradeRows.length;
    // Verpasst / Ausgesetzt: Trade wurde nicht gehandelt (zählt später getrennt in den Auswertungen); erneutes Tippen hebt auf
    const flags = [['missed', 'Verpasst'], ['skipped', 'Ausgesetzt']].map(([key, label]) => {
      const btn = h('button', { type: 'button', class: 'trade-flag', 'aria-pressed': String(row.status === key) }, label);
      btn.onclick = () => {
        row.status = row.status === key ? null : key;
        for (const b of flags) b.setAttribute('aria-pressed', String(b.dataset.key === row.status));
        row.el.classList.toggle('not-taken', !!row.status);
        onTradeChange();
      };
      btn.dataset.key = key;
      return btn;
    });
    row.el = h('div', { class: `trade-row${row.status ? ' not-taken' : ''}` },
      h('label', { class: 'field' }, idx === 0 && h('span', {}, `Gewinn (${CONFIG.CURRENCY})`), row.gain),
      h('label', { class: 'field' }, idx === 0 && h('span', {}, `Verlust (${CONFIG.CURRENCY})`), row.loss),
      h('label', { class: 'field' }, idx === 0 && h('span', {}, 'RR'), row.rr),
      h('button', { type: 'button', class: 'text-btn trade-remove', hidden: idx === 0 || null, 'aria-label': 'Trade entfernen',
        onClick: () => { tradeRows.splice(tradeRows.indexOf(row), 1); row.el.remove(); onTradeChange(); } }, '×'),
      h('div', { class: 'trade-flags' }, flags));
    tradeRows.push(row);
    tradesBox.append(row.el);
  };
  initial.forEach(addTrade);
  const note = h('textarea', { class: 'note-area', rows: 4, placeholder: isMonth ? 'Kurze Notiz zum Monat …' : 'Kurze Notiz zum Tag …' });
  note.value = entry?.note || '';

  // Eigene Dropdown-Liste, damit jede Farbe schon in der Liste sichtbar ist (ein <select> kann das nicht überall)
  let colorId = noteColor(entry?.note_color).id;
  let colorTouched = false; // sobald die Farbe selbst gewählt wurde, setzt die Automatik sie nicht mehr
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
  const choose = (id) => { colorId = id; colorTouched = true; paintColor(); openList(false); trigger.focus(); };
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

  // Farbe passend zu den Trades vorwählen: Gewinn grün, Verlust rot, verpasst gelb, ausgesetzt grau – jederzeit änderbar
  const autoColor = () => {
    if (colorTouched || isMonth) return;
    const rows = tradeRows.map((r) => ({ g: parseAmount(r.gain.value), l: parseAmount(r.loss.value), status: r.status }));
    const taken = rows.filter((r) => !r.status && (r.g != null || r.l != null));
    const net = taken.reduce((sum, r) => sum + Math.abs(r.g || 0) - Math.abs(r.l || 0), 0);
    let id = null;
    if (taken.length && net > 0) id = 'gruen';
    else if (taken.length && net < 0) id = 'rot';
    else if (rows.some((r) => r.status === 'missed')) id = 'gelb';
    else if (rows.some((r) => r.status === 'skipped')) id = 'grau';
    if (id && id !== colorId) { colorId = id; paintColor(); }
  };
  onTradeChange = autoColor;

  const collect = () => {
    const trades = tradeRows
      .map((r) => ({ gain: parseAmount(r.gain.value), loss: parseAmount(r.loss.value), rr: parseAmount(r.rr.value), status: r.status }))
      .filter((t) => t.gain != null || t.loss != null || t.rr != null || t.status)
      .map((t) => ({ gain: t.gain == null ? null : Math.abs(t.gain), loss: t.loss == null ? null : Math.abs(t.loss), rr: t.rr, ...(t.status && { status: t.status }) }));
    // Gewinn und Verlust der gehandelten Trades ergeben das Tagesergebnis (verpasste/ausgesetzte zählen nicht); alles leer = kein Ergebnis
    const taken = trades.filter((t) => !t.status);
    const hasMoney = taken.some((t) => t.gain != null || t.loss != null);
    const result = hasMoney ? taken.reduce((sum, t) => sum + (t.gain || 0) - (t.loss || 0), 0) : null;
    // Trades werden nur gespeichert, wenn sie über einen einfachen Tagesgewinn/-verlust hinausgehen (mehrere Zeilen, RR oder Status)
    const detailed = trades.length > 1 || trades.some((t) => t.rr != null || t.status);
    return { pnl: isMonth ? null : result, trades: isMonth || !detailed ? [] : trades, note: note.value, note_color: colorId }; // Monat: Ergebnis kommt aus den Tagen
  };
  const save = (ev) => { ev.preventDefault(); actions.savePopup(iso, collect()); };

  const form = h('form', { class: 'day-modal', onSubmit: save },
    h('div', { class: 'modal-head' },
      h('h2', {}, title),
      h('button', { type: 'button', class: 'text-btn', 'aria-label': 'Schließen', onClick: () => actions.closePopup() }, '×')),
    isMonth
      // Monat: Ergebnis ergibt sich aus den Tagen (Gewinne - Verluste), keine Eingabefelder
      ? h('div', { class: 'month-sum' },
        h('span', { class: 'month-sum-label' }, 'Ergebnis des Monats'),
        brk.traded
          ? h('div', { class: 'month-sum-formula' },
            h('div', { class: 'ms-cell' }, h('span', { class: 'ms-val pos' }, fmtMoney(brk.gains, CONFIG.CURRENCY, false)), h('span', { class: 'ms-cap' }, 'Gewinne')),
            h('span', { class: 'ms-op' }, '−'),
            h('div', { class: 'ms-cell' }, h('span', { class: 'ms-val neg' }, fmtMoney(brk.losses, CONFIG.CURRENCY, false)), h('span', { class: 'ms-cap' }, 'Verluste')),
            h('span', { class: 'ms-op' }, '='),
            h('div', { class: 'ms-cell' }, h('strong', { class: `ms-val ${signClass(brk.result)}` }, fmtMoney(brk.result, CONFIG.CURRENCY)), h('span', { class: 'ms-cap' }, 'Ergebnis')))
          : h('p', { class: 'muted small' }, 'Noch keine Tage mit Gewinn oder Verlust in diesem Monat.'))
      : h('div', { class: 'modal-trades' }, tradesBox,
        h('button', { type: 'button', class: 'text-btn add-trade', onClick: () => addTrade() }, '+ weiterer Trade')),
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
