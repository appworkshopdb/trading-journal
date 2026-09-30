// Supabase-Adapter: Postgres (Tabellen day_entries, notes, checklists) + Storage-Bucket für Screenshots.
// Voraussetzung: supabase/schema.sql wurde im Projekt ausgeführt, Bucket existiert, ein Benutzer ist angelegt.
// Die Bibliothek kommt per ESM-CDN – kein Build-Schritt nötig.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { uid } from '../utils.js';

const DAY_COLS = 'date, pnl, note, note_color, tags, images, fields, updated_at';
const NOTE_COLS = 'id, title, body, pinned, created_at, updated_at';
const CHECK_COLS = 'id, title, items, position, created_at, updated_at';

function must({ data, error }) { if (error) throw error; return data; }

export function createSupabaseAdapter(cfg) {
  // Sitzung im Browser speichern und automatisch erneuern: Anmeldung nur einmal pro Gerät nötig
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const bucket = cfg.STORAGE_BUCKET || 'screenshots';
  let user = null;
  const now = () => new Date().toISOString();
  const rowToDay = (r) => ({ ...r, pnl: r.pnl == null ? null : Number(r.pnl), tags: r.tags || [], images: r.images || [], fields: r.fields || [] });

  return {
    mode: 'supabase',

    async init() {
      const { data } = await sb.auth.getSession();
      user = data.session?.user ?? null;
      return user;
    },
    onAuthChange(cb) {
      sb.auth.onAuthStateChange((_event, session) => { user = session?.user ?? null; cb(user); });
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() { await sb.auth.signOut(); },

    // ---- Tage ----
    async getDays(from, to) {
      const rows = must(await sb.from('day_entries').select(DAY_COLS).gte('date', from).lte('date', to).order('date'));
      return rows.map(rowToDay);
    },
    async saveDay(day) {
      const row = { user_id: user.id, date: day.date, pnl: day.pnl, note: day.note || '', note_color: day.note_color || null, tags: day.tags || [], images: day.images || [], fields: day.fields || [], updated_at: now() };
      const saved = must(await sb.from('day_entries').upsert(row, { onConflict: 'user_id,date' }).select(DAY_COLS).single());
      return rowToDay(saved);
    },
    async deleteDay(iso) {
      must(await sb.from('day_entries').delete().eq('user_id', user.id).eq('date', iso));
    },

    // ---- Notizen ----
    async listNotes() {
      return must(await sb.from('notes').select(NOTE_COLS).order('pinned', { ascending: false }).order('updated_at', { ascending: false }));
    },
    async saveNote(note) {
      const row = { id: note.id || uid(), user_id: user.id, title: note.title || '', body: note.body || '', pinned: !!note.pinned, updated_at: now() };
      return must(await sb.from('notes').upsert(row, { onConflict: 'id' }).select(NOTE_COLS).single());
    },
    async deleteNote(id) { must(await sb.from('notes').delete().eq('id', id)); },

    // ---- Checklisten ----
    async listChecklists() {
      return must(await sb.from('checklists').select(CHECK_COLS).order('position').order('created_at'));
    },
    async saveChecklist(cl) {
      const row = { id: cl.id || uid(), user_id: user.id, title: cl.title || '', items: cl.items || [], position: cl.position ?? 0, updated_at: now() };
      return must(await sb.from('checklists').upsert(row, { onConflict: 'id' }).select(CHECK_COLS).single());
    },
    async deleteChecklist(id) { must(await sb.from('checklists').delete().eq('id', id)); },

    // ---- Bilder (Storage) ----
    async uploadImage(iso, file) {
      const safe = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${user.id}/${iso}/${Date.now()}-${safe}`; // Ordner = user_id -> Storage-Policy greift
      must(await sb.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type }));
      return { id: uid(), path, name: file.name };
    },
    async imageUrl(path) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
    async deleteImage(path) {
      must(await sb.storage.from(bucket).remove([path]));
    },
  };
}
