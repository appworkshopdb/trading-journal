// Wählt den Daten-Adapter anhand von config.js.
//
// ADAPTER-VERTRAG (beide Adapter implementieren exakt diese Methoden):
//
//   mode: 'local' | 'supabase'
//   init()                       -> Promise<user|null>     Session prüfen
//   onAuthChange(cb)             -> void                   cb(user|null) bei Login/Logout
//   signIn(email, password)      -> Promise<void>          wirft Error bei Fehler
//   signOut()                    -> Promise<void>
//
//   getDays(fromISO, toISO)      -> Promise<DayEntry[]>
//   saveDay(dayEntry)            -> Promise<DayEntry>      Upsert nach (user, date)
//   deleteDay(iso)               -> Promise<void>
//
//   listNotes()                  -> Promise<Note[]>
//   saveNote(note)               -> Promise<Note>          Upsert nach id
//   deleteNote(id)               -> Promise<void>
//
//   listChecklists()             -> Promise<Checklist[]>
//   saveChecklist(cl)            -> Promise<Checklist>     Upsert nach id
//   deleteChecklist(id)          -> Promise<void>
//
//   uploadImage(iso, file)       -> Promise<{id, path, name}>
//   imageUrl(path)               -> Promise<string>        anzeigbare URL (Supabase: signierte URL)
//   deleteImage(path)            -> Promise<void>
//
// Datentypen siehe docs/DATA-MODEL.md.

import { CONFIG } from '../../config.js';
import { createLocalAdapter } from './local.js';

export async function createAdapter() {
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    // Dynamischer Import: im lokalen Modus wird die Supabase-Bibliothek gar nicht erst geladen.
    const { createSupabaseAdapter } = await import('./supabase.js');
    return createSupabaseAdapter(CONFIG);
  }
  return createLocalAdapter();
}
