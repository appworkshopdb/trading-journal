// Konfiguration – wird mit ins Repo committet.
// Der Supabase Anon-Key ist für den Browser gedacht; der Schutz der Daten
// erfolgt über Row Level Security (siehe supabase/schema.sql).
//
// Beide Supabase-Werte leer lassen  => App läuft im LOKALEN Modus (localStorage, nur dieses Gerät).
// Beide Werte eintragen             => App nutzt Supabase (Login, Sync über alle Geräte, Bilder im Storage).

export const CONFIG = {
  SUPABASE_URL: '',        // z.B. 'https://abcdefghijklmnop.supabase.co'
  SUPABASE_ANON_KEY: '',   // Project Settings -> API -> anon public
  STORAGE_BUCKET: 'screenshots',
  CURRENCY: 'EUR',         // ISO-Code, z.B. 'EUR' oder 'USD'
};
