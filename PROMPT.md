Erstelle eine vollständige, statische Single-Page-Application (SPA) für GitHub Pages (HTML, CSS, modernes Vanilla JavaScript/ES-Module oder TypeScript ohne komplexe Server-Abhängigkeiten), die als lokale Datei- und Datensatzverwaltung mit direkter WebDAV-Synchronisation zu einem Synology NAS fungiert.

Orientiere dich in Architektur, Code-Stil, Struktur und UI-Mustern eng an den bestehenden Projekten @E2 und @C2, um ein konsistentes Konzept und einheitliche Patterns beizubehalten. Analysiere zuerst kurz deren Aufbau (Verzeichnisstruktur, State-Management, Styling, Hilfsfunktionen) und übernimm bewährte Konzepte für dieses neue Projekt.

### 1. Architektur & Hosting-Vorgaben
- Reine Client-Side-Anwendung ohne eigenes Backend, optimiert für das statische Hosting auf GitHub Pages (relative Pfade, keine Server-Side-Routes).
- Sicherheit: Zugangsdaten für WebDAV (URL, Benutzername, Passwort) dürfen niemals hartcodiert oder im Repository gespeichert werden. Sie werden zur Laufzeit über eine Einstellungs-Maske eingegeben und ausschließlich im Arbeitsspeicher (oder optional verschlüsselt in `sessionStorage`) gehalten.

### 2. Lokale Dateiverwaltung (File System Access API & IndexedDB)
- Implementiere den Zugriff auf ein lokales Stammverzeichnis über `window.showDirectoryPicker()`.
- Bilde folgende hierarchische Verzeichnis- und Datenstruktur ab:
  - Unterhalb des Stammverzeichnisses existiert pro Datensatz ein eigener Unterordner (benannt nach der fortlaufenden Nummer/ID, z. B. `#1`, `#577`, oder der UUID).
  - Jeder Datensatz-Ordner enthält die zugehörigen Nutzdaten (PDF-Dokumente, Bilder, TXT-Dateien, optionale Unterordner wie `B` und `D`) sowie eine strukturierte Metadaten-Datei (`meta.json`).
  - Schema der `meta.json`: `uuid` (v4), `id` (laufende Nummer/Kennung), `bezeichnung` (Titel/Name), `kategorie` (z. B. „Muster Recht“), `schemaVersion`, `lastModified` (ISO-Timestamp) sowie ein Objekt/Array für verknüpfte Dateien inklusive SHA-256-Hashes zur Änderungserkennung.
- Nutze IndexedDB als lokalen Cache- und Suchindex, der beim Öffnen eines lokalen Stammverzeichnisses automatisch aus den Ordnern und `meta.json`-Dateien aufgebaut und bei Änderungen aktualisiert wird.

### 3. WebDAV-Synchronisations-Engine (Synology Drive / NAS)
- Implementiere ein eigenes WebDAV-Client-Modul für den direkten Abgleich aus dem Browser per `fetch()` mit HTTP Basic Authentication (ausgelegt für Synology WebDAV Server hinter einem Reverse Proxy mit CORS-Headern).
- Unterstützte WebDAV-Methoden: `PROPFIND` (mit `Depth: 1` bzw. rekursiv zur Ermittlung des Remote-Verzeichnisbaums inklusive `getlastmodified` und `getcontentlength`), `MKCOL` (Anlegen neuer Datensatz-Ordner auf dem NAS), `PUT` (Hochladen neuer/geänderter `meta.json` und Nutzdaten) und `GET` (Herunterladen neuer/geänderter Remote-Dateien in das lokale Verzeichnis über die File System Access API).
- Sync-Logik: Vergleiche den lokalen Zustand (Zeitstempel / SHA-256-Hash) mit dem Remote-Zustand. Übertrage ausschließlich geänderte oder neue Einzeldateien. Implementiere eine saubere Konfliktbehandlung (wenn beide Seiten seit dem letzten Sync geändert wurden: Erstellen einer Konfliktkopie mit Zeitstempel oder Nutzerabfrage im UI).
- Zeige den Sync-Fortschritt, übertragene Dateien und eventuelle Fehler (inkl. verständlicher Hinweise bei CORS- oder Authentifizierungsfehlern) im UI an.

### 4. Benutzeroberfläche (UI-Layout & Workflows)
- **Top-Bar:** Button zum Auswählen/Verbinden des lokalen Ordners, Button „Mit NAS abgleichen (WebDAV)“ mit Status-Badge (letzter Sync, ausstehende Änderungen), Button für Excel-Import/Export sowie Einstellungs-Modal für WebDAV-Zugangsdaten.
- **Linke Seitenleiste (Suche & Filter):** Echtzeit-Suchmaske für Volltextsuche über `UUID`, `ID`, `Bezeichnung` und Kategorien sowie Filter-Optionen und Button zum Anlegen eines neuen Datensatzes (generiert automatisch UUID, ID, lokalen Ordner und `meta.json`).
- **Hauptbereich (Split-View oder umschaltbar):**
  - **Tabellenansicht:** Übersicht aller Datensätze mit den Spalten `UUID`, `ID`, `Bezeichnung`, `Kategorie`, `Dateianzahl` und `Sync-Status`. Klick auf eine Zeile öffnet die Detailansicht.
  - **Detailansicht:** Formular zum Bearbeiten der Metadaten (`ID`, `Bezeichnung`, `Kategorie`, Notizen/TXT), Dateiliste des Datensatz-Ordners mit Upload-Funktion (Drag & Drop zum Hinzufügen neuer PDFs/Bilder in den lokalen Ordner) sowie integrierter Dokumenten- und Bildvorschau (PDF-Viewer via `<iframe>`/`<embed>` und Bildvorschau via Object-URLs).
- **Excel-Schnittstelle (XLS/XLSX):** Binde SheetJS (`xlsx`) ein, um eine schlanke Tabellenübersicht der reinen Text-Metadaten (ohne eingebettete Bilder) als `.xlsx` zu exportieren oder Metadaten-Updates aus einer `.xlsx`-Datei in die jeweiligen `meta.json`-Dateien zu importieren.

### 5. Vorgehensweise
1. Prüfe zuerst @E2 und @C2 auf vorhandene Architektur-Patterns, UI-Komponenten und Hilfsfunktionen.
2. Erstelle eine saubere modulare Dateistruktur (z. B. `index.html`, `styles/`, `js/fs-local.js`, `js/webdav-sync.js`, `js/db-index.js`, `js/excel-io.js`, `js/ui.js`, `js/app.js`).
3. Implementiere alle Module vollständig und lauffähig ohne Platzhalter-Code.
4. Erstelle abschließend eine kurze `README.md` mit Anleitung zur Einrichtung des Synology WebDAV Reverse Proxys (inklusive der benötigten CORS-Header für GitHub Pages) und zum Deployment auf GitHub Pages.