// Zentraler App-Zustand + minimaler Pub/Sub.
// Regel: state nur über setState() ändern (löst Re-Render aus),
// Ausnahme: laufende Texteingaben (siehe sidebar.js) mutieren gezielt und rendern nur den Kalender neu.

import { todayISO } from './utils.js';

const now = new Date();

export const state = {
  mode: 'local',          // 'local' | 'supabase'
  user: null,             // { id, email } oder null

  view: 'month',          // 'month' | 'year'
  year: now.getFullYear(),
  month: now.getMonth(),  // 0-basiert
  selectedDate: todayISO(),

  sideTab: 'day',         // 'day' | 'notes' | 'checklists'
  activeNoteId: null,     // geöffnete Notiz im Notizen-Tab

  days: {},               // 'YYYY-MM-DD' -> Tageseintrag (Cache)
  loadedRanges: new Set(),// 'YYYY' oder 'YYYY-MM', bereits vom Adapter geladen
  notes: [],
  checklists: [],

  saveStatus: '',         // Kurztext für die Statusleiste ('Gespeichert', 'Speichern…', Fehler)
};

const listeners = new Set();

/** fn(state, parts) wird bei jedem setState aufgerufen. parts = null (alles) oder Array wie ['calendar'] */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setState(patch = {}, parts = null) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state, parts);
}
