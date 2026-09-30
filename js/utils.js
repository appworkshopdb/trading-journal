// Kleine Helfer: Datum, Formatierung, DOM-Erzeugung. Keine Abhängigkeiten.

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export const pad2 = (n) => String(n).padStart(2, '0');

/** Date -> 'YYYY-MM-DD' (lokale Zeit, keine UTC-Verschiebung) */
export const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** 'YYYY-MM-DD' -> Date (lokale Zeit) */
export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISO(new Date());
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // m = 0-basiert
export const monthPrefix = (y, m) => `${y}-${pad2(m + 1)}`;

/** Erster und letzter Tag eines Monats als ISO */
export function monthRange(y, m) {
  return { from: `${monthPrefix(y, m)}-01`, to: `${monthPrefix(y, m)}-${pad2(daysInMonth(y, m))}` };
}

/**
 * Wochenraster eines Monats: Array von Wochen, jede Woche 7 Zellen, Montag zuerst.
 * Zelle: { date, iso, inMonth }
 */
export function monthGrid(y, m) {
  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7; // So=0 -> 6, Mo=1 -> 0
  const start = new Date(y, m, 1 - offset);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      week.push({ date: d, iso: toISO(d), inMonth: d.getMonth() === m });
    }
    if (w >= 4 && week.every((c) => !c.inMonth)) break; // 5. oder 6. Woche nur wenn nötig
    weeks.push(week);
  }
  return weeks;
}

/** Geldbetrag im deutschen Format, positive Werte mit '+' */
export function fmtMoney(v, currency = 'EUR', signed = true) {
  if (v == null || Number.isNaN(v)) return '';
  const s = new Intl.NumberFormat('de-DE', {
    style: 'currency', currency,
    minimumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2,
    maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2,
  }).format(v);
  return signed && v > 0 ? '+' + s : s;
}

export const signClass = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

/** Kompakte Zahl für Kalenderzellen: ohne Währungssymbol, ab 100 ohne Nachkommastellen, ab 10.000 als "12,3k" */
export function fmtCompact(v) {
  if (v == null || Number.isNaN(v)) return '';
  const a = Math.abs(v);
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  if (a >= 10000) return sign + (a / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k';
  if (a >= 100) return sign + a.toLocaleString('de-DE', { maximumFractionDigits: 0 });
  return sign + a.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2));

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Statistik über eine Liste von Tageseinträgen */
export function periodStats(entries) {
  let sum = 0, wins = 0, losses = 0, flat = 0;
  for (const e of entries) {
    if (e.pnl == null) continue;
    sum += e.pnl;
    if (e.pnl > 0) wins++; else if (e.pnl < 0) losses++; else flat++;
  }
  const traded = wins + losses + flat;
  return { sum, wins, losses, flat, traded, winRate: traded ? wins / traded : null };
}

/**
 * Mini-DOM-Builder: h('div', {class:'x', onClick: fn}, child, ...)
 * Attribute: class, dataset, on<Event>, html (innerHTML), alles andere -> setAttribute.
 * Kinder: Nodes, Strings, Zahlen, Arrays; null/false werden übersprungen.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
