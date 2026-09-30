// Kalender: Monatsansicht (Wochenzeilen × 7 Tage) und Jahresansicht (4 × 3 Monate).
// Reines Rendering – Datenzugriff und Navigation laufen über `actions` (siehe app.js).

import { h, MONTHS, MONTHS_SHORT, WEEKDAYS, monthGrid, monthPrefix, fmtMoney, fmtCompact, signClass, periodStats, todayISO, escapeHtml } from './utils.js';
import { CONFIG } from '../config.js';

export function renderCalendar(root, state, actions) {
  root.replaceChildren(state.view === 'month' ? monthView(state, actions) : yearView(state, actions));
}

/** Alle Tageseinträge eines Monats aus dem Cache */
function entriesOfMonth(state, y, m) {
  const prefix = monthPrefix(y, m);
  return Object.values(state.days).filter((d) => d.date.startsWith(prefix));
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

    return h('button', { class: cls, dataset: { date: c.iso }, onClick: () => actions.selectDay(c.iso) },
      h('span', { class: 'day-num' }, c.date.getDate()),
      e?.pnl != null && h('span', { class: 'day-pnl', title: fmtMoney(e.pnl, CONFIG.CURRENCY) }, fmtCompact(e.pnl)),
      h('span', { class: 'day-marks' },
        e?.note && h('i', { class: 'mark mark-note', title: 'Notiz vorhanden' }),
        e?.images?.length ? h('i', { class: 'mark mark-img', title: `${e.images.length} Bild(er)` }, e.images.length) : null,
      ),
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
    const entries = entriesOfMonth(state, y, m);
    yearEntries = yearEntries.concat(entries);
    const st = periodStats(entries);
    monthSums.push(st.traded ? st.sum : 0);
    const byDate = Object.fromEntries(entries.map((e) => [e.date, e]));

    return h('button', { class: 'mini-month', onClick: () => actions.openMonth(y, m) },
      h('div', { class: 'mini-head' },
        h('span', { class: 'mini-title', title: MONTHS[m] }, MONTHS_SHORT[m]),
        h('span', { class: `mini-sum ${signClass(st.sum)}`, title: fmtMoney(st.sum, CONFIG.CURRENCY) }, st.traded ? fmtCompact(st.sum) : ''),
      ),
      h('div', { class: 'mini-grid' }, monthGrid(y, m).flat().map((c) => {
        const e = byDate[c.iso];
        const cls = ['mini-day', !c.inMonth && 'outside', c.iso === today && 'today',
          e?.pnl != null && (e.pnl > 0 ? 'win' : e.pnl < 0 ? 'loss' : 'flat')].filter(Boolean).join(' ');
        return h('span', { class: cls, title: c.inMonth ? `${c.iso}${e?.pnl != null ? ' · ' + fmtMoney(e.pnl, CONFIG.CURRENCY) : ''}` : null });
      })),
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
