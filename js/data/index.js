// Wählt den Daten-Adapter anhand von config.js.
//
// ADAPTER-VERTRAG (beide Adapter implementieren exakt diese Methoden):
//
//   mode: 'local' | 'supabase'
//   init()                       -> Promise<user|null>     Session prüfen
//   onAuthChange(cb)             -> void                   cb(user|null) bei Login/Logout
//   signIn(email, password)      -> Promise<void>          wirft Error bei Fehler
//   signUp(email, password)      -> Promise<void>          Konto selbst anlegen + anmelden (nur Supabase)
//   signOut()                    -> Promise<void>
//   getUserInfo()                -> { email, id } | null   für das Profilmenü
//   changePassword(pw)           -> Promise<void>          Passwort ändern (nur Supabase)
//   getFieldTemplate(kind)       -> Promise<{left:[{id,label}], right:[{id,label}]}>  Vorlage der Auswertungsfelder; kind 'day' (Standard) oder 'month'
//   saveFieldTemplate(tpl, kind) -> Promise<void>
//   getAvatarPath()              -> string|null            Profilbild-Pfad (Supabase: im Benutzerkonto, lokal: Data-URL)
//   setAvatar(file)              -> Promise<string>        Profilbild quadratisch zuschneiden + speichern
//   removeAvatar()               -> Promise<void>
//   getUsage()                   -> Promise<{images, bytes, limitBytes, dbBytes, dbLimitBytes}>  Speicheranzeige
//
//   getDays(fromISO, toISO, market) -> Promise<DayEntry[]>  (Tage 'YYYY-MM-DD' und Monate 'YYYY-MM')
//   saveDay(dayEntry, market)    -> Promise<DayEntry>      Upsert nach (user, market, date)
//   deleteDay(iso, market)       -> Promise<void>
//
//   listNotes()                  -> Promise<Note[]>
//   saveNote(note)               -> Promise<Note>          Upsert nach id
//   deleteNote(id)               -> Promise<void>
//
//   listChecklists()             -> Promise<Checklist[]>
//   saveChecklist(cl)            -> Promise<Checklist>     Upsert nach id
//   deleteChecklist(id)          -> Promise<void>
//
//   uploadImage(iso, file, market) -> Promise<{id, path, name}>
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
