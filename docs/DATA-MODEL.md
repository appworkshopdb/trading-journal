# Datenmodell

Alle Zeitstempel ISO-8601 (`updated_at`, `created_at`). Kalendertage als `'YYYY-MM-DD'` (lokale Zeit).
IDs sind UUIDs (`crypto.randomUUID()` im Client, `gen_random_uuid()` als DB-Default).

## DayEntry – Tabelle `day_entries`

| JS-Feld | DB-Spalte | Typ | Bedeutung |
|---|---|---|---|
| `date` | `date` | date | Kalendertag, zusammen mit `user_id` eindeutig |
| `pnl` | `pnl` | numeric(14,2) / null | Tagesergebnis in `CONFIG.CURRENCY`. `null` = nichts eingetragen. `0` = Break-even (zählt als gehandelter Tag) |
| `note` | `note` | text | Kurze Notiz des Tages (erscheint im Kalender) |
| `note_color` | `note_color` | text / null | Farb-ID der Notiz: `blau`, `orange`, `lila`, `gelb`, `pink`, `grau` (siehe `NOTE_COLORS` in `utils.js`) |
| `tags` | `tags` | text[] | Schlagworte – aktuell ohne Oberfläche, Daten bleiben erhalten |
| `images` | `images` | jsonb | Array von `{ id, path, name }` – siehe unten |
| `trades` | `trades` | jsonb | Optional: Array von `{ gain, loss, rr }` (Beträge ≥ 0, RR beliebig). Gesetzt, wenn ein Tag mehrere Trades oder einen RR-Wert hat; `pnl` = Summe(gain − loss) |
| `fields` | `fields` | jsonb | „Auswertung des Tages": Array von `{ id, value, label }` (kurzer Wert + Bezeichnung, frei anlegbar) |
| – | `user_id` | uuid | Besitzer (Default `auth.uid()`), nur im Supabase-Modus |
| `updated_at` | `updated_at` | timestamptz | wird vom Client gesetzt |

**Leerer Tag** = `pnl == null && note.trim() === '' && tags.length === 0 && images.length === 0 && fields.length === 0 && trades.length === 0` → wird gelöscht, nicht gespeichert.

### Bildverweis `{ id, path, name }`

* `id` – UUID, nur für UI-Zwecke (Löschen einzelner Bilder).
* `path` – **Supabase:** Storage-Pfad im Bucket `screenshots`: `<user_id>/<YYYY-MM-DD>/<timestamp>-<dateiname>`.
  Der erste Ordner ist die `user_id` – darauf prüfen die Storage-Policies. **Lokal:** JPEG-Data-URL (max. 1400 px).
* `name` – ursprünglicher Dateiname (Anzeige/`alt`).

Anzeigbare URL nur über `db.imageUrl(path)`; im Supabase-Modus eine signierte URL (Bucket ist privat).

## Note – Tabelle `notes`

| JS-Feld | DB-Spalte | Typ |
|---|---|---|
| `id` | `id` | uuid |
| `title` | `title` | text |
| `body` | `body` | text (Klartext, kein Markdown-Rendering bisher) |
| `pinned` | `pinned` | boolean – angepinnte Notizen zuerst |
| `created_at`, `updated_at` | ebenso | timestamptz |

Sortierung: `pinned desc, updated_at desc`.

## Checklist – Tabelle `checklists`

| JS-Feld | DB-Spalte | Typ |
|---|---|---|
| `id` | `id` | uuid |
| `title` | `title` | text |
| `items` | `items` | jsonb: `[{ id, text, info, done }]` – `info` = optionaler Infotext unter dem Punkt |
| `position` | `position` | integer – Reihenfolge der Listen |
| `created_at`, `updated_at` | ebenso | timestamptz |

Items werden als ganzes JSON gespeichert (keine eigene Tabelle) – bei den erwarteten Mengen (wenige Listen
mit je < 30 Punkten) völlig ausreichend und spart Roundtrips.

## Lokaler Modus – localStorage-Schlüssel

| Schlüssel | Inhalt |
|---|---|
| `tj.days` | Objekt `{ 'YYYY-MM-DD': DayEntry }` |
| `tj.notes` | Array `Note[]` |
| `tj.checklists` | Array `Checklist[]` |
| `tj.splitPct` | Splitter-Position in % (wird in **beiden** Modi genutzt – reine UI-Einstellung) |

## Ideen für spätere Erweiterungen (noch nicht umgesetzt)

* `trades` (Tabelle) – einzelne Trades pro Tag mit Instrument, Richtung, Einstieg/Ausstieg, R-Multiple → `pnl`
  könnte dann berechnet statt eingegeben werden.
* `day_entries.mood` / `day_entries.rating` (1–5) für qualitative Auswertung.
* `day_entries.strategy_id` → Verknüpfung zu einer Notiz/Strategie, um Ergebnisse pro Strategie auszuwerten.

## Ergänzungen
- `checklists.threshold` (integer, Standard 85): Richtwert in %. Global gedacht, wird an allen Listen gleich gesetzt.
- `day_entries.images[]`: Objekte `{ id, path, name, caption? }` – `caption` ist die optionale Bildbeschriftung.
- `month_entries` (neu): `month` ('YYYY-MM'), `pnl` (ungenutzt/null – das Monatsergebnis wird aus den Tagen berechnet), `note`, `note_color`, `images`, `fields`; unique (user_id, month). Im Client als Eintrag mit `date = 'YYYY-MM'`.
- `day_entries.market` / `month_entries.market` (text, Standard 'BTC'): Markt des Eintrags. Eindeutig je (user_id, market, date) bzw. (user_id, market, month). Bestehende Einträge gehören zu BTC. Bild-Pfade: `<user_id>/<market>/<date|month>/<datei>`.
- `fields` (Tag/Monat) ist jetzt ein Objekt `{ "<feldId>": "<wert>" }`; Feldnamen/Reihenfolge stehen in der Vorlage `field_template` (`{left:[{id,label}], right:[{id,label}]}`) am Benutzerkonto (Supabase `user_metadata`) bzw. lokal unter `tj.fieldTemplate`. Altes Format (Liste `[{id,value,label}]`) wird beim Öffnen migriert.
