import type { DatasetMeta, SyncStatusKind } from "./meta-schema";
import type { DatasetScan } from "./fs-local";

const IDB_NAME = "r-base-index";
const IDB_VERSION = 1;
const STORE_RECORDS = "records";
const STORE_SYNC = "sync-meta";

export type IndexRecord = {
  locId: string;
  bezeichnung: string;
  kategorie: string;
  fileCount: number;
  lastModified: string;
  syncStatus: SyncStatusKind;
};

export type GlobalSyncMeta = {
  lastRunAt: string | null;
  lastOk: boolean;
  lastError: string | null;
  pendingCount: number;
};

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        const store = db.createObjectStore(STORE_RECORDS, { keyPath: "locId" });
        store.createIndex("bezeichnung", "bezeichnung", { unique: false });
        store.createIndex("kategorie", "kategorie", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC)) {
        db.createObjectStore(STORE_SYNC);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function recordFromScan(scan: DatasetScan, syncStatus: SyncStatusKind = "unknown"): IndexRecord {
  return {
    locId: scan.meta.locId,
    bezeichnung: scan.meta.bezeichnung,
    kategorie: scan.meta.kategorie,
    fileCount: scan.meta.files.length,
    lastModified: scan.meta.lastModified,
    syncStatus,
  };
}

export async function rebuildIndex(records: IndexRecord[]): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, "readwrite");
    const store = tx.objectStore(STORE_RECORDS);
    store.clear();
    for (const row of records) store.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function upsertRecord(record: IndexRecord): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, "readwrite");
    tx.objectStore(STORE_RECORDS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadAllRecords(): Promise<IndexRecord[]> {
  const db = await openIdb();
  const rows = await new Promise<IndexRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, "readonly");
    const req = tx.objectStore(STORE_RECORDS).getAll();
    req.onsuccess = () => resolve((req.result as IndexRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, "de"));
}

export async function saveGlobalSync(meta: GlobalSyncMeta): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SYNC, "readwrite");
    tx.objectStore(STORE_SYNC).put(meta, "global");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadGlobalSync(): Promise<GlobalSyncMeta> {
  const db = await openIdb();
  const row = await new Promise<GlobalSyncMeta | null>((resolve, reject) => {
    const tx = db.transaction(STORE_SYNC, "readonly");
    const req = tx.objectStore(STORE_SYNC).get("global");
    req.onsuccess = () => resolve((req.result as GlobalSyncMeta | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return (
    row ?? {
      lastRunAt: null,
      lastOk: false,
      lastError: null,
      pendingCount: 0,
    }
  );
}

export function filterRecords(records: IndexRecord[], query: string, kategorie: string): IndexRecord[] {
  const q = query.trim().toLowerCase();
  const k = kategorie.trim().toLowerCase();
  return records.filter((r) => {
    if (k && r.kategorie.toLowerCase() !== k) return false;
    if (!q) return true;
    return (
      r.locId.toLowerCase().includes(q) ||
      r.bezeichnung.toLowerCase().includes(q) ||
      r.kategorie.toLowerCase().includes(q)
    );
  });
}

export function syncStatusAfterLocalEdit(): SyncStatusKind {
  return "local-changes";
}