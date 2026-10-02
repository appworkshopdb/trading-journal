// Gesamtübersicht: alle Märkte (BTC + GOLD) zusammengerechnet, mit Vergleich je Markt.
// Aufbau der Seite (von oben nach unten):
//   1. Kennzahlen (Ergebnis, Trefferquote, R-Summe, Profitfaktor, Trades, Handelstage)
//   2. Trade-Verteilung: gewonnen / verloren / verpasst / ausgesetzt – gesamt und je Markt
//   3. Vergleich BTC | GOLD | Gesamt als Tabelle (Ergebnis, Tage, Trades, Risiko/Rendite)
//   4. Verlauf: Ergebnis pro Monat (je Markt) und kumulierter Verlauf
//   5. Monatstabelle
// Die Daten lädt actions.loadOverview() (state.overview.data = { BTC: [Einträge], GOLD: [...] }, nur Tageseinträge).
// Reines Rendering – keine Datenzugriffe.

import { h, MARKETS, MONTHS_SHORT, fmtMoney, fmtCompact, signClass, periodStats, tradesOf } from './utils.js';
import { CONFIG } from '../config.js';

// ---------------------------------------------------------------- Berechnung

/** Kennzahlen einer Liste von Tageseinträgen (Grundlage: periodStats + zusätzliche Werte) */
export function summarize(entries) {
  const st = periodStats(entries);
  let grossWin = 0, grossLoss = 0, best = null, worst = null, lossRRSum = 0, lossRRCount = 0;
  for (const e of entries) {
    if (e.pnl != null) {
      if (e.pnl > 0) grossWin += e.pnl; else if (e.pnl < 0) grossLoss += -e.pnl;
      if (best == null || e.pnl > best.pnl) best = { pnl: e.pnl, date: e.date };
      if (worst == null || e.pnl < worst.pnl) worst = { pnl: e.pnl, date: e.date };
    }
    for (const t of tradesOf(e)) {
      if (t.status || t.rr == null) continue;
      const sign = t.net ? Math.sign(t.net) : Math.sign(t.rr);
      if (sign < 0) { lossRRSum += t.rr; lossRRCount++; }
    }
  }
  return {
    ...st,
    grossWin, grossLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    avgWinDay: st.wins ? grossWin / st.wins : null,
    avgLossDay: st.losses ? grossLoss / st.losses : null,
    best, worst,
    avgLossRR: lossRRCount ? lossRRSum / lossRRCount : null,
    expectancyR: st.rCount ? st.rSum / st.rCount : null, // Ø R je Trade mit RR
  };
}

/** Summe der Tagesergebnisse je Monat: Map 'YYYY-MM' -> { BTC, GOLD } */
function monthlyResults(byMarket) {
  const months = new Map();
  for (const mk of MARKETS) {
    for (const e of byMarket[mk] || []) {
      if (e.pnl == null) continue;
      const key = e.date.slice(0, 7);
      if (!months.has(key)) months.set(key, Object.fromEntries(MARKETS.map((m) => [m, 0])));
      months.get(key)[mk] += e.pnl;
    }
  }
  return months;
}

/** Lückenlose Monatsliste von 'YYYY-MM' bis 'YYYY-MM' */
function monthRange(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

// ---------------------------------------------------------------- Formatierung

const money = (v) => (v == null ? '–' : fmtMoney(v, CONFIG.CURRENCY));
const moneyPlain = (v) => (v == null ? '–' : fmtMoney(v, CONFIG.CURRENCY, false));
const pct = (v) => (v == null ? '–' : Math.round(v * 100) + ' %');
const num = (v, d = 2) => (v == null ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
const rr = (v) => (v == null ? '–' : (v > 0 ? '+' : '') + v.toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' R');
const int = (v) => String(v);
const dayLabel = (b) => (b ? h('span', { class: 'cmp-day' }, money(b.pnl), h('small', {}, b.date.split('-').reverse().join('.'))) : '–');

// ---------------------------------------------------------------- Seite

export function overviewPage(state, actions) {
  const ov = state.overview;
  const page = h('div', { class: 'overview' });
  page.append(h('div', { class: 'overview-head' },
    h('div', {},
      h('h1', { class: 'analysis-title' }, 'Gesamtübersicht'),
      h('p', { class: 'muted small' }, `${MARKETS.join(' + ')} zusammengerechnet · Beträge in ${CONFIG.CURRENCY}`))));

  if (ov.status === 'loading' || ov.status === 'idle') { page.append(h('p', { class: 'muted' }, 'Daten werden geladen …')); return page; }
  if (ov.status === 'error') { page.append(h('p', { class: 'error' }, 'Daten konnten nicht geladen werden. Bitte die Seite neu öffnen.')); return page; }

  // Zeitraum: alle Jahre oder ein einzelnes Jahr
  const allEntries = MARKETS.flatMap((mk) => ov.data[mk] || []);
  const years = [...new Set(allEntries.map((e) => e.date.slice(0, 4)))].sort().reverse();
  const period = ov.year !== 'all' && years.includes(ov.year) ? ov.year : 'all';
  const select = h('select', { class: 'year-select', 'aria-label': 'Zeitraum', onChange: (ev) => actions.setOverviewYear(ev.target.value) },
    h('option', { value: 'all' }, 'Alle Jahre'),
    years.map((y) => h('option', { value: y }, y)));
  select.value = period;
  page.firstChild.append(select);

  const byMarket = Object.fromEntries(MARKETS.map((mk) => [mk, (ov.data[mk] || []).filter((e) => period === 'all' || e.date.startsWith(period + '-'))]));
  const total = summarize(MARKETS.flatMap((mk) => byMarket[mk]));
  const per = Object.fromEntries(MARKETS.map((mk) => [mk, summarize(byMarket[mk])]));

  if (!total.traded && !total.tradeCount && !total.tradeMissed && !total.tradeSkipped) {
    page.append(h('p', { class: 'muted' }, 'Für diesen Zeitraum liegen noch keine Einträge vor.'));
    return page;
  }

  page.append(
    section('Kennzahlen', kpis(total, per)),
    section('Trade-Verteilung', distribution(total, per)),
    section('Vergleich der Märkte', compareTable(total, per)),
    section('Verlauf', charts(byMarket, period)),
    section('Monate', monthTable(byMarket)),
  );
  return page;
}

function section(title, ...content) {
  return h('section', { class: 'ov-section' }, h('h2', { class: 'ov-title' }, title), ...content);
}

// ---- 1. Kennzahlen

function kpis(t, per) {
  const tile = (label, value, cls = '', sub = null) => h('div', { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: `stat-value ${cls}` }, value),
    sub && h('span', { class: 'stat-sub' }, sub));
  const split = MARKETS.map((mk) => `${mk} ${per[mk].traded ? fmtCompact(per[mk].sum) : '–'}`).join(' · ');
  return h('div', { class: 'stats ov-kpis' },
    tile(t.sum < 0 ? 'Verlust gesamt' : 'Ergebnis gesamt', t.traded ? money(t.sum) : '–', signClass(t.sum), split),
    tile('Trefferquote', pct(t.winRate), '', t.tradeCount ? `${t.tradeWins} von ${t.tradeCount} Trades` : null),
    tile('R-Summe', rr(t.rSum), signClass(t.rSum), t.expectancyR != null ? `Ø ${rr(t.expectancyR)} je Trade` : null),
    tile('Profitfaktor', num(t.profitFactor), t.profitFactor != null ? (t.profitFactor >= 1 ? 'pos' : 'neg') : '', 'Gewinne ÷ Verluste'),
    tile('Trades', int(t.tradeCount), '', `${t.tradeMissed} verpasst · ${t.tradeSkipped} ausgesetzt`),
    tile('Handelstage', int(t.traded), '', `${t.wins} Gewinn · ${t.losses} Verlust`),
  );
}

// ---- 2. Verteilung

function distribution(total, per) {
  const rows = [['Gesamt', total], ...MARKETS.map((mk) => [mk, per[mk]])];
  const parts = [
    ['won', 'Gewonnen', (s) => s.tradeWins],
    ['lost', 'Verloren', (s) => s.tradeLosses],
    ['missed', 'Verpasst', (s) => s.tradeMissed],
    ['skipped', 'Ausgesetzt', (s) => s.tradeSkipped],
  ];
  const legend = h('div', { class: 'dist-legend' }, parts.map(([k, label]) => h('span', { class: 'dist-key' }, h('i', { class: `dist-dot ${k}` }), label)));
  return h('div', { class: 'dist' }, legend, rows.map(([label, s]) => {
    const sum = parts.reduce((n, [, , f]) => n + f(s), 0) || 1;
    // Nicht-gehandelte Trades bleiben in der Trefferquote außen vor, werden hier aber mitgezeigt
    return h('div', { class: 'dist-row' },
      h('span', { class: 'dist-label' }, label),
      h('div', { class: 'dist-bar', role: 'img', 'aria-label': parts.map(([, l, f]) => `${l} ${f(s)}`).join(', ') },
        parts.map(([k, l, f]) => f(s) > 0 && h('span', { class: `dist-seg ${k}`, style: `flex:${f(s)}`, title: `${l}: ${f(s)} (${Math.round(f(s) / sum * 100)} %)` }, f(s)))),
      h('span', { class: 'dist-rate muted small' }, `Treffer ${pct(s.winRate)}`));
  }));
}

// ---- 3. Vergleichstabelle

function compareTable(total, per) {
  const cols = [...MARKETS.map((mk) => per[mk]), total];
  // [Bezeichnung, Formatter, Klasse-nach-Vorzeichen?]
  const groups = [
    ['Ergebnis', [
      ['Ergebnis', (s) => (s.traded ? money(s.sum) : '–'), (s) => signClass(s.sum), true],
      ['Gewinne (Summe)', (s) => (s.traded ? moneyPlain(s.grossWin) : '–'), () => 'pos'],
      ['Verluste (Summe)', (s) => (s.traded ? moneyPlain(s.grossLoss) : '–'), () => 'neg'],
      ['Profitfaktor', (s) => num(s.profitFactor)],
    ]],
    ['Tage', [
      ['Handelstage', (s) => int(s.traded)],
      ['Gewinntage', (s) => int(s.wins), () => 'pos'],
      ['Verlusttage', (s) => int(s.losses), () => 'neg'],
      ['Ø Gewinn je Gewinntag', (s) => money(s.avgWinDay)],
      ['Ø Verlust je Verlusttag', (s) => (s.avgLossDay == null ? '–' : moneyPlain(-s.avgLossDay))],
      ['Bester Tag', (s) => dayLabel(s.best)],
      ['Schlechtester Tag', (s) => dayLabel(s.worst)],
    ]],
    ['Trades', [
      ['Gehandelt', (s) => int(s.tradeCount)],
      ['Gewonnen', (s) => int(s.tradeWins), () => 'pos'],
      ['Verloren', (s) => int(s.tradeLosses), () => 'neg'],
      ['Verpasst', (s) => int(s.tradeMissed)],
      ['Ausgesetzt', (s) => int(s.tradeSkipped)],
      ['Trefferquote', (s) => pct(s.winRate), null, true],
    ]],
    ['Risiko / Rendite (RR)', [
      ['R-Summe', (s) => rr(s.rSum), (s) => signClass(s.rSum), true],
      ['Ø RR Gewinner', (s) => rr(s.avgWinRR)],
      ['Ø RR Verlierer', (s) => rr(s.avgLossRR)],
      ['Ø R je Trade', (s) => rr(s.expectancyR), (s) => signClass(s.expectancyR)],
      ['Breakeven-Quote', (s) => pct(s.breakeven)],
    ]],
  ];
  const body = [];
  for (const [title, rows] of groups) {
    body.push(h('tr', { class: 'cmp-group' }, h('th', { colspan: cols.length + 1 }, title)));
    for (const [label, fmt, cls, strong] of rows) {
      body.push(h('tr', { class: strong ? 'cmp-strong' : '' },
        h('th', { scope: 'row' }, label),
        cols.map((s, i) => h('td', { class: `${cls ? cls(s) : ''}${i === cols.length - 1 ? ' cmp-total' : ''}` }, fmt(s)))));
    }
  }
  return h('div', { class: 'cmp-wrap' }, h('table', { class: 'cmp' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), MARKETS.map((mk) => h('th', { class: `cmp-col mk-${mk}` }, mk)), h('th', { class: 'cmp-col cmp-total' }, 'Gesamt'))),
    h('tbody', {}, body)));
}

// ---- 4. Diagramme (Inline-SVG)

const W = 560, PAD = { l: 46, r: 10, t: 12, b: 24 };

/** "schöne" Achsenwerte von min bis max */
function niceTicks(min, max, count = 4) {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * pow).find((s) => s >= raw) || 10 * pow;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}
const axisNum = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k' : v.toLocaleString('de-DE', { maximumFractionDigits: 0 }));
const monthText = (key) => `${MONTHS_SHORT[Number(key.slice(5)) - 1]} ${key.slice(2, 4)}`;

function frame(height, ticks, y, labels, xAt, step) {
  const H = height;
  const grid = ticks.map((v) => `<line class="ax-grid${v === 0 ? ' zero' : ''}" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/><text class="ax-text" x="${PAD.l - 6}" y="${y(v) + 3.5}" text-anchor="end">${axisNum(v)}</text>`).join('');
  const xs = labels.map((l, i) => (i % step === 0 ? `<text class="ax-text" x="${xAt(i)}" y="${H - 8}" text-anchor="middle">${monthText(l)}</text>` : '')).join('');
  return grid + xs;
}

function charts(byMarket, period) {
  const results = monthlyResults(byMarket);
  if (!results.size) return h('p', { class: 'muted' }, 'Noch keine Ergebnisse.');
  const keys = [...results.keys()].sort();
  const months = period === 'all' ? monthRange(keys[0], keys[keys.length - 1]) : monthRange(`${period}-01`, `${period}-12`);
  const val = (key, mk) => results.get(key)?.[mk] || 0;
  const step = Math.ceil(months.length / 6); // höchstens ca. 6 Beschriftungen, sonst überlappen sie

  // --- Ergebnis pro Monat: je Markt ein Balken
  const H1 = 220;
  const all = months.flatMap((k) => MARKETS.map((mk) => val(k, mk)));
  const ticks1 = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const y1 = (v) => PAD.t + (1 - (v - ticks1[0]) / (ticks1[ticks1.length - 1] - ticks1[0])) * (H1 - PAD.t - PAD.b);
  const gw = (W - PAD.l - PAD.r) / months.length;
  const bw = Math.min(18, gw * 0.38);
  let bars = '';
  months.forEach((k, i) => {
    const cx = PAD.l + gw * (i + 0.5);
    MARKETS.forEach((mk, j) => {
      const v = val(k, mk);
      if (!v) return;
      const x = cx + (j - (MARKETS.length - 1) / 2) * (bw + 2) - bw / 2;
      const top = Math.min(y1(v), y1(0)), hgt = Math.max(1, Math.abs(y1(v) - y1(0)));
      bars += `<rect class="bar mk-${mk}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${hgt.toFixed(1)}" rx="2"><title>${monthText(k)} · ${mk}: ${money(v)}</title></rect>`;
    });
  });
  const svg1 = `<svg viewBox="0 0 ${W} ${H1}" class="ov-svg" role="img" aria-label="Ergebnis pro Monat je Markt">${frame(H1, ticks1, y1, months, (i) => PAD.l + gw * (i + 0.5), step)}${bars}</svg>`;

  // --- Kumulierter Verlauf: Gesamt + je Markt
  const H2 = 220;
  const series = { Gesamt: [], ...Object.fromEntries(MARKETS.map((mk) => [mk, []])) };
  const run = Object.fromEntries(MARKETS.map((mk) => [mk, 0]));
  for (const k of months) {
    for (const mk of MARKETS) { run[mk] += val(k, mk); series[mk].push(run[mk]); }
    series.Gesamt.push(MARKETS.reduce((n, mk) => n + run[mk], 0));
  }
  const flat = Object.values(series).flat();
  const ticks2 = niceTicks(Math.min(0, ...flat), Math.max(0, ...flat));
  const y2 = (v) => PAD.t + (1 - (v - ticks2[0]) / (ticks2[ticks2.length - 1] - ticks2[0])) * (H2 - PAD.t - PAD.b);
  const xAt = (i) => PAD.l + gw * (i + 0.5);
  const line = (name, cls) => {
    const pts = series[name].map((v, i) => `${xAt(i).toFixed(1)},${y2(v).toFixed(1)}`).join(' ');
    const dots = months.length <= 24 ? series[name].map((v, i) => `<circle class="dot ${cls}" cx="${xAt(i).toFixed(1)}" cy="${y2(v).toFixed(1)}" r="2.6"><title>${monthText(months[i])} · ${name}: ${money(v)}</title></circle>`).join('') : '';
    return `<polyline class="ln ${cls}" points="${pts}" fill="none"/>${dots}`;
  };
  const svg2 = `<svg viewBox="0 0 ${W} ${H2}" class="ov-svg" role="img" aria-label="Kumuliertes Ergebnis">${frame(H2, ticks2, y2, months, xAt, step)}${MARKETS.map((mk) => line(mk, `mk-${mk}`)).join('')}${line('Gesamt', 'total')}</svg>`;

  const legend = (withTotal) => h('div', { class: 'dist-legend' },
    MARKETS.map((mk) => h('span', { class: 'dist-key' }, h('i', { class: `dist-dot mk-${mk}` }), mk)),
    withTotal && h('span', { class: 'dist-key' }, h('i', { class: 'dist-dot total' }), 'Gesamt'));
  return h('div', { class: 'ov-charts' },
    h('div', { class: 'ov-chart' }, h('h3', { class: 'ov-sub' }, 'Ergebnis pro Monat'), legend(false), h('div', { html: svg1 })),
    h('div', { class: 'ov-chart' }, h('h3', { class: 'ov-sub' }, 'Kumulierter Verlauf'), legend(true), h('div', { html: svg2 })));
}

// ---- 5. Monatstabelle

function monthTable(byMarket) {
  const results = monthlyResults(byMarket);
  const keys = [...results.keys()].sort().reverse(); // neueste zuerst
  if (!keys.length) return h('p', { class: 'muted' }, 'Noch keine Ergebnisse.');
  const cell = (v) => h('td', { class: signClass(v) }, v ? money(v) : '–');
  const sums = Object.fromEntries(MARKETS.map((mk) => [mk, keys.reduce((n, k) => n + results.get(k)[mk], 0)]));
  return h('div', { class: 'cmp-wrap' }, h('table', { class: 'cmp months' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Monat'), MARKETS.map((mk) => h('th', { class: `cmp-col mk-${mk}` }, mk)), h('th', { class: 'cmp-col cmp-total' }, 'Gesamt'))),
    h('tbody', {}, keys.map((k) => {
      const r = results.get(k);
      const t = MARKETS.reduce((n, mk) => n + r[mk], 0);
      return h('tr', {}, h('th', { scope: 'row' }, `${MONTHS_SHORT[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`), MARKETS.map((mk) => cell(r[mk])), h('td', { class: `cmp-total ${signClass(t)}` }, t ? money(t) : '–'));
    })),
    h('tfoot', {}, h('tr', { class: 'cmp-strong' }, h('th', { scope: 'row' }, 'Summe'),
      MARKETS.map((mk) => cell(sums[mk])),
      h('td', { class: `cmp-total ${signClass(MARKETS.reduce((n, mk) => n + sums[mk], 0))}` }, money(MARKETS.reduce((n, mk) => n + sums[mk], 0)))))));
}
