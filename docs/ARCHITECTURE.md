# Architektur

## Datenfluss

```
                ┌────────────────────────────────────────────────────┐
                │ config.js  (SUPABASE_URL / SUPABASE_ANON_KEY leer?) │
                └───────────────┬──────────────────┬─────────────────┘
                                │ leer             │ gesetzt
                                ▼                  ▼
                      js/data/local.js     js/data/supabase.js  ─► Supabase Auth + Postgres + Storage
                                └────────┬─────────┘
                                         ▼  gleicher Vertrag (js/data/index.js)
                                       db.*
                                         ▲
                                         │ nur aus actions.* aufgerufen
┌──────────┐   Klick/Eingabe   ┌─────────┴─────────┐   setState(patch, parts)   ┌──────────────┐
│  DOM     │ ────────────────► │  actions (app.js) │ ─────────────────────────► │  render()    │
│          │ ◄──────────────── │                   │                            │ topbar       │
└──────────┘   neuer DOM       └───────────────────┘                            │ calendar.js  │
                                                                                │ sidebar.js   │
                                                                                └──────────────┘
```

## Render-Loop

* `subscribe(render)` in `app.js`. Jeder `setState()`-Aufruf ruft `render(state, parts)`.
* `parts === null` → alles; sonst nur die genannten Teile (`'topbar'`, `'calendar'`, `'sidebar'`).
* Renderer bauen ihren Teilbaum komplett neu (`root.replaceChildren(...)`). Kein Diffing.
* Fokus-Erhalt bei Texteingabe: Der Tag-Editor (`dayPanel`) und der Notiz-Editor speichern entprellt und
  lösen nur `setState({}, ['calendar'])` bzw. gar kein Re-Render aus. Erst ein Tab-/Tageswechsel rendert die
  Seitenleiste neu. Checklisten rendern bei jeder Änderung neu (keine laufende Texteingabe außer Titel/„Punkt
  hinzufügen"; für letzteres setzt `state.focusChecklist` den Fokus nach dem Re-Render wieder).

## Laden

* `ensureYear(y)` lädt alle Tage eines Jahres mit einer Abfrage und merkt sich das Jahr in `state.loadedRanges`.
  Dadurch ist Monatswechsel innerhalb eines Jahres sofort, und die Jahresansicht braucht keine zweite Abfrage.
* Notizen und Checklisten werden beim Start komplett geladen (`loadAll`).
* Bei Logout wird der Cache geleert, bei Login neu geladen (`onAuthChange` in `main()`).

## Speichern

* `persist(fn)` umschließt jeden Schreibzugriff: setzt Status „Speichern …", danach „Gespeichert ✓" oder Fehlertext.
* Optimistisch: `state` wird **vor** dem Netzwerkaufruf aktualisiert, der Kalender sofort neu gezeichnet.
* Tageseintrag: `updateDay(iso, patch)` merged in den Cache; ist der Eintrag danach leer → `deleteDay`.
* Bilder: `addImages` lädt erst alle Dateien hoch (`db.uploadImage`), hängt die Verweise an `images` an und
  speichert dann den Tag. `removeImage` löscht die Datei im Storage und speichert den Tag ohne den Verweis.

## Splitter

* `initSplitter(workspace, splitter)` setzt `--split` (25–75 %) per Pointer-Events (funktioniert mit Maus, Touch, Pencil).
* Wert wird in `localStorage['tj.splitPct']` gemerkt. Doppelklick → 50 %.
* CSS: `.workspace { grid-template-columns: var(--split) 10px minmax(0,1fr) }`.

## Responsiv

| Situation | Verhalten |
|---|---|
| iPad quer, Laptop, Handy quer (Breite > 640 px, Landscape) | Nebeneinander, Splitter aktiv |
| Hochformat ≤ 900 px oder Breite ≤ 640 px | Gestapelt: Kalender 55 % oben, Seitenleiste 45 % unten, Splitter aus |
| Höhe ≤ 480 px (Handy quer) | Kompakte Topbar (44 px), kleinere Zellen, Jahres-Diagramm ausgeblendet |

Die Monatszellen skalieren mit der Höhe (`minmax(56px, 1fr)`), die Jahresansicht mit `grid-template-rows: repeat(3, 1fr)`.

## Login (nur Supabase-Modus)

* `#authOverlay` wird eingeblendet, wenn `db.init()` keine Session liefert.
* E-Mail/Passwort über `db.signIn` → `onAuthStateChange` → Overlay aus, `loadAll()`.
* Registrierung ist absichtlich nicht in der UI: Benutzer werden im Supabase-Dashboard angelegt, Sign-ups
  dort deaktiviert (siehe SUPABASE-SETUP.md).
