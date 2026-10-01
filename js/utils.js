// Kleine Helfer: Datum, Formatierung, DOM-Erzeugung. Keine Abhängigkeiten.

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MARKETS = ['BTC', 'GOLD']; // Märkte: jeder hat eigene Tages-/Monatseinträge
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Farben für die Tages-Notiz (Leiste im Kalender). Die IDs werden gespeichert – bestehende nicht umbenennen. */
export const NOTE_COLORS = [
  { id: 'blau',    name: 'Blau',    hex: '#2962ff' },
  { id: 'tuerkis', name: 'Türkis',  hex: '#00bcd4' },
  { id: 'gruen',   name: 'Grün',    hex: '#00e676' },
  { id: 'gelb',    name: 'Gelb',    hex: '#fdd835' },
  { id: 'orange',  name: 'Orange',  hex: '#ff9800' },
  { id: 'rot',     name: 'Rot',     hex: '#ff1744' },
  { id: 'pink',    name: 'Pink',    hex: '#e040fb' },
  { id: 'lila',    name: 'Lila',    hex: '#9c27b0' },
  { id: 'weiss',   name: 'Weiß',    hex: '#ffffff' },
  { id: 'grau',    name: 'Grau',    hex: '#787b86' },
];
export const noteColor = (id) => NOTE_COLORS.find((c) => c.id === id) || NOTE_COLORS[NOTE_COLORS.length - 1];

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

/** Feldwerte eines Eintrags als Objekt { feldId: wert } (alte Einträge hatten eine Liste [{id, value, label}]; in der alten Oberfläche war `value` der Feldname und `label` der Text) */
export function fieldValues(f) {
  if (Array.isArray(f)) return Object.fromEntries(f.map((x) => [x.id, x.label || '']));
  return f && typeof f === 'object' ? f : {};
}
export const hasFieldValues = (f) => Object.values(fieldValues(f)).some((v) => String(v ?? '').trim());

/** Bytes -> "12,3 MB" */
export function fmtBytes(n) {
  if (n == null || Number.isNaN(n)) return '–';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Number(n), i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString('de-DE', { maximumFractionDigits: i >= 2 ? 1 : 0 })} ${units[i]}`;
}

/** Bild mittig quadratisch zuschneiden und auf size x size verkleinern -> Canvas (für das Profilbild) */
export async function squareCanvas(file, size = 256) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return c;
}

/** Schlüssel eines Monatseintrags: 'YYYY-MM' (Tageseinträge: 'YYYY-MM-DD') */
export const isMonthKey = (key) => String(key).length === 7;
export function periodTitle(key, opts) {
  if (isMonthKey(key)) { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; }
  return fromISO(key).toLocaleDateString('de-DE', opts || { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
/** Tageseinträge eines Monats ('YYYY-MM') aus dem Cache (ohne den Monatseintrag selbst) */
export const dayEntriesOfMonth = (days, key) => Object.values(days).filter((d) => d.date.length === 10 && d.date.startsWith(key));
/** Aufschlüsselung eines Monats aus den Tagen: Gewinne (Summe positiver Tage), Verluste (Summe negativer Tage, als Betrag), Ergebnis */
export function monthBreakdown(days, key) {
  let gains = 0, losses = 0, traded = 0;
  for (const e of dayEntriesOfMonth(days, key)) {
    if (e.pnl == null) continue;
    traded++;
    if (e.pnl > 0) gains += e.pnl; else if (e.pnl < 0) losses += -e.pnl;
  }
  return { gains, losses, result: gains - losses, traded };
}
/** Monatsergebnis = Gewinne - Verluste der Tage; null, wenn an keinem Tag etwas eingetragen ist */
export function monthTotal(days, key) {
  const b = monthBreakdown(days, key);
  return b.traded ? b.result : null;
}

/**
 * Trades eines Tageseintrags. Ohne gespeicherte Trades zählt das Tagesergebnis als ein Trade.
 * Ein Trade gewinnt/verliert nach Gewinn − Verlust; ohne Beträge entscheidet das Vorzeichen des RR.
 * -> [{ net:number|null, rr:number|null }]
 */
export function tradesOf(e) {
  if (e.trades?.length) return e.trades.map((t) => ({ net: t.gain == null && t.loss == null ? null : (t.gain || 0) - (t.loss || 0), rr: t.rr ?? null }));
  return e.pnl == null ? [] : [{ net: e.pnl, rr: null }];
}

/**
 * Statistik über eine Liste von Tageseinträgen.
 * Tage: wins/losses/flat/traded. Trades: tradeWins/tradeLosses/tradeCount, winRate = Gewinn-Trades / alle Trades.
 * RR: rSum (Summe aller RR), avgWinRR (Ø RR der Gewinner), breakeven = 1 / (1 + avgWinRR) = nötige Trefferquote.
 */
export function periodStats(entries) {
  let sum = 0, wins = 0, losses = 0, flat = 0;
  let tradeWins = 0, tradeLosses = 0, tradeCount = 0, rSum = 0, rCount = 0, winRRSum = 0, winRRCount = 0;
  for (const e of entries) {
    if (e.pnl != null) {
      sum += e.pnl;
      if (e.pnl > 0) wins++; else if (e.pnl < 0) losses++; else flat++;
    }
    for (const t of tradesOf(e)) {
      tradeCount++;
      const sign = t.net ? Math.sign(t.net) : Math.sign(t.rr || 0);
      if (sign > 0) tradeWins++; else if (sign < 0) tradeLosses++;
      if (t.rr != null) {
        rSum += t.rr; rCount++;
        if (sign > 0) { winRRSum += t.rr; winRRCount++; }
      }
    }
  }
  const traded = wins + losses + flat;
  const avgWinRR = winRRCount ? winRRSum / winRRCount : null;
  return {
    sum, wins, losses, flat, traded,
    tradeWins, tradeLosses, tradeCount,
    winRate: tradeCount ? tradeWins / tradeCount : null,
    rSum: rCount ? rSum : null, rCount, avgWinRR,
    breakeven: avgWinRR != null && avgWinRR > -1 ? 1 / (1 + avgWinRR) : null,
  };
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
