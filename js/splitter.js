// Verschiebbare Trennlinie zwischen Kalender und Seitenleiste.
// Setzt die CSS-Variable --split (Prozent) auf .workspace; Wert wird in localStorage gemerkt.
// Doppelklick/-tipp setzt zurück (50 % bzw. 55 %).
// Nebeneinander (iPad/Laptop): senkrechte Leiste, --split = Breite des Kalenders.
// Gestapelt (Handy, Hochformat): waagerechte Leiste, --splitv = Höhe des Kalenders (Checkliste darunter).

const KEY = 'tj.splitPct';
const KEY_V = 'tj.splitPctV';
const MIN = 25, MAX = 75;        // Breite des Kalenders in %
const MIN_V = 15, MAX_V = 85;    // Höhe des Kalenders in % (gestapelt)
const DEFAULT_V = 55;
// Muss zur Media-Query in styles.css passen, die das Layout stapelt
const stackedMq = window.matchMedia('(max-width: 640px), (orientation: portrait) and (max-width: 900px)');

export function initSplitter(workspace, splitter) {
  const apply = (p) => workspace.style.setProperty('--split', p + '%');
  const applyV = (p) => workspace.style.setProperty('--splitv', p + '%');
  let pct = Number(localStorage.getItem(KEY)) || 50;
  let pctV = Number(localStorage.getItem(KEY_V)) || DEFAULT_V;
  apply(pct);
  applyV(pctV);

  let dragging = false;
  splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add('dragging');
    e.preventDefault();
  });
  splitter.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = workspace.getBoundingClientRect();
    if (stackedMq.matches) {
      pctV = Math.min(MAX_V, Math.max(MIN_V, ((e.clientY - r.top) / r.height) * 100));
      applyV(pctV);
    } else {
      pct = Math.min(MAX, Math.max(MIN, ((e.clientX - r.left) / r.width) * 100));
      apply(pct);
    }
  });
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('dragging');
    localStorage.setItem(KEY, pct.toFixed(1));
    localStorage.setItem(KEY_V, pctV.toFixed(1));
  };
  splitter.addEventListener('pointerup', stop);
  splitter.addEventListener('pointercancel', stop);
  splitter.addEventListener('dblclick', () => {
    if (stackedMq.matches) { pctV = DEFAULT_V; applyV(pctV); localStorage.setItem(KEY_V, String(DEFAULT_V)); }
    else { pct = 50; apply(pct); localStorage.setItem(KEY, '50'); }
  });
}
