import type { IndexRecord, GlobalSyncMeta } from "./lib/db-index";
import type { TagFilterRule } from "./lib/dataset-tags";
import type { DatasetScan } from "./lib/fs-local";
import { findScanByLocId } from "./lib/dataset-scan-match";
import type { SyncLogLine, SyncProgress } from "./lib/webdav-sync";

export type AppView = "table" | "detail";

export type PersistStatus = "idle" | "dirty" | "saving" | "saved";

export type TableSortState = {
  fieldKey: string;
  source: "meta" | "index";
  dir: "asc" | "desc";
};

export type AppState = {
  rootHandle: FileSystemDirectoryHandle | null;
  rootLabel: string;
  ready: boolean;
  message: string;
  error: string;
  records: IndexRecord[];
  scans: DatasetScan[];
  filterQuery: string;
  filterKategorie: string;
  filterTagRules: TagFilterRule[];
  tableSort: TableSortState | null;
  /** Tabellenansicht: Spalten aus diesem Schema (null = Standardschema). */
  listViewSchemaId: string | null;
  /** Mehrfachauswahl in der Tabellenansicht (locIds). */
  tableSelection: string[];
  view: AppView;
  selectedLocId: string | null;
  syncBusy: boolean;
  syncProgress: SyncProgress | null;
  syncLogs: SyncLogLine[];
  globalSync: GlobalSyncMeta;
  /** Lokales meta.json: ungespeichert / speichert / gerade gespeichert */
  persistStatus: PersistStatus;
};

type Listener = () => void;

const listeners = new Set<Listener>();

const BANNER_DISMISS_MS = 6_000;
const PERSIST_SAVED_IDLE_MS = 5_000;
let bannerDismissTimer: ReturnType<typeof setTimeout> | undefined;
let persistIdleTimer: ReturnType<typeof setTimeout> | undefined;

function clearPersistIdleTimer(): void {
  if (persistIdleTimer === undefined) return;
  clearTimeout(persistIdleTimer);
  persistIdleTimer = undefined;
}

function schedulePersistSavedIdle(): void {
  clearPersistIdleTimer();
  persistIdleTimer = setTimeout(() => {
    persistIdleTimer = undefined;
    if (appState.persistStatus !== "saved") return;
    Object.assign(appState, { persistStatus: "idle" as PersistStatus });
    for (const l of listeners) l();
  }, PERSIST_SAVED_IDLE_MS);
}

function clearBannerDismissTimer(): void {
  if (bannerDismissTimer === undefined) return;
  clearTimeout(bannerDismissTimer);
  bannerDismissTimer = undefined;
}

function scheduleBannerDismiss(): void {
  clearBannerDismissTimer();
  if (!appState.message && !appState.error) return;
  bannerDismissTimer = setTimeout(() => {
    bannerDismissTimer = undefined;
    if (!appState.message && !appState.error) return;
    Object.assign(appState, { message: "", error: "" });
    for (const l of listeners) l();
  }, BANNER_DISMISS_MS);
}

export function dismissBanners(): void {
  if (!appState.message && !appState.error) return;
  clearBannerDismissTimer();
  Object.assign(appState, { message: "", error: "" });
  for (const l of listeners) l();
}

export const appState: AppState = {
  rootHandle: null,
  rootLabel: "",
  ready: false,
  message: "",
  error: "",
  records: [],
  scans: [],
  filterQuery: "",
  filterKategorie: "",
  filterTagRules: [],
  tableSort: { fieldKey: "bezeichnung", source: "meta", dir: "asc" },
  listViewSchemaId: null,
  tableSelection: [],
  view: "table",
  selectedLocId: null,
  syncBusy: false,
  syncProgress: null,
  syncLogs: [],
  globalSync: {
    lastRunAt: null,
    lastOk: false,
    lastError: null,
    pendingCount: 0,
  },
  persistStatus: "idle",
};

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function patchState(partial: Partial<AppState>): void {
  Object.assign(appState, partial);
  if ("message" in partial || "error" in partial) {
    if (appState.message || appState.error) scheduleBannerDismiss();
    else clearBannerDismissTimer();
  }
  if ("persistStatus" in partial) {
    if (appState.persistStatus === "saved") schedulePersistSavedIdle();
    else if (appState.persistStatus === "dirty" || appState.persistStatus === "saving") {
      clearPersistIdleTimer();
    }
  }
  for (const l of listeners) l();
}

export async function withPersistStatus(work: () => Promise<void>): Promise<void> {
  patchState({ persistStatus: "saving" });
  try {
    await work();
    patchState({ persistStatus: "saved" });
  } catch (e) {
    patchState({ persistStatus: "dirty" });
    throw e;
  }
}

export function getSelectedScan(): DatasetScan | null {
  return findScanByLocId(appState.scans, appState.selectedLocId);
}