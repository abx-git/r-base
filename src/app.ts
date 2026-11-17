import { findScanByLocId, locIdsReferToSameRecord } from "./lib/dataset-scan-match";
import { bindMetaAutoSave, commitMetaFieldSave, queueMetaFieldSave } from "./lib/meta-auto-save";
import { appState, forceAppRerender, getSelectedScan, patchState, withPersistStatus } from "./state";
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
  softDeleteDataset,
  restoreSoftDeletedDataset,
  isImagePath,
  updateFileUserMeta,
} from "./lib/fs-local";
import { canUndo, popUndo, pushUndo } from "./lib/undo-stack";
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
import { downloadBlob, importMetadataXlsx } from "./lib/excel-io";
import { openSchemaExcelExportModal } from "./ui/excel-export-modal";
import { importJuraCsvFile } from "./lib/jura-csv-import";
import { readFileAtPath } from "./lib/workspace";
import { setMetaFieldValue } from "./lib/meta-field-access";
import { normalizeDatasetTags } from "./lib/dataset-tags";
import type { DatasetSchemaDefinition } from "./lib/dataset-schema-types";
import {
  activeListSchemaId,
  installSystemSchemaConfig,
  loadSystemSchemaConfig,
  resolveSchemaForDataset,
} from "./lib/dataset-schema-store";
import { setSchemaFieldHidden } from "./lib/meta-hidden-fields";
import { pickSchemaIdForImport } from "./lib/schema-import-ui";
import { openSchemaHtmlExportModal } from "./ui/schema-html-export-modal";
import { openSchemaPdfExportModal } from "./ui/schema-export-modal";
import { buildRecordFilter, filterScansByRecordFilter } from "./lib/record-filter";
import {
  bindProjectRoot,
  getProjectUiSettings,
  readProjectConfigFromRoot,
  setProjectUiSettings,
  writeProjectConfigToRoot,
  type ProjectConfigFile,
} from "./lib/project-config";
import { getWebDavSettings, setWebDavSettings } from "./lib/credentials";

async function applyProjectConfigFromRoot(root: FileSystemDirectoryHandle): Promise<void> {
  bindProjectRoot(root);
  let file = await readProjectConfigFromRoot(root);
  if (!file) {
    const bootstrap: ProjectConfigFile = {
      configVersion: 1,
      schemas: loadSystemSchemaConfig(),
      settings: { webdav: getWebDavSettings(), ui: getProjectUiSettings() },
    };
    await writeProjectConfigToRoot(root, bootstrap);
    file = bootstrap;
  }
  installSystemSchemaConfig(file.schemas);
  setWebDavSettings(file.settings?.webdav ?? { baseUrl: "", username: "" });
  setProjectUiSettings(file.settings?.ui ?? {});
}

async function reloadFromDisk(): Promise<void> {
  if (!appState.rootHandle) return;
  await applyProjectConfigFromRoot(appState.rootHandle);
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
  patchState({ listViewSchemaId: null, message: "Stammordner verbunden." });
}

async function refreshIndexAfterMetaWrite(scan: DatasetScan): Promise<void> {
  const record = recordFromScan(scan, syncStatusAfterLocalEdit());
  const records = appState.records.map((r) =>
    locIdsReferToSameRecord(r.locId, record.locId) ? record : r,
  );
  await rebuildIndex(records);
  const globalSync = { ...appState.globalSync, pendingCount: pendingLocalChanges(appState.scans) };
  appState.records = records;
  appState.globalSync = globalSync;
  const editingThisDetail =
    appState.view === "detail" &&
    appState.selectedLocId &&
    locIdsReferToSameRecord(appState.selectedLocId, scan.meta.locId);
  if (!editingThisDetail) {
    patchState({ records, globalSync });
  }
}

async function persistMetaFieldValue(locId: string, fieldKey: string, value: unknown): Promise<void> {
  const scan = findScanByLocId(appState.scans, locId);
  if (!scan) return;
  setMetaFieldValue(scan.meta, fieldKey, value);
  scan.meta.lastModified = new Date().toISOString();
  await writeMetaToFolder(scan.handle, scan.meta);
  await refreshIndexAfterMetaWrite(scan);
}

bindMetaAutoSave(persistMetaFieldValue);

function reportMetaSaveError(e: unknown): void {
  patchState({ error: e instanceof Error ? e.message : String(e) });
}

async function handleSetFieldHidden(
  fieldKey: string,
  hidden: boolean,
  schemaOverride?: DatasetSchemaDefinition,
): Promise<void> {
  const scan = getSelectedScan();
  if (!scan) return;
  const schema = schemaOverride ?? resolveSchemaForDataset(scan.meta);
  setSchemaFieldHidden(scan.meta, schema, fieldKey, hidden);
  try {
    await writeMetaToFolder(scan.handle, scan.meta);
    await reloadFromDisk();
    patchState({
      message: hidden ? `Feld „${fieldKey}“ ausgeblendet.` : `Feld „${fieldKey}“ eingeblendet.`,
      error: "",
    });
  } catch (e) {
    patchState({ error: e instanceof Error ? e.message : String(e) });
  }
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
      if (!appState.ready) return;
      const filter = buildRecordFilter({
        query: appState.filterQuery,
        tagRules: appState.filterTagRules,
        columnFilters: appState.tableColumnFilters,
      });
      const scans = filterScansByRecordFilter(appState.scans, appState.records, filter);
      openSchemaExcelExportModal(scans, appState.records, filter, (msg, isError) => {
        patchState(isError ? { error: msg, message: "" } : { message: msg, error: "" });
      });
    },
    onSchemaPdfExport: () => {
      if (!appState.ready) return;
      const filter = buildRecordFilter({
        query: appState.filterQuery,
        tagRules: appState.filterTagRules,
        columnFilters: appState.tableColumnFilters,
      });
      const scans = filterScansByRecordFilter(appState.scans, appState.records, filter);
      openSchemaPdfExportModal(scans, filter, (msg, isError) => {
        patchState(isError ? { error: msg, message: "" } : { message: msg, error: "" });
      });
    },
    onSchemaHtmlExport: () => {
      if (!appState.ready || !appState.rootHandle) {
        patchState({ error: "Zuerst Stammordner mit Schreibzugriff wählen.", message: "" });
        return;
      }
      const filter = buildRecordFilter({
        query: appState.filterQuery,
        tagRules: appState.filterTagRules,
        columnFilters: appState.tableColumnFilters,
      });
      const scans = filterScansByRecordFilter(appState.scans, appState.records, filter);
      openSchemaHtmlExportModal(appState.rootHandle, scans, filter, (msg, isError) => {
        patchState(isError ? { error: msg, message: "" } : { message: msg, error: "" });
      });
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
    onCsvImport: () => {
      if (!appState.rootHandle) return;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv,text/csv";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file || !appState.rootHandle) return;
        const tagRaw = window.prompt(
          "Tag für neu angelegte Datensätze (optional, leer = kein Tag):",
          "Jura-Import",
        );
        if (tagRaw === null) return;
        const importTag = tagRaw.trim();
        const targetSchemaId = pickSchemaIdForImport(
          "Ziel-Schema für CSV-Import",
          activeListSchemaId(appState.listViewSchemaId),
        );
        if (targetSchemaId === null) return;
        try {
          const result = await importJuraCsvFile(appState.rootHandle, file, {
            importTag: importTag || undefined,
            targetSchemaId,
          });
          await reloadFromDisk();
          const tagNote = importTag ? ` Tag „${importTag}".` : "";
          patchState({
            message: `CSV: ${result.created} neu, ${result.updated} aktualisiert, ${result.skipped} übersprungen.${tagNote} Gespeichert unter ${result.storedPath}.`,
            error: result.errors.length ? result.errors.slice(0, 8).join(" · ") : "",
          });
        } catch (e) {
          patchState({ error: e instanceof Error ? e.message : String(e) });
        }
      });
      input.click();
    },
    onOpenSettings: () => {
      openSettingsModal({
        onClose: () => patchState({}),
        onSchemaChanged: () => patchState({ message: "Schema-Konfiguration aktualisiert." }),
        onSetFieldHidden: handleSetFieldHidden,
        onRerender: () => forceAppRerender(),
      });
    },
    onNewDataset: async () => {
      if (!appState.rootHandle) return;
      const schemaId = activeListSchemaId(appState.listViewSchemaId);
      const scan = await createDataset(
        appState.rootHandle,
        {
          kategorie: "",
        },
        schemaId,
      );
      await reloadFromDisk();
      patchState({
        selectedLocId: scan.locId,
        view: "detail",
        message: "Datensatz angelegt.",
      });
    },
    onMetaChange: async (partial) => {
      const scan = getSelectedScan();
      if (!scan) return;
      try {
        await withPersistStatus(async () => {
          Object.assign(scan.meta, partial);
          await writeMetaToFolder(scan.handle, scan.meta);
          await reloadFromDisk();
        });
      } catch (e) {
        reportMetaSaveError(e);
      }
    },
    onMetaFieldDraft: (fieldKey, value) => {
      if (!getSelectedScan()) return;
      queueMetaFieldSave(fieldKey, value);
    },
    onMetaFieldCommit: (fieldKey, value) => {
      void commitMetaFieldSave(fieldKey, value).catch(reportMetaSaveError);
    },
    onMetaFieldChange: async (fieldKey, value) => {
      try {
        await commitMetaFieldSave(fieldKey, value);
      } catch (e) {
        reportMetaSaveError(e);
      }
    },
    onAddFiles: async (files) => {
      const scan = getSelectedScan();
      if (!scan) return;
      try {
        await withPersistStatus(async () => {
          await addFilesToDataset(scan.handle, scan.meta, files);
          await reloadFromDisk();
        });
        patchState({ message: `${files.length} Datei(en) hinzugefügt.` });
      } catch (e) {
        reportMetaSaveError(e);
      }
    },
    onPreviewFile: async (relativePath) => {
      const scan = getSelectedScan();
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
      const scan = getSelectedScan();
      if (!scan) throw new Error("Kein Datensatz");
      const file = await readFileAtPath(scan.handle, relativePath);
      if (!file) throw new Error("Datei fehlt");
      return URL.createObjectURL(file);
    },
    onDeleteFile: async (relativePath) => {
      const scan = getSelectedScan();
      if (!scan) return;
      try {
        await withPersistStatus(async () => {
          await deleteFileFromDataset(scan.handle, scan.meta, relativePath);
          await reloadFromDisk();
        });
        patchState({ message: "Datei gelöscht." });
      } catch (e) {
        reportMetaSaveError(e);
      }
    },
    onFileMetaChange: async (relativePath, patch) => {
      const scan = getSelectedScan();
      if (!scan) return;
      try {
        await withPersistStatus(async () => {
          await updateFileUserMeta(scan.handle, scan.meta, relativePath, patch);
          await reloadFromDisk();
        });
      } catch (e) {
        reportMetaSaveError(e);
      }
    },
    onChangeDatasetId: async (rawNewId) => {
      if (!appState.rootHandle) return;
      const scan = getSelectedScan();
      if (!scan) return;
      const updated = await renameDatasetLocId(appState.rootHandle, scan, rawNewId);
      await reloadFromDisk();
      patchState({
        selectedLocId: updated.locId,
        message: "ID geändert.",
        error: "",
      });
    },
    onSoftDeleteDataset: async () => {
      if (!appState.rootHandle) return;
      const scan = getSelectedScan();
      if (!scan) return;
      try {
        const moved = await softDeleteDataset(appState.rootHandle, scan);
        pushUndo({
          type: "dataset-soft-delete",
          locId: moved.locId,
          folderNameInDeleted: moved.folderName,
        });
        await reloadFromDisk();
        patchState({
          view: "table",
          selectedLocId: null,
          message: "Datensatz nach „deleted“ verschoben. Strg+Z / ⌘Z zum Zurückholen.",
          error: "",
        });
      } catch (e) {
        patchState({ error: e instanceof Error ? e.message : String(e) });
      }
    },
    onBulkSoftDelete: async (locIds) => {
      if (!appState.rootHandle || !locIds.length) return;
      const errors: string[] = [];
      let ok = 0;
      const deletedIds = new Set<string>();
      for (const locId of locIds) {
        const scan = appState.scans.find((s) => s.meta.locId === locId);
        if (!scan) continue;
        try {
          const moved = await softDeleteDataset(appState.rootHandle, scan);
          pushUndo({
            type: "dataset-soft-delete",
            locId: moved.locId,
            folderNameInDeleted: moved.folderName,
          });
          deletedIds.add(locId);
          ok++;
        } catch (e) {
          errors.push(`${locId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!ok) {
        patchState({ error: errors.slice(0, 6).join(" · ") || "Löschen fehlgeschlagen." });
        return;
      }
      await reloadFromDisk();
      const remainingSel = appState.tableSelection.filter((id) => !deletedIds.has(id));
      patchState({
        tableSelection: remainingSel,
        selectedLocId:
          appState.selectedLocId && deletedIds.has(appState.selectedLocId) ? null : appState.selectedLocId,
        view: "table",
        message: `${ok} Datensätze nach „deleted“ verschoben. Strg+Z / ⌘Z je einen zurück.`,
        error: errors.length ? errors.slice(0, 6).join(" · ") : "",
      });
    },
    onSetFieldHidden: handleSetFieldHidden,
    onBulkAssignTag: async (locIds, rawTag) => {
      if (!appState.rootHandle || !locIds.length) return;
      const tags = normalizeDatasetTags([rawTag]);
      const tag = tags[0];
      if (!tag) return;
      const errors: string[] = [];
      let ok = 0;
      for (const locId of locIds) {
        const scan = appState.scans.find((s) => s.meta.locId === locId);
        if (!scan) continue;
        try {
          scan.meta.tags = normalizeDatasetTags([...(scan.meta.tags ?? []), tag]);
          await writeMetaToFolder(scan.handle, scan.meta);
          ok++;
        } catch (e) {
          errors.push(`${locId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!ok) {
        patchState({ error: errors.slice(0, 6).join(" · ") || "Tag zuweisen fehlgeschlagen." });
        return;
      }
      await reloadFromDisk();
      patchState({
        message: `Tag „${tag}" ${ok} Datensätzen zugewiesen.`,
        error: errors.length ? errors.slice(0, 6).join(" · ") : "",
      });
    },
    onUndo: async () => {
      if (!appState.rootHandle) return;
      if (!canUndo()) {
        patchState({ message: "Nichts zum Rückgängigmachen.", error: "" });
        return;
      }
      const action = popUndo();
      if (!action || action.type !== "dataset-soft-delete") return;
      try {
        const restored = await restoreSoftDeletedDataset(appState.rootHandle, action.folderNameInDeleted);
        await reloadFromDisk();
        patchState({
          selectedLocId: restored.locId,
          view: "detail",
          message: "Löschen rückgängig gemacht.",
          error: "",
        });
      } catch (e) {
        pushUndo(action);
        patchState({ error: e instanceof Error ? e.message : String(e) });
      }
    },
    onRerender: () => forceAppRerender(),
  });
}