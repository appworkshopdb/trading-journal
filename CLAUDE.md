# Trading Journal – CLAUDE.md

Private Web-App für einen Trader: Kalender mit Tagesergebnissen (Gewinn/Verlust), Notizen,
Checklisten, Screenshots und Auswertungen. Läuft als statische Seite auf **GitHub Pages**,
Daten liegen in **Supabase** (oder zum Testen lokal im Browser).

Sprache der UI, der Kommentare und dieser Doku: **Deutsch**.

---

## 1. Technische Leitplanken (nicht ändern ohne guten Grund)

| Regel | Warum |
|---|---|
| **Kein Build-Schritt, kein npm, kein Framework.** Reines HTML/CSS/JS mit ES-Modulen. | GitHub Pages liefert die Dateien 1:1 aus. Push = Deploy. Keine Toolchain, die auf iPad/Laptop gepflegt werden muss. |
| Externe Bibliotheken nur per ESM-CDN (`https://esm.sh/...`) und nur, wenn wirklich nötig. Aktuell einzige: `@supabase/supabase-js@2` (wird nur im Supabase-Modus dynamisch geladen). | Klein halten, offline-fähig im lokalen Modus. |
| Alle Daten gehen **ausschließlich** über den Daten-Adapter (`js/data/`). Kein `localStorage`/`fetch`/Supabase-Aufruf außerhalb von `js/data/` (Ausnahme: UI-Einstellungen wie Splitter-Breite). | Beide Backends müssen austauschbar bleiben. |
| Datum immer als String `'YYYY-MM-DD'` in lokaler Zeit (`toISO`/`fromISO` in `utils.js`). Nie `Date.toISOString()` für Kalendertage (UTC-Verschiebung!). | Ein Tag ist ein Tag, unabhängig von Zeitzone. |
| Monate im Code **0-basiert** (`state.month` 0–11), in Strings 1-basiert (`'2026-09'`). | JS-Konvention. |
| Rendering ist **stateless**: Renderer bauen ihren DOM aus `state` komplett neu. Kein DOM-Patching von Hand. | Einfach, nachvollziehbar. Die App ist klein genug dafür. |
| Konfiguration ausschließlich in `config.js` (wird committet; der Supabase-Anon-Key ist öffentlich, Schutz über RLS). | GitHub Pages hat keine Env-Variablen. |

---

## 2. Dateistruktur

```
trading-journal/
├── index.html              Grundgerüst: Topbar, Workspace (Kalender | Splitter | Seitenleiste), Login-Overlay, Lightbox
├── config.js               Supabase-URL/Key, Bucket, Währung  (leer = lokaler Modus)
├── css/styles.css          Komplettes Styling (dunkles Theme, CSS-Variablen, Responsiv-Regeln am Ende)
├── js/
│   ├── app.js              Einstieg: Adapter erzeugen, Daten laden, Topbar binden, `actions`, Render-Loop, Login
│   ├── state.js            Zentraler Zustand + setState()/subscribe()
│   ├── utils.js            Datum, Formatierung (fmtMoney/fmtCompact), monthGrid(), periodStats(), DOM-Builder h()
│   ├── calendar.js         Monatsansicht + Jahresansicht (inkl. Balkendiagramm als Inline-SVG)
│   ├── sidebar.js          Tabs: Tag-Editor (PnL/Notiz/Tags/Bilder), Notizen, Checklisten
│   ├── splitter.js         Verschiebbare Trennlinie (CSS-Variable --split, in localStorage gemerkt)
│   └── data/
│       ├── index.js        createAdapter(): wählt lokal oder Supabase; enthält den ADAPTER-VERTRAG
│       ├── local.js        localStorage-Adapter (nur dieses Gerät, Bilder als verkleinerte Data-URLs)
│       └── supabase.js     Supabase-Adapter (Tabellen day_entries/notes/checklists, Storage-Bucket)
├── supabase/schema.sql     Tabellen, RLS-Policies, Storage-Bucket + Policies (idempotent)
├── docs/
│   ├── ARCHITECTURE.md     Datenfluss, Render-Loop, Splitter, Responsiv-Verhalten im Detail
│   ├── DATA-MODEL.md       Alle Datentypen (JS-Objekte ↔ DB-Spalten)
│   ├── SUPABASE-SETUP.md   Schritt-für-Schritt-Einrichtung
│   └── ROADMAP.md          Geplante Features, priorisiert
├── .nojekyll               GitHub Pages: keine Jekyll-Verarbeitung
└── README.md
```

---

## 3. Wie die App funktioniert (Kurzfassung)

```
config.js ──► createAdapter() ──► db (local | supabase)
                                   │
app.js: main() ── db.init() ── loadAll() ── setState() ──► render()
                                                            ├─ renderTopbar()      (Monat/Jahr, Navigation, Status)
                                                            ├─ renderCalendar()    (js/calendar.js)
                                                            └─ renderSidebar()     (js/sidebar.js)
UI-Ereignis ──► actions.xyz() ──► state mutieren + db.save…() ──► setState(patch, parts?)
```

* **`state`** (`js/state.js`) ist die einzige Wahrheit. `state.days` ist ein Cache `'YYYY-MM-DD' → Tageseintrag`;
  geladen wird **immer ein ganzes Jahr** auf einmal (`ensureYear()` in `app.js`, gemerkt in `state.loadedRanges`).
* **`setState(patch, parts)`**: ohne `parts` wird alles neu gerendert; `['calendar']` nur der Kalender,
  `['sidebar']` nur die Seitenleiste. Wichtig bei Texteingaben: der Tag-Editor speichert entprellt (500 ms)
  und rendert nur den Kalender neu, damit das Eingabefeld den Fokus behält.
* **`actions`** (in `app.js`) ist das API der UI: Navigation (`step`, `setYear`, `openMonth`, `goToday`, …),
  Tage (`updateDay`, `clearDay`, `addImages`, `removeImage`), Notizen, Checklisten. Renderer bekommen
  `(root, state, actions)` und rufen nur `actions.*` – nie `db` direkt.
* **`persist(fn)`** kapselt jeden Schreibzugriff und zeigt „Speichern … / Gespeichert ✓ / Fehler" in der Topbar.
* **Leerer Tag** (kein PnL, keine Notiz, keine Tags, keine Bilder) wird automatisch gelöscht statt gespeichert.

---

## 4. UI-Konventionen

* **Layout:** Topbar (52 px) + Workspace als CSS-Grid `--split | 10px | 1fr`. Splitter zwischen 25 % und 75 %,
  Doppelklick = 50 %.
* **Kalender links, Seitenleiste rechts.** Seitenleiste hat drei Tabs: `Tag` (Editor des in `state.selectedDate`
  gewählten Tages), `Notizen`, `Checklisten`. Klick auf einen Kalendertag wählt ihn aus **und** springt in den Tab `Tag`.
* **Monatsansicht:** 7 Spalten (Mo–So), so viele Wochenzeilen wie der Monat braucht (4–6). Zellen füllen die
  verfügbare Höhe (`flex: 1` + `grid-template-rows: repeat(var(--rows), 1fr)`). Zelle zeigt Tagesnummer,
  PnL (grün/rot/grau) und Marker für Notiz (Punkt) / Bilder (Anzahl).
* **Jahresansicht:** Statistik-Kacheln, Balkendiagramm der 12 Monate, dann 4 × 3 Mini-Monate. Klick auf einen
  Mini-Monat öffnet die Monatsansicht.
* **Navigation:** `‹ ›` blättern Monat (Monatsansicht) bzw. Jahr (Jahresansicht). Jahr-Dropdown wirkt in beiden
  Ansichten – in der Monatsansicht bleibt der Monat gleich, nur das Jahr wechselt. Pfeiltasten ←/→ blättern ebenfalls.
* **Farben** über CSS-Variablen in `:root`: `--win` (grün), `--loss` (rot), `--flat` (grau), `--today` (orange),
  `--accent` (teal). Neue Farben dort anlegen, nicht hart im CSS.
* **Responsiv:** Zielreihenfolge iPad quer → Laptop → Handy quer. Nebeneinander ist Standard; bei Hochformat
  ≤ 900 px oder Breite ≤ 640 px wird gestapelt (Kalender oben 55 %, Seitenleiste unten 45 %) und der Splitter
  ausgeblendet. Bei Höhe ≤ 480 px (Handy quer) alles kompakter, Diagramm ausgeblendet.
* **Zahlen** über `fmtMoney()` (de-DE, Währung aus `config.js`, positive Werte mit `+`). In Kalenderzellen und
  Mini-Monaten stattdessen `fmtCompact()` (ohne Währungssymbol, `+1.251` / `-300` / `+12,3k`), der volle Betrag steht im `title`.
* **Bestätigungen** für Löschen über `confirm()` – bewusst simpel gehalten.

---

## 5. Datenmodell (Kurz – Details in docs/DATA-MODEL.md)

```js
DayEntry  { date:'YYYY-MM-DD', pnl:number|null, note:string, tags:string[], images:[{id,path,name}], updated_at }
Note      { id, title, body, pinned:boolean, created_at, updated_at }
Checklist { id, title, items:[{id,text,done:boolean}], position:number, created_at, updated_at }
```

Bilder: `path` ist im Supabase-Modus der Storage-Pfad `<user_id>/<date>/<timestamp>-<name>`,
im lokalen Modus eine Data-URL. Anzeigbare URLs immer über `db.imageUrl(path)` holen (Supabase: signierte URL, 1 h).

---

## 6. Entwickeln, Testen, Deployen

```bash
# lokal starten (ES-Module brauchen http://, nicht file://)
python3 -m http.server 8080        # dann http://localhost:8080
# oder: npx serve .
```

* Ohne Supabase-Werte in `config.js` läuft alles im lokalen Modus – ideal zum Entwickeln.
* **Deploy:** Repo auf GitHub → Settings → Pages → Source „Deploy from a branch", Branch `main`, Ordner `/ (root)`.
  Jeder Push auf `main` ist live nach ~1 Minute. Keine Actions nötig.
* Supabase-Einrichtung: `docs/SUPABASE-SETUP.md` (SQL aus `supabase/schema.sql` ausführen, Benutzer anlegen,
  Werte in `config.js` eintragen).
* Es gibt keine automatischen Tests. Vor jedem Commit manuell prüfen: Monat/Jahr wechseln, Tag anlegen,
  Bild hochladen, Notiz/Checkliste anlegen, Fenster schmal ziehen.

---

## 7. So erweiterst du die App (typische Aufgaben)

**Neues Feld am Tag (z.B. „Anzahl Trades"):**
1. `docs/DATA-MODEL.md` + `supabase/schema.sql` ergänzen (`alter table day_entries add column trades integer;`).
2. `js/data/supabase.js`: Spalte in `DAY_COLS` und in `saveDay()` aufnehmen. Lokaler Adapter braucht nichts.
3. `js/sidebar.js` → `dayPanel()`: Eingabefeld hinzufügen, speichert über `saveDebounced({ trades })`.
4. Optional in `js/calendar.js` anzeigen.

**Neue Auswertung/Diagramm:** Daten aus `state.days` filtern (`entriesOfMonth` in `calendar.js` als Vorbild),
Statistik in `utils.js` (`periodStats` erweitern), Darstellung als Inline-SVG wie `barChart()` – oder bei Bedarf
eine Chart-Bibliothek per ESM-CDN (z.B. `https://esm.sh/chart.js`), dann aber als dynamischer Import.

**Neuer Tab in der Seitenleiste:** Button in `index.html` (`#sideTabs`), Panel-Funktion in `sidebar.js`,
Eintrag in der `view`-Map in `renderSidebar()`.

**Neue Tabelle:** `schema.sql` (Tabelle + RLS-Policy nach Muster), beide Adapter (`list/save/delete`),
Vertrag in `js/data/index.js` dokumentieren, Laden in `loadAll()` ergänzen.

---

## 8. Bekannte Grenzen / Entscheidungen

* Lokaler Modus: localStorage ≈ 5 MB → nur wenige Bilder; kein Sync. Für echte Nutzung Supabase.
* Kein Offline-Cache im Supabase-Modus (kommt evtl. später als PWA mit Service Worker, siehe ROADMAP).
* Ein Benutzer. Multi-User wäre über RLS bereits abgesichert, aber die UI kennt keine Teams.
* Signierte Bild-URLs werden pro Sitzung gecacht (`imageUrlCache` in `sidebar.js`), laufen nach 1 h ab –
  nach Ablauf einfach Tab wechseln/neu laden.
