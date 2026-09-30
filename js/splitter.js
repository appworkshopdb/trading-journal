// Verschiebbare Trennlinie zwischen Kalender und Seitenleiste.
// Setzt die CSS-Variable --split (Prozent) auf .workspace; Wert wird in localStorage gemerkt.
// Doppelklick/-tipp setzt auf 50 %. Auf schmalen Hochformat-Screens ist der Splitter per CSS ausgeblendet.

const KEY = 'tj.splitPct';
const MIN = 25, MAX = 75;

export function initSplitter(workspace, splitter) {
  const apply = (p) => workspace.style.setProperty('--split', p + '%');
  let pct = Number(localStorage.getItem(KEY)) || 50;
  apply(pct);

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
    pct = Math.min(MAX, Math.max(MIN, ((e.clientX - r.left) / r.width) * 100));
    apply(pct);
  });
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('dragging');
    localStorage.setItem(KEY, pct.toFixed(1));
  };
  splitter.addEventListener('pointerup', stop);
  splitter.addEventListener('pointercancel', stop);
  splitter.addEventListener('dblclick', () => { pct = 50; apply(pct); localStorage.setItem(KEY, '50'); });
}
