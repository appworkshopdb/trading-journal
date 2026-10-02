// Zentraler App-Zustand + minimaler Pub/Sub.
// Regel: state nur über setState() ändern (löst Re-Render aus),
// Ausnahme: laufende Texteingaben (siehe sidebar.js) mutieren gezielt und rendern nur den Kalender neu.

import { todayISO, MARKETS } from './utils.js';

const now = new Date();
const stored = (k, ok, fallback) => { try { const v = localStorage.getItem(k); return ok.includes(v) ? v : fallback; } catch { return fallback; } };

export const state = {
  mode: 'local',          // 'local' | 'supabase'
  user: null,             // { id, email } oder null

  page: 'calendar',       // 'calendar' | 'analysis' | 'overview' (Gesamtübersicht aller Märkte)
  market: stored('tj.market', MARKETS, 'BTC'), // aktiver Markt der Kalenderansicht
  analysisScope: null,    // Auswertungen: 'BTC' | 'GOLD' | null (alle Märkte)
  overview: { status: 'idle', data: { BTC: [], GOLD: [] }, range: { mode: 'all', year: now.getFullYear(), month: now.getMonth(), from: null, to: null } }, // Gesamtübersicht: Tageseinträge aller Märkte ('idle'|'loading'|'ready'|'error') + Zeitraumfilter (mode 'month'|'year'|'all'|'custom'; month 0-basiert)
  menu: null,             // geöffnetes Kopfmenü: 'main' | 'profile' | null
  theme: stored('tj.theme', ['dark', 'light'], 'dark'),

  view: 'month',          // 'month' | 'year'
  year: now.getFullYear(),
  month: now.getMonth(),  // 0-basiert
  selectedDate: todayISO(),
  popupDate: null,        // Tag, dessen Popup (Gewinn/Verlust/Notiz/Farbe) gerade offen ist
  detailDate: null,       // Tag, dessen Detailbereich (Bilder + Felder) rechts offen ist

  sideTab: 'checklists',  // 'notes' | 'checklists' | 'images'  (Standard: Checklisten)
  activeNoteId: null,     // geöffnete Notiz im Notizen-Tab

  days: {},               // 'YYYY-MM-DD' -> Tageseintrag (Cache)
  loadedRanges: new Set(),// 'YYYY' oder 'YYYY-MM', bereits vom Adapter geladen
  notes: [],
  checklists: [],
  fieldTemplate: { left: [], right: [] },      // Vorlage der Auswertungsfelder für alle TAGE (Namen + Reihenfolge, zwei Spalten)
  monthFieldTemplate: { left: [], right: [] }, // eigene Vorlage für alle MONATE (Jahresansicht)
  threshold: 85,          // Richtwert in % für alle Checklisten (ab so vielen erledigten Punkten: erlaubt)
  openChecklist: null,    // Checkliste, die im Checklisten-Tab geöffnet ist (sonst Übersicht aller Listen)
  editingChecklist: null, // Checkliste, die gerade in der Bearbeitungsansicht ist (Stift)
  focusTitle: null,       // Checkliste, deren Titelfeld nach dem Rendern den Fokus bekommt (neue Liste)
  focusChecklist: null,   // Checkliste, deren "Punkt hinzufügen"-Feld nach dem Rendern den Fokus bekommt
  focusField: null,       // Feld-ID im Detailbereich, die nach dem Rendern den Fokus bekommt

  saveStatus: '',         // Kurztext für die Statusleiste ('Gespeichert', 'Speichern…', Fehler)
};

const listeners = new Set();

/** fn(state, parts) wird bei jedem setState aufgerufen. parts = null (alles) oder Array wie ['calendar'] */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setState(patch = {}, parts = null) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state, parts);
}
