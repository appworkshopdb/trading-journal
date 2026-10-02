// Detailbereich eines Tages (öffnet sich rechts über den Button "Öffnen" in der Kalenderzelle):
// oben die Screenshots (3 pro Zeile), darunter zwei feste Spalten mit Feldern. Namen + Reihenfolge der Felder sind eine
// Vorlage für ALLE Tage bzw. ALLE Monate (state.fieldTemplate / state.monthFieldTemplate, je Ansicht getrennt); die Werte gehören zum jeweiligen Tag/Monat (entry.fields = { feldId: wert }).
// Texteingaben speichern entprellt, ohne die Seitenleiste neu zu rendern (sonst verliert das Feld den Fokus).

import { h, periodTitle, monthTotal, isMonthKey, fmtMoney, signClass, uid, debounce, fieldValues } from './utils.js';
import { CONFIG } from '../config.js';

const imageUrlCache = new Map(); // path -> URL (Supabase: signierte URL, 1h gültig)

/** <img> mit URL aus dem Cache bzw. vom Adapter (signierte URL) */
export function loadedImg(img, actions) {
  const el = h('img', { alt: img.caption || img.name || 'Screenshot', loading: 'lazy' });
  const cached = imageUrlCache.get(img.path);
  if (cached) el.src = cached;
  else actions.imageUrl(img.path).then((url) => { imageUrlCache.set(img.path, url); el.src = url; }).catch(() => el.classList.add('broken'));
  return el;
}

export function detailPanel(state, actions) {
  const iso = state.detailDate;
  const entry = state.days[iso] || { date: iso, pnl: null, note: '', tags: [], images: [], fields: [] };
  // Werte dieses Eintrags; alte Einträge (Liste mit Namen) werden umgewandelt, ihre Namen werden zur Vorlage, falls noch keine existiert
  const kind = isMonthKey(iso) ? 'month' : 'day'; // Jahresansicht (Monate) und Monatsansicht (Tage) haben getrennte Vorlagen
  const tpl = kind === 'month' ? state.monthFieldTemplate : state.fieldTemplate;
  const values = { ...fieldValues(entry.fields) };
  if (Array.isArray(entry.fields) && entry.fields.length) {
    const all = [...tpl.left, ...tpl.right];
    let changed = false;
    if (!all.length) {
      // Alte Einträge: `value` war der Feldname (Kästchen links), `label` der Text -> Vorlage aus den Namen bilden
      entry.fields.forEach((f, i) => (i % 2 ? tpl.right : tpl.left).push({ id: f.id, label: f.value || '' }));
      changed = true;
    } else {
      // Reparatur einer früheren Umwandlung, bei der Name und Text vertauscht wurden
      for (const f of entry.fields) {
        const t = all.find((x) => x.id === f.id);
        if (t && f.value && t.label === (f.label || '') && t.label !== f.value) { t.label = f.value; changed = true; }
      }
    }
    if (changed) actions.saveFieldTemplate(tpl, kind);
  }
  const title = periodTitle(iso, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const pnl = isMonthKey(iso) ? monthTotal(state.days, iso) : entry.pnl; // Monat: Summe der Tage (+ eigener Anteil)

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

  // Vorlage speichern (entprellt); Änderungen an Namen/Reihenfolge gelten für alle Einträge dieser Ansicht
  const saveTpl = debounce(() => actions.saveFieldTemplate(tpl, kind), 500);
  const addField = (side) => {
    flushNow();
    const f = { id: uid(), label: '' };
    tpl[side].push(f);
    actions.saveFieldTemplate(tpl, kind);
    actions.refreshSidebar(f.id);
  };
  const removeField = (side, id) => {
    tpl[side] = tpl[side].filter((x) => x.id !== id);
    actions.saveFieldTemplate(tpl, kind);
    actions.refreshSidebar();
  };

  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden',
    onChange: async (ev) => { await actions.addImages(iso, [...ev.target.files]); ev.target.value = ''; } });

  const fieldRow = (side, f) => {
    const label = h('input', { type: 'text', class: 'field-label', placeholder: 'Bezeichnung', 'aria-label': 'Bezeichnung des Felds', value: f.label || '',
      onInput: (ev) => { f.label = ev.target.value; saveTpl(); } });
    const val = h('input', { type: 'text', class: 'field-val', 'aria-label': 'Wert', value: values[f.id] || '',
      onInput: (ev) => { values[f.id] = ev.target.value; saveDebounced({ fields: values }); } });
    if (state.focusField === f.id) setTimeout(() => label.focus(), 0);
    // Löschen in zwei Schritten ohne Browser-Dialog: erster Tipp schärft den Button ("Löschen?"), zweiter Tipp entfernt das Feld
    // (das Feld verschwindet aus der Vorlage, also bei allen Einträgen dieser Ansicht)
    let armTimer;
    const del = h('button', { class: 'field-del', title: (kind === 'month' ? 'Feld entfernen (aus der Vorlage für alle Monate)' : 'Feld entfernen (aus der Vorlage für alle Tage)'), 'aria-label': 'Feld entfernen' }, '×');
    del.onclick = () => {
      if (del.classList.contains('armed')) { clearTimeout(armTimer); removeField(side, f.id); return; }
      del.classList.add('armed'); del.textContent = 'Löschen?';
      armTimer = setTimeout(() => { del.classList.remove('armed'); del.textContent = '×'; }, 3000);
    };
    return h('div', { class: 'field-row' }, label, val, del);
  };
  const column = (side) => h('div', { class: 'field-col' },
    tpl[side].map((f) => fieldRow(side, f)),
    h('button', { class: 'dashed-btn', onClick: () => addField(side) }, '+ Feld'));

  return h('div', { class: 'panel detail-panel' },
    h('div', { class: 'detail-head' },
      h('button', { class: 'text-btn', onClick: () => { flushNow(); actions.closeDetail(); } }, '‹ Zurück'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'detail-date' }, title),
      pnl != null && h('span', { class: `detail-pnl ${signClass(pnl)}` }, fmtMoney(pnl, CONFIG.CURRENCY))),

    h('div', { class: 'field' },
      h('div', { class: 'field-head' },
        h('span', {}, `Bilder (${entry.images?.length || 0})`),
        h('button', { class: 'text-btn', onClick: () => fileInput.click() }, '+ Bild hochladen'),
        fileInput),
      imageGrid(entry, iso, actions, saveDebounced)),

    h('div', { class: 'detail-fields' },
      h('div', { class: 'field-cols' }, column('left'), column('right'))),
  );
}

function imageGrid(entry, iso, actions, saveDebounced) {
  const imgs = entry.images || [];
  if (!imgs.length) return h('p', { class: 'muted small' }, 'Noch keine Bilder.');
  return h('div', { class: 'image-grid' }, imgs.map((img) => {
    const el = loadedImg(img, actions);
    // Optionale Beschriftung: direkt am Bildobjekt eintragen, Speichern entprellt
    const caption = h('input', { type: 'text', class: 'thumb-caption', placeholder: 'Beschriftung (optional)', 'aria-label': 'Bildbeschriftung', value: img.caption || '',
      onInput: (ev) => { img.caption = ev.target.value; saveDebounced({ images: entry.images }); } });
    return h('div', { class: 'thumb-card' },
      h('figure', { class: 'thumb' },
        h('button', { class: 'thumb-open', onClick: () => actions.openLightbox(el.src) }, el),
        h('button', { class: 'thumb-del', title: 'Bild löschen', 'aria-label': 'Bild löschen', onClick: () => { if (confirm('Bild löschen?')) actions.removeImage(iso, img); } }, '×')),
      caption);
  }));
}
