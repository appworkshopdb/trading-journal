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
│   ├── sidebar.js          Tabs Checklisten (Standard) + Notizen; zeigt im Detail-Modus js/detail.js statt der Tabs
│   ├── daymodal.js         Popup am Kalendertag: Gewinn, Verlust, Notiz, Notizfarbe
│   ├── overview.js         Gesamtübersicht: alle Märkte zusammengerechnet (Kennzahlen, Verteilung, Vergleich, Diagramme, Monatstabelle)
│   ├── gallery.js          Bilder-Seitenleiste (Tab „Bilder“): alle Bilder der aktuellen Ansicht, neueste oben, je Tag ein Abschnitt
│   ├── detail.js           Detailbereich eines Tages: Screenshots (3 pro Zeile) + Auswertungs-Felder in 2 Spalten
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
  `['sidebar']` nur die Seitenleiste, `['modal']` nur das Tag-Popup. Wichtig bei Texteingaben: der Detailbereich
  speichert entprellt (500 ms) und rendert die Seitenleiste nicht neu, damit das Eingabefeld den Fokus behält.
* **`actions`** (in `app.js`) ist das API der UI: Navigation (`step`, `setYear`, `openMonth`, `goToday`, …),
  Tage (`openPopup`/`savePopup`/`closePopup`, `openDetail`/`closeDetail`, `updateDay`, `clearDay`, `addImages`, `removeImage`), Notizen, Checklisten. Renderer bekommen
  `(root, state, actions)` und rufen nur `actions.*` – nie `db` direkt.
* **`persist(fn)`** kapselt jeden Schreibzugriff und zeigt „Speichern … / Gespeichert ✓ / Fehler" in der Topbar.
* **Leerer Tag** (kein PnL, keine Notiz, keine Tags, keine Bilder, keine Felder) wird automatisch gelöscht statt gespeichert.

---

## 4. UI-Konventionen

* **Layout:** Topbar (52 px) + Workspace als CSS-Grid `--split | 10px | 1fr`. Splitter zwischen 25 % und 75 %,
  Doppelklick = 50 %.
* **Kalender links, Seitenleiste rechts.** Seitenleiste hat zwei Tabs: `Checklisten` (Standard beim Start) und `Notizen`.
  Zwei getrennte Wege zum Tag:
  1. **Kalenderzelle antippen** → Popup (`js/daymodal.js`, `state.popupDate`) mit Gewinn, Verlust, Notiz und Notizfarbe (Dropdown).
     Gewinn und Verlust ergeben zusammen `pnl` (Gewinn − Verlust). Die Notiz erscheint lesbar in der Zelle, die Farbe als Leiste links daneben.
  2. **„Öffnen" in der Zelle** → Detailbereich rechts (`js/detail.js`, `state.detailDate`), ersetzt die Tabs (Button „‹ Zurück"):
     oben Screenshots (bis 3 nebeneinander, dann neue Zeile), darunter „Auswertung des Tages" = frei anlegbare Felder
     (kurzer Wert + Bezeichnung) in 2 Spalten, Button „+ neues Feld".
* **Notizfarben** (`NOTE_COLORS` in `utils.js`, IDs werden gespeichert – nicht umbenennen): Blau, Türkis, Grün, Gelb, Orange, Rot, Pink, Lila, Weiß, Grau.
  Die Auswahl im Popup ist eine eigene Dropdown-Liste (Farbpunkt vor jedem Namen), kein `<select>`.
* **Handy** (Breite ≤ 640 px oder Höhe ≤ 480 px, rein per CSS-Media-Query): der Button „Öffnen" fehlt in den Kalenderzellen;
  stattdessen steht `.modal-open` („Öffnen · Bilder & Auswertung") im Tag-Popup. Er speichert die Eingaben und öffnet den Detailbereich
  (`actions.savePopupAndOpen`). So genügt ein Antippen des Tages.
* **Checklisten:** Normalansicht mit Haken; der Stift (✎) öffnet die Bearbeitungsansicht (`state.editingChecklist`): Titel sowie Text und
  Infotext jedes Punkts sind editierbar, „Fertig" beendet sie. Neue Listen starten direkt in der Bearbeitungsansicht.
* **Monatsansicht:** 7 Spalten (Mo–So), so viele Wochenzeilen wie der Monat braucht (4–6). Zellen füllen die
  verfügbare Höhe (`flex: 1` + `grid-template-rows: repeat(var(--rows), 1fr)`). Zelle zeigt Tagesnummer,
  Notiztext mit Farbleiste, PnL (grün/rot/grau), Bilder-Anzahl und den Button „Öffnen". Die Zelle ist ein `<div>`
  mit transparentem Button darüber (`.day-hit`), weil „Öffnen" ein eigener Button ist (keine verschachtelten Buttons).
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
DayEntry  { date:'YYYY-MM-DD', pnl:number|null, note:string, note_color:string|null, tags:string[] (ohne UI),
            images:[{id,path,name}], fields:[{id,value,label}], updated_at }
Note      { id, title, body, pinned:boolean, created_at, updated_at }
Checklist { id, title, items:[{id,text,info,done:boolean}], position:number, created_at, updated_at }
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
3. `js/detail.js` → `detailPanel()` (oder `js/daymodal.js` für das Popup): Eingabefeld hinzufügen, speichert über `saveDebounced({ trades })` bzw. `actions.savePopup`.
4. Optional in `js/calendar.js` anzeigen.

**Neue Auswertung/Diagramm:** Daten aus `state.days` filtern (`entriesOfMonth` in `calendar.js` als Vorbild),
Statistik in `utils.js` (`periodStats` erweitern), Darstellung als Inline-SVG wie `barChart()` – oder bei Bedarf
eine Chart-Bibliothek per ESM-CDN (z.B. `https://esm.sh/chart.js`), dann aber als dynamischer Import.

**Neuer Tab in der Seitenleiste:** Button in `index.html` (`#sideTabs`), Panel-Funktion in `sidebar.js`,
Eintrag in der Map in `renderSidebar()`.

**Neue Tabelle:** `schema.sql` (Tabelle + RLS-Policy nach Muster), beide Adapter (`list/save/delete`),
Vertrag in `js/data/index.js` dokumentieren, Laden in `loadAll()` ergänzen.

---

## 8. Bekannte Grenzen / Entscheidungen

* Lokaler Modus: localStorage ≈ 5 MB → nur wenige Bilder; kein Sync. Für echte Nutzung Supabase.
* Kein Offline-Cache im Supabase-Modus (kommt evtl. später als PWA mit Service Worker, siehe ROADMAP).
* Ein Benutzer. Multi-User wäre über RLS bereits abgesichert, aber die UI kennt keine Teams.
* Signierte Bild-URLs werden pro Sitzung gecacht (`imageUrlCache` in `detail.js`), laufen nach 1 h ab –
  nach Ablauf einfach Tab wechseln/neu laden.

## Nachtrag UI
- Bilder im Detailbereich: Flex-Raster, zentriert, 3 pro Zeile; unvollständige letzte Zeile ebenfalls zentriert.
- Checklisten-Tab: Übersicht aller Listen (`state.openChecklist === null`); Tippen öffnet eine Liste (abhaken, Stift = Bearbeiten, „‹ Alle Listen" zurück).
- Tag-Popup hat keinen Auto-Fokus (Tastatur erscheint erst beim Antippen eines Feldes).
- Checklisten-Richtwert: `state.threshold` (%, Standard 85) wird als Spalte `threshold` an allen Listen gespeichert (`actions.setThreshold`). Anteil = erledigt/gesamt; Erlaubt ab Anteil >= Richtwert (leere Liste nie). Anzeige: Übersicht (Badge) + Liste (Balken mit Marke).
- Bilder (`images[]` im Tageseintrag) haben optional `caption` (Beschriftung).
- Jahresansicht = gleiche Bedienung wie Monatsansicht: Monat antippen -> Popup, "Öffnen" -> Detailbereich. Monatseinträge liegen in `state.days` unter dem Schlüssel `'YYYY-MM'` (Tage: `'YYYY-MM-DD'`, `isMonthKey()`), in Supabase in Tabelle `month_entries`. Monatsergebnis = Gewinne − Verluste der Tage (`monthBreakdown()`/`monthTotal()`), im Monats-Popup als Formel angezeigt, ohne Eingabefelder; Notiz, Farbe, Bilder, Auswertung sind unabhängig von den Tagen. Wechsel Monat/Jahr schließt Popup und Detail.
- Kopfmenü: Hamburger links (BTC, GOLD je mit Unterpunkt „Auswertungen", Hell/Dunkel-Umschalter ohne Beschriftung), Profil-Icon rechts (E-Mail, Abmelden). State: `page` ('calendar'|'analysis'), `market` ('BTC'|'GOLD'), `analysisScope`, `menu`, `theme` (Theme + Markt in localStorage `tj.theme`/`tj.market`). `actions.navigate()` wechselt Seite/Markt und lädt den Cache des Markts neu.
- Märkte: Tages- und Monatseinträge sind pro Markt getrennt (Spalte `market` in `day_entries`/`month_entries`, unique (user_id, market, date|month); lokal BTC = `tj.days`, sonst `tj.days.<MARKT>`). Notizen und Checklisten sind marktübergreifend. Adapter-Methoden getDays/saveDay/deleteDay/uploadImage nehmen `market`.
- Heller Modus: `:root[data-theme="light"]` überschreibt die Farbvariablen in styles.css.
- Monats-/Jahresnavigation und Monat/Jahr-Umschalter (`.calbar`) stehen im Kalenderbereich über dem Kalender (Desktop links, Handy mittig), nicht in der Kopfleiste. Kalender wird in `#calendarPane` (`.calendar-body`) gerendert.
- Profilmenü (Avatar oben rechts): Profilbild (Supabase: Datei `<user_id>/profile/avatar-….jpg` im Bucket, Pfad in `user_metadata.avatar_path`; lokal: Data-URL `tj.avatar`), Speicheranzeige (Supabase: SQL-Funktion `usage_stats()` → Bilder, belegter Speicher, DB-Größe; Limits über `STORAGE_LIMIT_MB` (1024) / `DB_LIMIT_MB` (500) in config.js optional überschreibbar), Passwort ändern (Anzeigen/Verbergen-Schalter). Das aktuelle Passwort wird bewusst NICHT gespeichert oder angezeigt.
- Detailbereich: Felder in zwei festen Spalten (links/rechts), je Spalte „+ Feld". Namen + Reihenfolge = Vorlage für ALLE Tage/Monate (`state.fieldTemplate = {left:[{id,label}], right:[...]}`, Supabase: `user_metadata.field_template`, lokal `tj.fieldTemplate`); Werte je Eintrag in `fields = { feldId: wert }` (alte Listenform wird beim Öffnen umgewandelt und liefert die erste Vorlage). Feld entfernen = aus der Vorlage für alle. Kein Bildzähler mehr in Tages-/Monatszellen.
- Registrierung: Login-Karte kann zwischen „Anmelden" und „Konto erstellen" wechseln (`db.signUp`, Passwort + Wiederholung); ohne E-Mail-Bestätigung (Supabase: „Confirm email" aus). Jeder Benutzer hat eigene Daten (RLS); Checklisten, Notizen, Feldvorlage, Profilbild sind pro Benutzer.
- Trades pro Tag (optional): Das Tag-Popup hat pro Zeile Gewinn, Verlust und RR; „+ weiterer Trade" fügt Zeilen hinzu (× entfernt). `pnl` = Summe(Gewinn − Verlust) aller Zeilen. `trades:[{gain,loss,rr}]` wird nur gespeichert, wenn es mehrere Zeilen gibt oder ein RR eingetragen ist (Supabase: Spalte `trades` jsonb – Migration in schema.sql ausführen). Statistik (`periodStats()` in `utils.js`, Kacheln in `statsBar()`): Trefferquote = Gewinn-Trades / alle Trades (Tage ohne `trades` zählen als ein Trade nach Vorzeichen von `pnl`; ein Trade gewinnt nach Gewinn − Verlust, ohne Beträge nach Vorzeichen des RR), R-Summe = Summe aller RR, Ø RR Gewinner, Breakeven-Quote = 1 / (1 + Payoff), Payoff = Ø RR Gewinner / |Ø RR Verlierer| (ohne RR bei Verlierern: −1 R angenommen). Profitfaktor = Summe der Trade-Gewinne / Summe der Trade-Verluste (Trade-Ebene, nicht Tages-Netto). Ø R je Trade (Erwartungswert) = R-Summe / Anzahl Trades mit RR.
- Checklisten-Gewichtung: Jeder Punkt hat optional `weight` (Prozentpunkte). Sobald mindestens ein Punkt ein Gewicht hat, ist der Erfüllungsgrad die Summe der Gewichte der abgehakten Punkte (max. 100 %, Punkte ohne Gewicht = 0); sonst zählen alle Punkte gleich (erledigt/gesamt). Erlaubt ab Erfüllungsgrad >= Richtwert (`checkStatus()` in `sidebar.js`). Neue Punkte werden über das Feld „%“ und den Button „Speichern“ rechts neben dem Text angelegt (Enter geht weiter); in der Bearbeitungsansicht ist das Gewicht je Punkt änderbar, darunter steht die Summe der Gewichte.
- Jahresansicht → Monatsansicht: Jeder Mini-Monat hat links neben „Öffnen“ den Pfeil-Button „←“ (`.day-back`, `actions.openMonth`). Auf dem Handy bleibt er sichtbar, „Öffnen“ nicht.
- Feldvorlagen sind je Ansicht getrennt: Tage (Monatsansicht) `state.fieldTemplate` (Supabase `user_metadata.field_template`, lokal `tj.fieldTemplate`), Monate (Jahresansicht) `state.monthFieldTemplate` (`field_template_month` bzw. `tj.fieldTemplate.month`). `db.getFieldTemplate(kind)`/`saveFieldTemplate(tpl, kind)` mit kind `'day'|'month'`. Innerhalb der Ansicht gilt die Vorlage für alle Tage bzw. alle Monate. Bereits vorhandene Monats-Werte der früheren gemeinsamen Vorlage erscheinen nicht mehr (Feld-IDs der neuen Monatsvorlage sind andere).
- Trades: Jeder Trade im Tag-Popup hat die Schalter „Verpasst“ und „Ausgesetzt“ (`trade.status = 'missed'|'skipped'`, sonst fehlt das Feld). Solche Trades zählen NICHT in Tagesergebnis (`pnl`), Trefferquote und R; `periodStats()` zählt sie getrennt (`tradeMissed`, `tradeSkipped`), die Trades-Kachel zeigt sie als Zusatzzeile. Dient später den Auswertungen (gewonnen/verloren/ausgesetzt/verpasst).
- Profilbild: Im Profilmenü ist das große Avatar-Bild ein Button mit Stift-Symbol am Rand (`.avatar-edit`); Antippen zeigt „Bild hinzufügen/tauschen“ und „Bild löschen“.
- Bilder-Tab: Button „Bilder“ ganz rechts in den Seitenleisten-Tabs (`state.sideTab = 'images'`, `js/gallery.js`). Zeigt ALLE Bilder des aktiven Markts (Tage und Monate, alle Jahre; fehlende Jahre lädt `actions.loadAllImages()` einmalig nach, `loadedRanges` enthält dann `'all'`). Sortiert nach Datum absteigend (neueste oben), je Tag/Monat ein Abschnitt mit Datum als Überschrift und Trennlinie, Bildbeschriftung unter dem Bild; Tippen vergrößert (Lightbox).
- Tag-Popup, Farbautomatik: Die Notizfarbe wird passend zu den Trades vorgewählt (Netto-Gewinn grün, Netto-Verlust rot, verpasst gelb, ausgesetzt grau), solange sie nicht selbst im Dropdown gewählt wurde. Kalenderzellen zeigen bei Trades mit Status die Marken „Verpasst“ (`--missed`, gelb) und „Ausgesetzt“ (grau) neben dem Betrag (`flagChips()` in `calendar.js`).
- Gesamtübersicht: Menüpunkt „Gesamtübersicht“ unter BTC/GOLD im Hamburger-Menü (`state.page = 'overview'`, `js/overview.js`, Container `#overviewPage`). Lädt per `actions.loadOverview()` die Tageseinträge ALLER Märkte (unabhängig vom Kalender-Cache, `state.overview = {status, data:{BTC,GOLD}, year}`), Zeitraumfilter oben auf der Seite (`state.overview.range = {mode, year, month, from, to}`, `actions.setOverviewRange`/`stepOverview`): Monat | Jahr (jeweils mit ‹ › zum Blättern und „Dieser Monat/Dieses Jahr“), „Alles“ (alle Daten) und „Zeitraum“ (benutzerdefiniert Von/Bis). Alle Abschnitte folgen dem Zeitraum; Diagramme und Tabelle zeigen Tage (Monat, benutzerdefiniert ≤ 62 Tage) oder Monate (Jahr, Alles, längere Zeiträume). Aufbau: 1. Kennzahlen (Ergebnis gesamt mit Split je Markt, Trefferquote, R-Summe, Profitfaktor, Trades, Handelstage), 2. Trade-Verteilung (gewonnen/verloren/verpasst/ausgesetzt als Balken, Gesamt + je Markt), 3. Vergleichstabelle BTC | GOLD | Gesamt (`summarize()` = `periodStats()` + Profitfaktor, Ø Gewinn/Verlust je Tag, bester/schlechtester Tag, Ø RR Verlierer, Ø R je Trade), 4. Diagramme als Inline-SVG (Ergebnis pro Monat je Markt, kumulierter Verlauf), 5. Monatstabelle. Serienfarben `--c-btc` / `--c-gold`. Alle Märkte werden mit derselben Währung (config.js) summiert. Verpasste/ausgesetzte Trades zählen nicht in Trefferquote/R/Ergebnis.
- Kopfzeile: Ab 821 px Breite (Tablet quer, Laptop, PC) steht die Navigation direkt in der Kopfzeile (`#topNav`, `.nav-group`): „Trading Journal“, Gruppe „BTC | Auswertungen“, Gruppe „GOLD | Auswertungen“, „Gesamtübersicht“; die aktive Seite ist hervorgehoben (`.nav-btn.active`), Hamburger und Markt-Pille sind dort ausgeblendet. Schmaler (Handy, Tablet hoch) bleibt der Hamburger mit Dropdown (`#mainMenu`) samt Markt-Pille. Beide werden in `renderMenus()` aus denselben Aktionen gebaut. Der Hell/Dunkel-Umschalter steht nur noch im Profilmenü (`themeBlock()`).
