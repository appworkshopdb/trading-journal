// Animierter Hintergrund der Login-Maske: endlos scrollender Candlestick-Chart auf <canvas>.
// Keine Bibliothek. Farben kommen aus den CSS-Variablen (--win, --loss, --text-muted).
const TAGLINES = [
  'Jeder Trade erzählt eine Geschichte.',
  'Was du misst, kannst du verbessern.',
  'Regeln schlagen Bauchgefühl.',
  'Verluste sind Daten. Gewinne sind Bestätigung.',
  'Schreib es auf, bevor du es vergisst.',
];

let raf = 0, timer = 0, running = false;

export function startAuthBg(canvas) {
  if (!canvas || running) return;
  running = true;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(document.documentElement);
  const col = (n, fb) => (css.getPropertyValue(n).trim() || fb);
  const win = col('--win-rgb', '0, 230, 118'), loss = col('--loss-rgb', '255, 23, 68');
  const muted = col('--text-muted', '#a8a8a8');

  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
  canvas._onResize = resize;

  // Zufallsbewegung mit leichtem Trend-Gedächtnis -> wirkt wie ein echter Kurs
  const CW = 16;                       // Breite einer Kerze inkl. Abstand
  let price = 100, drift = 0;
  const next = () => {
    drift = drift * 0.9 + (Math.random() - 0.5) * 0.9;
    const open = price;
    const close = open + drift + (Math.random() - 0.5) * 2.2;
    const hi = Math.max(open, close) + Math.random() * 1.6;
    const lo = Math.min(open, close) - Math.random() * 1.6;
    price = close;
    return { o: open, c: close, h: hi, l: lo };
  };
  const candles = [];
  for (let i = 0; i < Math.ceil(W / CW) + 4; i++) candles.push(next());
  let off = 0, lo = 90, hi = 110, last = performance.now();

  const frame = (now) => {
    if (!running) return;
    const dt = Math.min(now - last, 60); last = now;
    if (!reduce) off += dt * 0.022;      // ~22 px pro Sekunde
    while (off >= CW) { off -= CW; candles.shift(); candles.push(next()); }
    const need = Math.ceil(W / CW) + 4;
    while (candles.length < need) candles.push(next());

    const vis = candles.slice(0, need);
    let tLo = Infinity, tHi = -Infinity;
    for (const c of vis) { tLo = Math.min(tLo, c.l); tHi = Math.max(tHi, c.h); }
    lo += (tLo - lo) * 0.03; hi += (tHi - hi) * 0.03;   // Achse gleitet weich mit
    const pad = H * 0.12, y = (v) => H - pad - ((v - lo) / Math.max(hi - lo, 1)) * (H - 2 * pad);

    ctx.clearRect(0, 0, W, H);
    // feines Raster
    ctx.strokeStyle = 'rgba(128,128,128,0.10)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 6; i++) { const gy = Math.round(H * i / 6) + 0.5; ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
    const gx0 = -(off % 96);
    for (let x = gx0; x < W; x += 96) { const gx = Math.round(x) + 0.5; ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
    ctx.stroke();

    // Kerzen
    vis.forEach((c, i) => {
      const x = i * CW - off + CW / 2;
      const up = c.c >= c.o, rgb = up ? win : loss;
      ctx.strokeStyle = `rgba(${rgb}, 0.75)`; ctx.fillStyle = `rgba(${rgb}, 0.85)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y(c.h)); ctx.lineTo(x, y(c.l)); ctx.stroke();
      const top = y(Math.max(c.o, c.c)), h = Math.max(2, Math.abs(y(c.o) - y(c.c)));
      ctx.fillRect(x - 4.5, top, 9, h);
    });

    // Kurslinie über den Kerzen + Punkt am rechten Rand
    ctx.strokeStyle = muted; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5;
    ctx.beginPath();
    vis.forEach((c, i) => { const x = i * CW - off + CW / 2; i ? ctx.lineTo(x, y(c.c)) : ctx.moveTo(x, y(c.c)); });
    ctx.stroke(); ctx.globalAlpha = 1;

    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // Spruch wechselt alle 5 s (weich ein-/ausgeblendet)
  const tag = document.getElementById('authTagline');
  if (tag && !reduce) {
    let i = 0;
    timer = setInterval(() => {
      tag.classList.add('out');
      setTimeout(() => { i = (i + 1) % TAGLINES.length; tag.textContent = TAGLINES[i]; tag.classList.remove('out'); }, 450);
    }, 5000);
  }
}

export function stopAuthBg() {
  running = false;
  cancelAnimationFrame(raf);
  clearInterval(timer);
  const c = document.getElementById('authBg');
  if (c?._onResize) window.removeEventListener('resize', c._onResize);
}
