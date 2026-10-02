// Bilder-Seitenleiste: ALLE hochgeladenen Bilder des aktiven Markts (Tage und Monate, alle Jahre), nach Datum absteigend –
// oben das neueste, unten das älteste. Pro Tag/Monat ein Abschnitt mit Überschrift und Trennlinie;
// die Bildbeschriftung (falls vorhanden) steht unter dem Bild.

import { h, periodTitle } from './utils.js';
import { loadedImg } from './detail.js';

/** Einträge mit Bildern, neueste zuerst */
function entriesWithImages(state) {
  return Object.entries(state.days)
    .filter(([, e]) => e.images?.length)
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
}

export function galleryPanel(state, actions) {
  const loaded = state.loadedRanges.has('all');
  if (!loaded) actions.loadAllImages(); // lädt alle Jahre nach und rendert die Seitenleiste danach neu
  const groups = entriesWithImages(state);
  const total = groups.reduce((n, [, e]) => n + e.images.length, 0);

  return h('div', { class: 'panel gallery-panel' },
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-title' }, 'Bilder'),
      h('span', { class: 'muted small' }, `${state.market} · ${total}${loaded ? '' : ' · lädt …'}`)),
    groups.length
      ? groups.map(([key, e]) => h('section', { class: 'gallery-day' },
        h('h3', { class: 'gallery-date' }, periodTitle(key, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })),
        h('div', { class: 'gallery-grid' }, e.images.map((img) => {
          const el = loadedImg(img, actions);
          return h('figure', { class: 'gallery-item' },
            h('button', { class: 'thumb-open', 'aria-label': 'Bild vergrößern', onClick: () => actions.openLightbox(el.src) }, el),
            img.caption && h('figcaption', { class: 'gallery-caption' }, img.caption));
        }))))
      : h('p', { class: 'muted' }, loaded ? 'Es gibt noch keine Bilder. Sie werden über „Öffnen" → „+ Bild hochladen" hinzugefügt.' : 'Bilder werden geladen …'),
  );
}
