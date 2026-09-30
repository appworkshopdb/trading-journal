// Detailbereich eines Tages (öffnet sich rechts über den Button "Öffnen" in der Kalenderzelle):
// oben die Screenshots (3 pro Zeile), darunter die "Auswertung des Tages" als frei anlegbare Felder in 2 Spalten.
// Texteingaben speichern entprellt, ohne die Seitenleiste neu zu rendern (sonst verliert das Feld den Fokus).

import { h, fromISO, fmtMoney, signClass, uid } from './utils.js';
import { CONFIG } from '../config.js';

const imageUrlCache = new Map(); // path -> URL (Supabase: signierte URL, 1h gültig)

export function detailPanel(state, actions) {
  const iso = state.detailDate;
  const entry = state.days[iso] || { date: iso, pnl: null, note: '', tags: [], images: [], fields: [] };
  const fields = entry.fields || [];
  const title = fromISO(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

  // Änderungen sammeln und gebündelt entprellt speichern
  let pending = {};
  let timer;
  const flushNow = () => {
    clearTimeout(timer);
    if (!Object.keys(pending).length) return;
    const p = pending; pending = {};
    actions.updateDay(iso, p);
  };
  const saveDebounced = (patch) => { Object.assign(pending, patch); clearTimeout(timer); timer = setTimeout(flushNow, 500); };

  const addField = () => {
    flushNow();
    const f = { id: uid(), value: '', label: '' };
    actions.updateDay(iso, { fields: [...(state.days[iso]?.fields || []), f] });
    actions.refreshSidebar(f.id);
  };
  const removeField = (id) => {
    flushNow();
    actions.updateDay(iso, { fields: (state.days[iso]?.fields || []).filter((x) => x.id !== id) });
    actions.refreshSidebar();
  };

  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden',
    onChange: async (ev) => { await actions.addImages(iso, [...ev.target.files]); ev.target.value = ''; } });

  const fieldRow = (f) => {
    const val = h('input', { type: 'text', class: 'field-val', 'aria-label': 'Wert', value: f.value || '',
      onInput: (ev) => { f.value = ev.target.value; saveDebounced({ fields }); } });
    if (state.focusField === f.id) setTimeout(() => val.focus(), 0);
    return h('div', { class: 'field-row' },
      val,
      h('input', { type: 'text', class: 'field-label', placeholder: 'Bezeichnung', 'aria-label': 'Bezeichnung', value: f.label || '',
        onInput: (ev) => { f.label = ev.target.value; saveDebounced({ fields }); } }),
      h('button', { class: 'item-del', title: 'Feld entfernen', 'aria-label': 'Feld entfernen', onClick: () => removeField(f.id) }, '×'));
  };

  return h('div', { class: 'panel detail-panel' },
    h('div', { class: 'detail-head' },
      h('button', { class: 'text-btn', onClick: () => { flushNow(); actions.closeDetail(); } }, '‹ Zurück'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'detail-date' }, title),
      entry.pnl != null && h('span', { class: `detail-pnl ${signClass(entry.pnl)}` }, fmtMoney(entry.pnl, CONFIG.CURRENCY))),

    h('div', { class: 'field' },
      h('div', { class: 'field-head' },
        h('span', {}, `Screenshots (${entry.images?.length || 0})`),
        h('button', { class: 'text-btn', onClick: () => fileInput.click() }, '+ Bild hochladen'),
        fileInput),
      imageGrid(entry, iso, actions)),

    h('div', { class: 'detail-fields' },
      h('div', { class: 'field-head' }, h('span', {}, 'Auswertung des Tages')),
      fields.length
        ? h('div', { class: 'field-grid' }, fields.map(fieldRow))
        : h('p', { class: 'muted small' }, 'Noch keine Felder – z. B. „Setup nach Plan“ oder „Anzahl Trades“.'),
      h('button', { class: 'dashed-btn', onClick: addField }, '+ neues Feld')),
  );
}

function imageGrid(entry, iso, actions) {
  const imgs = entry.images || [];
  if (!imgs.length) return h('p', { class: 'muted small' }, 'Noch keine Bilder.');
  return h('div', { class: 'image-grid' }, imgs.map((img) => {
    const el = h('img', { alt: img.name || 'Screenshot', loading: 'lazy' });
    const cached = imageUrlCache.get(img.path);
    if (cached) el.src = cached;
    else actions.imageUrl(img.path).then((url) => { imageUrlCache.set(img.path, url); el.src = url; }).catch(() => el.classList.add('broken'));
    return h('figure', { class: 'thumb' },
      h('button', { class: 'thumb-open', onClick: () => actions.openLightbox(el.src) }, el),
      h('button', { class: 'thumb-del', title: 'Bild löschen', 'aria-label': 'Bild löschen', onClick: () => { if (confirm('Bild löschen?')) actions.removeImage(iso, img); } }, '×'),
    );
  }));
}
