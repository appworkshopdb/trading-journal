// Bilder-Seitenleiste: alle hochgeladenen Bilder der aktuellen Ansicht (Monatsansicht: Tage des angezeigten Monats,
// Jahresansicht: Monatseinträge des Jahres), nach Datum absteigend – oben das neueste, unten das älteste.
// Pro Tag/Monat ein Abschnitt mit Überschrift und Trennlinie; die Bildbeschriftung (falls vorhanden) steht unter dem Bild.

import { h, periodTitle, monthPrefix } from './utils.js';
import { loadedImg } from './detail.js';

/** Einträge mit Bildern der aktuellen Ansicht, neueste zuerst */
function entriesWithImages(state) {
  const inView = state.view === 'year'
    ? (key) => key.length === 7 && key.startsWith(`${state.year}-`)
    : (key) => key.length === 10 && key.startsWith(monthPrefix(state.year, state.month));
  return Object.entries(state.days)
    .filter(([key, e]) => inView(key) && e.images?.length)
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
}

export function galleryPanel(state, actions) {
  const groups = entriesWithImages(state);
  const total = groups.reduce((n, [, e]) => n + e.images.length, 0);
  const scope = state.view === 'year' ? `Jahr ${state.year}` : periodTitle(monthPrefix(state.year, state.month));

  return h('div', { class: 'panel gallery-panel' },
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-title' }, 'Bilder'),
      h('span', { class: 'muted small' }, `${scope} · ${total}`)),
    groups.length
      ? groups.map(([key, e]) => h('section', { class: 'gallery-day' },
        h('h3', { class: 'gallery-date' }, periodTitle(key, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })),
        h('div', { class: 'gallery-grid' }, e.images.map((img) => {
          const el = loadedImg(img, actions);
          return h('figure', { class: 'gallery-item' },
            h('button', { class: 'thumb-open', 'aria-label': 'Bild vergrößern', onClick: () => actions.openLightbox(el.src) }, el),
            img.caption && h('figcaption', { class: 'gallery-caption' }, img.caption));
        }))))
      : h('p', { class: 'muted' }, 'In dieser Ansicht gibt es noch keine Bilder. Sie werden über „Öffnen" → „+ Bild hochladen" hinzugefügt.'),
  );
}
