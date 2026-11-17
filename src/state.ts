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
type PersistIndicatorListener = () => void;

const listeners = new Set<Listener>();
const persistIndicatorListeners = new Set<PersistIndicatorListener>();

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
    patchPersistStatus("idle");
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

/** UI neu zeichnen, ohne State zu ändern (z. B. nach Schema speichern). */
export function forceAppRerender(): void {
  for (const l of listeners) l();
}

/** Speicher-Icon in der Kopfzeile — ohne komplette UI neu zu rendern. */
export function subscribePersistIndicator(listener: PersistIndicatorListener): () => void {
  persistIndicatorListeners.add(listener);
  return () => persistIndicatorListeners.delete(listener);
}

export function patchPersistStatus(status: PersistStatus): void {
  if (appState.persistStatus === status) return;
  appState.persistStatus = status;
  if (status === "saved") schedulePersistSavedIdle();
  else if (status === "dirty" || status === "saving") clearPersistIdleTimer();
  else if (status === "idle") clearPersistIdleTimer();
  for (const l of persistIndicatorListeners) l();
}

export function patchState(partial: Partial<AppState>): void {
  const { persistStatus, ...rest } = partial;
  if (persistStatus !== undefined) patchPersistStatus(persistStatus);
  const restKeys = Object.keys(rest) as (keyof AppState)[];
  if (!restKeys.length) return;

  Object.assign(appState, rest);
  if ("message" in rest || "error" in rest) {
    if (appState.message || appState.error) scheduleBannerDismiss();
    else clearBannerDismissTimer();
  }
  for (const l of listeners) l();
}

export async function withPersistStatus(work: () => Promise<void>): Promise<void> {
  patchPersistStatus("saving");
  try {
    await work();
    patchPersistStatus("saved");
  } catch (e) {
    patchPersistStatus("dirty");
    throw e;
  }
}

export function getSelectedScan(): DatasetScan | null {
  return findScanByLocId(appState.scans, appState.selectedLocId);
}