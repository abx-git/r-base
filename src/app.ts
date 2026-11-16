import { appState, patchState } from "./state";
import { mountShell, setPreviewContent } from "./ui/shell";
import { openSettingsModal } from "./ui/settings-modal";
import {
  pickDirectory,
  loadRootHandle,
  persistRootHandle,
  queryWriteAccess,
} from "./lib/workspace";
import {
  scanAllDatasets,
  createDataset,
  addFilesToDataset,
  writeMetaToFolder,
  deleteFileFromDataset,
  renameDatasetLocId,
  isImagePath,
  updateFileUserMeta,
} from "./lib/fs-local";
import {
  rebuildIndex,
  recordFromScan,
  loadAllRecords,
  loadGlobalSync,
  saveGlobalSync,
  syncStatusAfterLocalEdit,
} from "./lib/db-index";
import { hasWebDavCredentials } from "./lib/credentials";
import { runWebDavSync, pendingLocalChanges } from "./lib/webdav-sync";
import { downloadBlob, exportMetadataXlsx, importMetadataXlsx } from "./lib/excel-io";
import { readFileAtPath } from "./lib/workspace";
import { setMetaFieldValue } from "./lib/meta-field-access";

async function reloadFromDisk(): Promise<void> {
  if (!appState.rootHandle) return;
  const scans = await scanAllDatasets(appState.rootHandle);
  const records = scans.map((s) => recordFromScan(s, syncStatusAfterLocalEdit()));
  await rebuildIndex(records);
  const globalSync = await loadGlobalSync();
  globalSync.pendingCount = pendingLocalChanges(scans);
  await saveGlobalSync(globalSync);
  patchState({ scans, records, globalSync, ready: true });
}

async function connectFolder(): Promise<void> {
  patchState({ error: "", message: "" });
  let handle = await pickDirectory();
  if (!handle) {
    const restored = await loadRootHandle();
    if (restored && (await queryWriteAccess(restored))) handle = restored;
  }
  if (!handle) return;
  if (!(await queryWriteAccess(handle))) {
    patchState({ error: "Keine Schreibberechtigung für den Ordner." });
    return;
  }
  await persistRootHandle(handle);
  patchState({ rootHandle: handle, rootLabel: handle.name });
  await reloadFromDisk();
  patchState({ message: "Stammordner verbunden." });
}

export function startApp(container: HTMLElement): void {
  if (window.location.protocol === "file:") {
    patchState({
      error: "R-Base nicht über file:// öffnen. npm run dev und http://localhost:5173 verwenden oder GitHub Pages.",
    });
  }

  void (async () => {
    const globalSync = await loadGlobalSync();
    const records = await loadAllRecords();
    patchState({ globalSync, records });
    const restored = await loadRootHandle();
    if (restored && (await queryWriteAccess(restored))) {
      patchState({ rootHandle: restored, rootLabel: restored.name });
      await reloadFromDisk();
    }
  })();

  mountShell(container, {
    onPickFolder: connectFolder,
    canSync: () => hasWebDavCredentials(),
    onSync: async () => {
      if (!appState.rootHandle) return;
      patchState({ syncBusy: true, syncLogs: [], error: "", message: "" });
      try {
        const result = await runWebDavSync(appState.rootHandle, (p) => patchState({ syncProgress: p }));
        const globalSync = await loadGlobalSync();
        globalSync.lastRunAt = new Date().toISOString();
        globalSync.lastOk = result.ok;
        globalSync.lastError = result.logs.find((l) => l.level === "error")?.message ?? null;
        await saveGlobalSync(globalSync);
        await reloadFromDisk();
        const records = appState.records.map((r) =>
          result.blockedLocIds.includes(r.locId) ? { ...r, syncStatus: "blocked" as const } : r,
        );
        patchState({
          syncBusy: false,
          syncProgress: null,
          syncLogs: result.logs,
          globalSync,
          records,
          message: result.ok ? "Sync abgeschlossen." : "Sync mit Fehlern beendet.",
        });
      } catch (e) {
        patchState({
          syncBusy: false,
          syncProgress: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    onExcelExport: () => {
      const blob = exportMetadataXlsx(appState.scans);
      downloadBlob(blob, `r-base-metadaten-${new Date().toISOString().slice(0, 10)}.xlsx`);
    },
    onExcelImport: () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".xlsx,.xls";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        const result = await importMetadataXlsx(file, appState.scans);
        await reloadFromDisk();
        patchState({
          message: `Import: ${result.updated} aktualisiert, ${result.skipped} übersprungen.`,
          error: result.errors.length ? result.errors.join(" · ") : "",
        });
      });
      input.click();
    },
    onOpenSettings: () => {
      openSettingsModal(
        () => patchState({}),
        () => patchState({ message: "Schema-Konfiguration aktualisiert." }),
      );
    },
    onNewDataset: async () => {
      if (!appState.rootHandle) return;
      const scan = await createDataset(appState.rootHandle, {
        bezeichnung: "Neuer Datensatz",
        kategorie: "",
      });
      await reloadFromDisk();
      patchState({
        selectedLocId: scan.locId,
        view: "detail",
        message: "Datensatz angelegt.",
      });
    },
    onMetaChange: async (partial) => {
      const scan = appState.scans.find((s) => s.meta.locId === appState.selectedLocId);
      if (!scan) return;
      Object.assign(scan.meta, partial);
      await writeMetaToFolder(scan.handle, scan.meta);
      await reloadFromDisk();
    },
    onMetaFieldChange: async (fieldKey, value) => {
      const scan = appState.scans.find((s) => s.meta.locId === appState.selectedLocId);
      if (!scan) return;
      setMetaFieldValue(scan.meta, fieldKey, value);
      scan.meta.lastModified = new Date().toISOString();
      await writeMetaToFolder(scan.handle, scan.meta);
      await reloadFromDisk();
    },
    onAddFiles: async (files) => {
      const scan = appState.scans.find((s) => s.meta.locId === appState.selectedLocId);
      if (!scan) return;
      await addFilesToDataset(scan.handle, scan.meta, files);
      await reloadFromDisk();
      patchState({ message: `${files.length} Datei(en) hinzugefügt.` });
    },
    onPreviewFile: async (relativePath) => {
      const scan = appState.scans.find((s) => s.meta.locId === appState.selectedLocId);
      if (!scan) return;
      const file = await readFileAtPath(scan.handle, relativePath);
      if (!file) return;
      const url = URL.createObjectURL(file);
      const lower = relativePath.toLowerCase();
      if (lower.endsWith(".pdf")) setPreviewContent("pdf", url);
      else if (isImagePath(lower)) setPreviewContent("image", url);
      else setPreviewContent("none", null);
    },
    getFileObjectUrl: async (relativePath) => {
      const scan = appState.scans.find((s) => s.meta.locId === appState.selectedLocId);
      if (!scan) throw new Error("Kein Datensatz");
      const file = await readFileAtPath(scan.handle, relativePath);
      if (!file) throw new Error("Datei fehlt");
      return URL.createObjectURL(file);
    },
    onDeleteFile: async (relativePath) => {
      const scan = appState.scans.find((s) => s.meta.locId === appState.selectedLocId);
      if (!scan) return;
      await deleteFileFromDataset(scan.handle, scan.meta, relativePath);
      await reloadFromDisk();
      patchState({ message: "Datei gelöscht." });
    },
    onFileMetaChange: async (relativePath, patch) => {
      const scan = appState.scans.find((s) => s.meta.locId === appState.selectedLocId);
      if (!scan) return;
      await updateFileUserMeta(scan.handle, scan.meta, relativePath, patch);
      await reloadFromDisk();
    },
    onChangeDatasetId: async (rawNewId) => {
      if (!appState.rootHandle) return;
      const scan = appState.scans.find((s) => s.meta.locId === appState.selectedLocId);
      if (!scan) return;
      const updated = await renameDatasetLocId(appState.rootHandle, scan, rawNewId);
      await reloadFromDisk();
      patchState({
        selectedLocId: updated.locId,
        message: "ID geändert.",
        error: "",
      });
    },
    onRerender: () => patchState({}),
  });
}