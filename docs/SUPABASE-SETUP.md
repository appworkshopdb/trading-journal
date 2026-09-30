# Supabase einrichten (ca. 10 Minuten)

## 1. Projekt anlegen
1. https://supabase.com → New project. Region z.B. **Frankfurt (eu-central-1)**. Datenbank-Passwort sicher ablegen
   (wird von der App nicht gebraucht, nur für direkten DB-Zugriff).
2. Warten, bis das Projekt bereit ist.

## 2. Schema einspielen
1. Dashboard → **SQL Editor** → **New query**.
2. Kompletten Inhalt von `supabase/schema.sql` einfügen → **Run**.
   Legt an: Tabellen `day_entries`, `notes`, `checklists` mit RLS, Bucket `screenshots` (privat, 10 MB/Datei,
   nur Bildtypen) mit Policies. Das Skript ist idempotent – bei Änderungen einfach erneut ausführen.
3. Prüfen: **Table Editor** zeigt die drei Tabellen, **Storage** den Bucket `screenshots`.

## 3. Benutzer anlegen, Registrierung sperren
1. **Authentication → Users → Add user → Create new user**: E-Mail + Passwort, **Auto Confirm User** anhaken.
2. **Authentication → Providers → Email**: **Allow new users to sign up** ausschalten (sonst könnte jeder mit dem
   öffentlichen Anon-Key ein Konto anlegen – sehen würde er dank RLS trotzdem nur eigene Daten, aber sauberer ist es so).
3. Optional: **Authentication → URL Configuration → Site URL** auf die GitHub-Pages-URL setzen.

## 4. App verbinden
1. **Project Settings → API**: `Project URL` und `anon public` Key kopieren.
2. In `config.js` eintragen:
   ```js
   SUPABASE_URL: 'https://xxxxxxxxxxxxxxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi...',
   ```
3. Committen und pushen. Der Anon-Key darf öffentlich sein – er erlaubt nur, was die RLS-Policies zulassen
   (= eigene Zeilen nach Login).
4. App öffnen → Login-Maske → mit dem angelegten Benutzer anmelden.

## 5. Daten aus dem lokalen Modus übernehmen (falls vorher lokal getestet)
Es gibt aktuell keinen Import-Button. Wenn nötig, in der Browser-Konsole der lokalen Version
`localStorage.getItem('tj.days')` kopieren und die Tage manuell (oder per kleinem Skript im SQL Editor) einfügen.
Für den Alltag: lieber gleich mit Supabase starten.

## Kosten / Limits (Free-Tier, Stand 2026 – bei Bedarf auf supabase.com/pricing prüfen)
* 500 MB Datenbank, 1 GB Storage, 5 GB Egress/Monat, 50.000 monatlich aktive Nutzer.
* Bei ~5 Screenshots/Monat à 0,5–1 MB reicht der Storage für viele Jahre.
* **Achtung:** Free-Projekte werden nach 7 Tagen ohne Aktivität pausiert und müssen im Dashboard wieder
  aktiviert werden. Bei regelmäßiger Nutzung passiert das nicht; bei längerer Pause einfach einmal im
  Dashboard „Restore" klicken.

## Backup
Dashboard → **Database → Backups** (täglich im Pro-Plan; im Free-Plan gelegentlich manuell exportieren:
SQL Editor → `select * from day_entries` → Download CSV, oder `pg_dump` über die Connection-String).
