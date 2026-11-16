# R-Base

Statische SPA für **lokale Datensätze** (File System Access API) mit **WebDAV-Sync** zum Synology NAS und Excel-Metadaten-Import/-Export.

- Ein Datensatz = Ordner **`RUD-XXXX-XXXX/`** (Lox-ID mit Prefix, Standard `RUD` in Einstellungen)
- Metadaten in `meta.json`, Suchindex in IndexedDB
- Keine WebDAV-Passwörter im Repository (nur Sitzung)
- **Einstellungen → Systemkonfiguration**: Schemata (Felder, Tabellenspalten, Detail-Layout mit Drag & Drop); Speicherung in `localStorage` pro Browser

## Entwicklung

```bash
npm install
npm run dev
```

Öffnen: [http://localhost:5173](http://localhost:5173) (Chrome/Edge empfohlen). **Nicht** `file://` verwenden.

## Build / GitHub Pages

```bash
npm run build
```

Artefakte liegen in `dist/`. Für GitHub Pages (Projekt-Site):

```bash
BASE_PATH=/r-base/ npm run build
```

**Deployment:** Push auf `main` startet den Workflow [.github/workflows/pages.yml](.github/workflows/pages.yml) (GitHub Actions → Pages). Live: [https://abx-git.github.io/r-base/](https://abx-git.github.io/r-base/)

In **Settings → Pages** muss die Quelle **GitHub Actions** sein (einmalig nach dem ersten Push).

## Synology WebDAV & CORS

1. **WebDAV Server** auf der Synology aktivieren.
2. **Reverse Proxy** (Control Panel → Login Portal → Advanced → Reverse Proxy):
   - Quelle: HTTPS, Hostname z. B. `nas.example`, Pfad `/webdav/r-base`
   - Ziel: WebDAV-Dienst des NAS
3. **CORS** am Proxy oder Web Station — für GitHub Pages die Origin erlauben, z. B.  
   `https://<github-user>.github.io`

Beispiel-Header (nginx-artig, je nach Setup anpassen):

```
Access-Control-Allow-Origin: https://<github-user>.github.io
Access-Control-Allow-Methods: GET, PUT, POST, OPTIONS, PROPFIND, MKCOL, DELETE
Access-Control-Allow-Headers: Authorization, Content-Type, Depth
Access-Control-Max-Age: 86400
```

Für **OPTIONS**-Preflight auf WebDAV-Pfade antworten (204).

Die App nutzt **HTTP Basic Auth**; URL, Benutzer und Passwort nur in **Einstellungen** (Passwort im RAM).

## Ordnerstruktur (Stamm)

```
Stamm/
  K7M2-P9XV/
    meta.json
    dokument.pdf
    B/
    D/
```

## Sync (MVP)

- Upload/Download geänderter Dateien per Hash/Zeitstempel
- **Konfliktfälle** (lokal + remote geändert): Datei wird übersprungen, Status `blockiert` — ausführliche Konflikt-UI folgt in einer Erweiterung

## Lizenz

MIT