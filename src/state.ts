import type { IndexRecord, GlobalSyncMeta } from "./lib/db-index";
import type { TagFilterRule } from "./lib/dataset-tags";
import type { DatasetScan } from "./lib/fs-local";
import type { SyncLogLine, SyncProgress } from "./lib/webdav-sync";

export type AppView = "table" | "detail";

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
  /** Mehrfachauswahl in der Tabellenansicht (locIds). */
  tableSelection: string[];
  view: AppView;
  selectedLocId: string | null;
  syncBusy: boolean;
  syncProgress: SyncProgress | null;
  syncLogs: SyncLogLine[];
  globalSync: GlobalSyncMeta;
};

type Listener = () => void;

const listeners = new Set<Listener>();

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
};

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function patchState(partial: Partial<AppState>): void {
  Object.assign(appState, partial);
  for (const l of listeners) l();
}

export function getSelectedScan(): DatasetScan | null {
  if (!appState.selectedLocId) return null;
  return appState.scans.find((s) => s.meta.locId === appState.selectedLocId) ?? null;
}