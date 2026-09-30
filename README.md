# Trading Journal

Private Web-App zum Erfassen und Auswerten von Trading-Ergebnissen: Kalender mit Tages-PnL,
Notizen, Checklisten und Screenshots. Statische Seite (GitHub Pages) + Supabase als Datenbank/Storage.

## Schnellstart

1. Repo auf GitHub anlegen, alle Dateien hochladen (Struktur beibehalten).
2. **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`** → nach ~1 Min. ist die App unter
   `https://<user>.github.io/<repo>/` erreichbar.
3. Ohne weitere Einstellung läuft die App im **lokalen Modus** (Daten nur im Browser dieses Geräts).
4. Für Sync über iPad/Laptop/Handy und Bild-Uploads: `docs/SUPABASE-SETUP.md` (10 Minuten), dann
   `config.js` ausfüllen und pushen.

## Lokal entwickeln

```bash
python3 -m http.server 8080
# http://localhost:8080
```

Kein Build, kein npm. Details zur Architektur in `CLAUDE.md` und `docs/`.
