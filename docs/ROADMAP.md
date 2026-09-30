# Roadmap

Stand: Grundgerüst fertig (Split-Layout, Monats-/Jahresansicht, Tag-Editor mit PnL/Notiz/Tags/Bildern,
Notizen, Checklisten, Lokal- und Supabase-Adapter, Login).

## Nächste sinnvolle Schritte

### Kurzfristig (Alltagstauglichkeit)
- [ ] Wochenansicht als dritte Kalender-Ansicht (7 Tage nebeneinander, mehr Platz je Tag)
- [ ] Wochensummen am Zeilenende der Monatsansicht
- [ ] Markdown-Rendering für Notizen (z.B. `https://esm.sh/marked` als dynamischer Import)
- [ ] Tags: Auswertung „Ergebnis je Tag" in der Jahresansicht (Tabelle Tag → Summe / Anzahl / Trefferquote)
- [ ] Bilder auch bei Notizen (nicht nur bei Tagen) – Storage-Pfad `<user_id>/notes/<note_id>/…`
- [ ] Drag-and-Drop / Einfügen aus Zwischenablage (Cmd+V) für Screenshots im Tag-Editor
- [ ] Kalender-Zelle: Tooltip/Vorschau der Notiz bei langem Drücken

### Mittelfristig (Auswertung)
- [ ] Equity-Kurve (kumulierter PnL über Zeit) als Liniendiagramm
- [ ] Kennzahlen: Ø Gewinntag, Ø Verlusttag, Profit-Faktor, max. Drawdown, längste Gewinn-/Verlustserie
- [ ] Einzelne Trades pro Tag erfassen (Tabelle `trades`), PnL daraus berechnen
- [ ] Tages-Bewertung (1–5 Sterne / Emoji) für Disziplin, unabhängig vom Geldergebnis
- [ ] Export (CSV/JSON) und Import (für Backup und Umzug lokal → Supabase)

### Langfristig
- [ ] PWA: `manifest.json` + Service Worker (App-Icon auf dem iPad-Homescreen, Offline-Lesen)
- [ ] Offline-Schreiben mit Sync-Queue
- [ ] Erinnerungen („Tagesreview noch nicht ausgefüllt")
- [ ] Mehrere Konten/Strategien als getrennte „Journale"

## Bewusst nicht geplant
- Framework-Umstieg (React/Vue) – die App bleibt bewusst ohne Build-Schritt.
- Öffentliche Registrierung / Multi-User-UI.
