// Positionsrechner je Markt (BTC = BTCUSDT, GOLD = XAUUSDT).
// Aus Stop, Entry und Ziel (TradingView-Preise) werden Menge, Positionsgröße, Margin, Verlust/Gewinn und RR
// berechnet – Gebühren sind eingerechnet: Entry = Limit (Maker), Stop = Market (Taker), Ziel = Limit (Maker).
// Reine Rechnung in berechne(); calcPage() baut die Seite. Eingaben (Preise) bleiben nur im Speicher, die Einstellungen
// (Risiko, Hebel, Gebühren, Mindest-RR) werden je Markt in localStorage gemerkt (UI-Einstellung, wie Theme/Splitter).
import { h } from './utils.js';
import { marketIcon } from './icons.js';

export const CALC_MARKETS = {
  BTC: { symbol: 'BTCUSDT', unit: 'BTC', decimals: 4, placeholder: ['81.849', '81.625', '80.808'], maxPrice: Infinity },
  GOLD: { symbol: 'XAUUSDT', unit: 'XAU', decimals: 2, placeholder: ['4174,35', '4170,13', '4157,87'], maxPrice: 20000 },
};
export const CALC_DEFAULTS = { risk: '56', lev: '50', mk: '0,02', tk: '0,06', minrr: '2' };

/** "81.849" / "4170,13" / "81849.5" -> Zahl (deutsche Schreibweise), sonst NaN */
export function num(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return parseFloat(s);
}

const floorTo = (n, d) => Math.floor(n * 10 ** d + 1e-9) / 10 ** d;

/**
 * Rechnet eine Position durch. Alle Beträge in USDT, Gebühren/Abstände als Dezimalzahl (0,0002 = 0,02 %).
 * opts: { risk, lev, maker, taker, minRR, decimals }. Gibt null zurück, wenn Stop/Entry unbrauchbar sind.
 */
export function berechne({ stop, entry, ziel }, opts) {
  const { risk, lev, maker, taker, minRR, decimals } = opts;
  if (!(stop > 0 && entry > 0) || stop === entry) return null;
  const isShort = stop > entry;
  const dist = Math.abs(stop - entry) / entry;
  const lossRate = dist + maker + taker; // Kurs + Gebühr Entry + Gebühr Stop
  const menge = floorTo(risk / lossRate / entry, decimals);
  const position = menge * entry;
  const fIn = position * maker, fSl = position * taker, pLoss = position * dist;
  const res = {
    isShort, dist, menge, position, margin: position / lev,
    fIn, fSl, pLoss, verlust: position * lossRate,
    minRR, rrBruttoNoetig: (minRR * lossRate + 2 * maker) / dist,
  };
  const zielOk = ziel > 0 && (isShort ? ziel < entry : ziel > entry);
  res.zielFalsch = ziel > 0 && !zielOk;
  if (zielOk) {
    const zDist = Math.abs(ziel - entry) / entry;
    res.pGain = position * zDist;
    res.fTp = position * maker;
    res.gewinn = res.pGain - fIn - res.fTp;
    res.rrBrutto = zDist / dist;
    res.rrNetto = res.gewinn / res.verlust;
    res.passt = res.rrNetto >= minRR;
  }
  return res;
}

// ---------------------------------------------------------------- Seite

const fmt = (n, d = 2) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n, d = 2) => (n < 0 ? '−' : '+') + fmt(Math.abs(n), d);

const inputs = { BTC: { sl: '', en: '', tp: '' }, GOLD: { sl: '', en: '', tp: '' } }; // nur im Speicher
let settingsOpen = false;

function loadSettings(market) {
  try { return { ...CALC_DEFAULTS, ...JSON.parse(localStorage.getItem(`tj.calc.${market}`) || 'null') }; } catch { return { ...CALC_DEFAULTS }; }
}
function saveSettings(market, s) {
  try { localStorage.setItem(`tj.calc.${market}`, JSON.stringify(s)); } catch { /* ohne Speicher weiter */ }
}

const stat = (label, value, cls = '') => h('div', { class: 'calc-stat' }, h('div', { class: 'calc-k' }, label), h('div', { class: `calc-v ${cls}`.trim() }, value));
const frow = (k, v) => h('div', { class: 'calc-fr' }, h('span', {}, k), h('b', {}, v));
const ftot = (k, v, cls) => h('div', { class: 'calc-ft' }, h('div', { class: 'calc-k' }, k), h('span', { class: `calc-a ${cls}` }, `${v} USDT`));

/** Ergebnisbereich (wird bei jeder Eingabe neu gebaut, die Eingabefelder bleiben stehen) */
function renderResult(market, out, dirEl) {
  const cfg = CALC_MARKETS[market];
  const inp = inputs[market];
  const st = loadSettings(market);
  const sl = num(inp.sl), en = num(inp.en), tp = num(inp.tp);
  const risk = num(st.risk), lev = num(st.lev), maker = num(st.mk) / 100, taker = num(st.tk) / 100, minRR = num(st.minrr);
  dirEl.textContent = '';
  const empty = (text) => out.replaceChildren(h('div', { class: 'calc-empty' }, text));

  if (!(sl > 0 && en > 0) || sl === en) return empty(`Trag Stop und Entry ein, dann siehst du, wie viel ${cfg.unit} du eingeben musst.`);
  if (!(risk > 0 && lev > 0 && maker >= 0 && taker >= 0)) return empty('Prüf die Einstellungen: Risiko und Hebel müssen größer als 0 sein.');
  if (sl > cfg.maxPrice || en > cfg.maxPrice || tp > cfg.maxPrice) {
    return out.replaceChildren(h('div', { class: 'calc-verdict no' }, h('strong', {}, 'Komma vergessen?'),
      h('span', {}, 'Gold steht um 4.000. Gib die Preise mit Komma ein, z. B. 4170,13 statt 417013.')));
  }
  const r = berechne({ stop: sl, entry: en, ziel: tp }, { risk, lev, maker, taker, minRR: Number.isFinite(minRR) ? minRR : 0, decimals: cfg.decimals });
  dirEl.textContent = `${r.isShort ? 'Short' : 'Long'} · Stop-Abstand ${fmt(r.dist * 100, 3)} %`;

  const copyBtn = h('button', { type: 'button', class: 'calc-copy' }, 'Betrag kopieren');
  copyBtn.onclick = async () => {
    const t = r.menge.toFixed(cfg.decimals);
    try { await navigator.clipboard.writeText(t); copyBtn.textContent = 'Kopiert'; } catch { copyBtn.textContent = t; }
    setTimeout(() => { copyBtn.textContent = 'Betrag kopieren'; }, 1500);
  };
  const stats = [
    stat('Positionsgröße', `${fmt(r.position, 0)} USDT`),
    stat(`Margin bei ${fmt(lev, 0)}x`, `${fmt(r.margin, 0)} USDT`),
    stat('Verlust am Stop', `−${fmt(r.verlust)} USDT`, 'neg'),
    stat('Gewinn am Ziel', r.gewinn != null ? `+${fmt(r.gewinn)} USDT` : '–', r.gewinn != null ? 'pos' : ''),
  ];
  let verdict = null, tpCol = null;
  if (r.gewinn != null) {
    stats.push(stat('RR brutto', fmt(r.rrBrutto)), stat('RR netto', fmt(r.rrNetto)));
    verdict = h('div', { class: `calc-verdict ${r.passt ? 'ok' : 'no'}` },
      h('strong', {}, `${r.passt ? 'Passt' : 'Zu wenig'}: netto ${fmt(r.rrNetto)} : 1`),
      h('span', {}, `Für netto ${fmt(r.minRR, 1)} : 1 brauchst du bei diesem Stop mindestens ${fmt(r.rrBruttoNoetig)} RR brutto.`));
    tpCol = h('div', { class: 'calc-fcol' }, h('div', { class: 'calc-fh tp' }, 'Am Ziel'),
      frow('Kurs (TradingView)', `+${fmt(r.pGain)}`), frow('Gebühr Entry', `−${fmt(r.fIn)}`), frow('Gebühr Ziel', `−${fmt(r.fTp)}`),
      ftot('Echter Gewinn', `+${fmt(r.gewinn)}`, 'pos'));
  } else if (r.zielFalsch) {
    verdict = h('div', { class: 'calc-verdict no' }, h('strong', {}, 'Ziel liegt auf der falschen Seite'),
      h('span', {}, `Bei einem ${r.isShort ? 'Short muss das Ziel unter' : 'Long muss das Ziel über'} dem Entry liegen.`));
  }
  out.replaceChildren(
    h('div', { class: 'calc-hero' },
      h('div', { class: 'calc-lbl' }, 'In Bitget als Betrag eingeben'),
      h('div', { class: 'calc-amt' }, fmt(r.menge, cfg.decimals), h('small', {}, cfg.unit)),
      copyBtn),
    h('div', { class: 'calc-stats' }, stats),
    verdict,
    h('div', { class: 'calc-fees' },
      h('div', { class: 'calc-fcol' }, h('div', { class: 'calc-fh sl' }, 'Am Stop'),
        frow('Kurs (TradingView)', `−${fmt(r.pLoss)}`), frow('Gebühr Entry', `−${fmt(r.fIn)}`), frow('Gebühr Stop', `−${fmt(r.fSl)}`),
        ftot('Echter Verlust', `−${fmt(r.verlust)}`, 'neg')),
      tpCol),
    h('p', { class: 'muted small calc-fnote' }, 'Die Zeile „Kurs (TradingView)“ ist ungefähr das, was TradingView an deiner SL- und TP-Linie anzeigt.'));
}

export function calcPage(state) {
  const market = state.calcMarket in CALC_MARKETS ? state.calcMarket : 'BTC';
  const cfg = CALC_MARKETS[market];
  const inp = inputs[market];
  const out = h('div', { class: 'calc-out' });
  const dirEl = h('div', { class: 'calc-dir' });
  const update = () => renderResult(market, out, dirEl);

  const priceRow = (key, label, cls, ph) => {
    const id = `calc-${market}-${key}`;
    return h('div', { class: `calc-prow ${cls}` },
      h('label', { for: id }, label),
      h('input', { id, inputmode: 'decimal', autocomplete: 'off', placeholder: ph, value: inp[key],
        onInput: (e) => { inp[key] = e.target.value; update(); } }));
  };

  const st = loadSettings(market);
  const setField = (key, label) => {
    const id = `calc-set-${market}-${key}`;
    return [h('label', { for: id }, label),
      h('input', { id, inputmode: 'decimal', autocomplete: 'off', value: st[key],
        onInput: (e) => { st[key] = e.target.value; saveSettings(market, st); update(); } })];
  };
  const details = h('details', { class: 'calc-details', ...(settingsOpen ? { open: true } : {}), onToggle: (e) => { settingsOpen = e.target.open; } },
    h('summary', {}, 'Einstellungen'),
    h('div', { class: 'calc-set' },
      setField('risk', 'Risiko pro Trade (USDT)'), setField('lev', 'Hebel'),
      setField('mk', 'Maker-Gebühr (%)'), setField('tk', 'Taker-Gebühr (%)'), setField('minrr', 'Mindest-RR netto')));

  const root = h('div', { class: 'calc' },
    h('h1', { class: 'calc-title' }, marketIcon(market, 24), `${market} Rechner`, h('span', { class: 'calc-symbol' }, cfg.symbol)),
    h('p', { class: 'muted calc-sub' }, market === 'GOLD'
      ? 'Preise aus dem TradingView-Tool eintragen, mit Komma (z. B. 4170,13). Alles in USDT, Gebühren sind schon drin.'
      : 'Preise aus dem TradingView-Tool eintragen. Alles in USDT, Gebühren sind schon drin.'),
    h('div', { class: 'calc-prices' },
      priceRow('sl', 'Stop', 'sl', cfg.placeholder[0]),
      priceRow('en', 'Entry', 'en', cfg.placeholder[1]),
      priceRow('tp', 'Ziel', 'tp', cfg.placeholder[2])),
    dirEl, out, details,
    h('p', { class: 'muted small calc-note' }, `Fest eingerechnet: Entry als Limit (Maker), Stop als Market (Taker, damit er sicher greift), Ziel als Limit (Maker). Betrag wird auf ${cfg.unit === 'BTC' ? '0,0001 BTC' : '0,01 XAU'} abgerundet. Bei schnellen Kerzen kann am Stop etwas Slippage dazukommen.`));
  update();
  return root;
}
