// Kalender: Monatsansicht (Wochenzeilen × 7 Tage) und Jahresansicht (4 × 3 Monate).
// Reines Rendering – Datenzugriff und Navigation laufen über `actions` (siehe app.js).

import { h, MONTHS, MONTHS_SHORT, WEEKDAYS, monthGrid, monthPrefix, fmtMoney, fmtCompact, signClass, periodStats, todayISO, escapeHtml, noteColor, dayEntriesOfMonth, monthTotal } from './utils.js';
import { CONFIG } from '../config.js';

export function renderCalendar(root, state, actions) {
  root.replaceChildren(state.view === 'month' ? monthView(state, actions) : yearView(state, actions));
}

/** Alle Tageseinträge eines Monats aus dem Cache */
function entriesOfMonth(state, y, m) {
  return dayEntriesOfMonth(state.days, monthPrefix(y, m));
}

function statTile(label, value, cls = '') {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: `stat-value ${cls}` }, value));
}

function statsBar(title, st) {
  return h('div', { class: 'stats' },
    statTile(title, st.traded ? fmtMoney(st.sum, CONFIG.CURRENCY) : '–', signClass(st.sum)),
    statTile('Gewinntage', st.wins, 'pos'),
    statTile('Verlusttage', st.losses, 'neg'),
    statTile('Trefferquote', st.winRate == null ? '–' : Math.round(st.winRate * 100) + ' %'),
  );
}

// ---------------- Monatsansicht ----------------

function monthView(state, actions) {
  const { year: y, month: m } = state;
  const today = todayISO();
  const grid = monthGrid(y, m);
  const st = periodStats(entriesOfMonth(state, y, m));

  const cells = grid.flat().map((c) => {
    const e = state.days[c.iso];
    const cls = ['day',
      !c.inMonth && 'outside',
      c.iso === today && 'today',
      c.iso === state.selectedDate && 'selected',
      e?.pnl != null && (e.pnl > 0 ? 'win' : e.pnl < 0 ? 'loss' : 'flat'),
    ].filter(Boolean).join(' ');

    // Die Zelle ist ein <div>: ein transparenter Button darüber öffnet das Popup, "Öffnen" den Detailbereich
    // (verschachtelte Buttons wären ungültiges HTML).
    const label = c.date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    return h('div', { class: cls, dataset: { date: c.iso } },
      h('button', { class: 'day-hit', 'aria-label': `${label} bearbeiten`, onClick: () => actions.openPopup(c.iso) }),
      h('span', { class: 'day-num' }, c.date.getDate()),
      e?.images?.length ? h('span', { class: 'day-marks' }, h('i', { class: 'mark mark-img', title: `${e.images.length} Bild(er)` }, e.images.length)) : null,
      e?.note?.trim() && h('div', { class: 'day-note', style: `--note:${noteColor(e.note_color).hex}` },
        h('span', { class: 'day-note-text' }, e.note)),
      h('div', { class: 'day-foot' },
        h('span', { class: 'day-pnl', title: e?.pnl != null ? fmtMoney(e.pnl, CONFIG.CURRENCY) : null }, e?.pnl != null ? fmtCompact(e.pnl) : ''),
        c.inMonth && h('button', { class: 'day-open', title: 'Bilder und Auswertung öffnen', onClick: () => actions.openDetail(c.iso) }, 'Öffnen')),
    );
  });

  return h('div', { class: 'month-view' },
    statsBar(`${MONTHS[m]} ${y}`, st),
    h('div', { class: 'weekdays' }, WEEKDAYS.map((w) => h('span', {}, w))),
    h('div', { class: 'month-grid', style: `--rows:${grid.length}` }, cells),
  );
}

// ---------------- Jahresansicht ----------------

function yearView(state, actions) {
  const y = state.year;
  const today = todayISO();
  const monthSums = [];
  let yearEntries = [];

  const months = Array.from({ length: 12 }, (_, m) => {
    const key = monthPrefix(y, m);
    const entries = entriesOfMonth(state, y, m);
    yearEntries = yearEntries.concat(entries);
    const e = state.days[key]; // eigener Eintrag des Monats (Notiz, Farbe, Bilder, Auswertung)
    const total = monthTotal(state.days, key);
    monthSums.push(total ?? 0);
    const byDate = Object.fromEntries(entries.map((d) => [d.date, d]));
    const cls = ['mini-month', key === state.selectedMonth && 'selected', total != null && (total > 0 ? 'win' : total < 0 ? 'loss' : 'flat')].filter(Boolean).join(' ');

    // Wie die Tageszelle: <div> mit transparentem Button (Popup) + "Öffnen" (Detailbereich)
    return h('div', { class: cls, dataset: { month: key } },
      h('button', { class: 'day-hit', 'aria-label': `${MONTHS[m]} ${y} bearbeiten`, onClick: () => actions.openPopup(key) }),
      h('div', { class: 'mini-head' },
        h('span', { class: 'mini-title', title: MONTHS[m] }, MONTHS_SHORT[m]),
        e?.images?.length ? h('i', { class: 'mark mark-img', title: `${e.images.length} Bild(er)` }, e.images.length) : null,
        h('span', { class: `mini-sum ${signClass(total)}`, title: total != null ? fmtMoney(total, CONFIG.CURRENCY) : null }, total != null ? fmtCompact(total) : ''),
      ),
      e?.note?.trim() && h('div', { class: 'day-note', style: `--note:${noteColor(e.note_color).hex}` },
        h('span', { class: 'day-note-text' }, e.note)),
      h('div', { class: 'mini-grid' }, monthGrid(y, m).flat().map((c) => {
        const d = byDate[c.iso];
        const dcls = ['mini-day', !c.inMonth && 'outside', c.iso === today && 'today',
          d?.pnl != null && (d.pnl > 0 ? 'win' : d.pnl < 0 ? 'loss' : 'flat')].filter(Boolean).join(' ');
        return h('span', { class: dcls, title: c.inMonth ? `${c.iso}${d?.pnl != null ? ' · ' + fmtMoney(d.pnl, CONFIG.CURRENCY) : ''}` : null });
      })),
      h('div', { class: 'day-foot' },
        h('button', { class: 'day-open', title: 'Bilder und Auswertung öffnen', onClick: () => actions.openDetail(key) }, 'Öffnen')),
    );
  });

  return h('div', { class: 'year-view' },
    statsBar(`Jahr ${y}`, periodStats(yearEntries)),
    barChart(monthSums),
    h('div', { class: 'year-grid' }, months),
  );
}

/** Balkendiagramm der Monatsergebnisse (inline SVG, keine Bibliothek) */
function barChart(sums) {
  const W = 480, H = 96, bottom = 14;
  const max = Math.max(1, ...sums.map(Math.abs));
  const zero = (H - bottom) / 2;
  const bw = W / 12;
  const bars = sums.map((v, i) => {
    const hh = Math.abs(v) / max * (zero - 4);
    const yPos = v >= 0 ? zero - hh : zero;
    const label = `${MONTHS[i]}: ${fmtMoney(v, CONFIG.CURRENCY)}`;
    return `<rect x="${(i * bw + 4).toFixed(1)}" y="${yPos.toFixed(1)}" width="${(bw - 8).toFixed(1)}" height="${Math.max(hh, v ? 1.5 : 0).toFixed(1)}" rx="2" class="${v >= 0 ? 'bar-pos' : 'bar-neg'}"><title>${escapeHtml(label)}</title></rect>`
      + `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 2}" class="bar-label">${MONTHS_SHORT[i]}</text>`;
  }).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" aria-label="Monatsergebnisse">`
    + `<line x1="0" y1="${zero}" x2="${W}" y2="${zero}" class="bar-axis"/>${bars}</svg>`;
  return h('div', { class: 'year-chart', html: svg });
}
