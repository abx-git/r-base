import type { DatasetMeta } from "./meta-schema";
import { META_FILENAME } from "./meta-schema";
import type { DatasetScan } from "./fs-local";
import { scanAllDatasets, writeMetaToFolder } from "./fs-local";
import { getBlob, mkcol, propfind, putBlob } from "./webdav-client";
import { parsePropfindResponse } from "./webdav-xml";
import { readFileAtPath, writeFileAtPath } from "./workspace";
import { getWebDavSettings } from "./credentials";

export type SyncProgress = {
  phase: string;
  current: number;
  total: number;
  fileName: string;
};

export type SyncLogLine = {
  level: "info" | "warn" | "error";
  message: string;
};

export type SyncResult = {
  ok: boolean;
  logs: SyncLogLine[];
  blockedLocIds: string[];
};

function parseHttpDate(value: string | null): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

function remoteKey(href: string, basePath: string): string {
  const norm = href.replace(/\/+$/, "");
  const base = basePath.replace(/\/+$/, "");
  if (base && norm.startsWith(base)) return norm.slice(base.length).replace(/^\/+/, "");
  return norm.replace(/^\/+/, "");
}

async function listRemoteTree(): Promise<Map<string, { etag: string | null; mtime: number; collection: boolean }>> {
  const settings = getWebDavSettings();
  const res = await propfind("", "1");
  const xml = await res.text();
  const resources = parsePropfindResponse(xml, settings.baseUrl);
  const map = new Map<string, { etag: string | null; mtime: number; collection: boolean }>();
  const basePath = new URL(settings.baseUrl).pathname.replace(/\/+$/, "");
  for (const r of resources) {
    const key = remoteKey(r.href, basePath);
    if (!key) continue;
    map.set(key, {
      etag: r.etag,
      mtime: parseHttpDate(r.lastModified),
      collection: r.collection,
    });
  }
  return map;
}

function fileChangedSinceSync(meta: DatasetMeta, path: string, sha256: string): boolean {
  const entry = meta.files.find((f) => f.path === path);
  if (!entry) return true;
  if (entry.sha256 !== sha256) return true;
  const syncedAt = parseHttpDate(meta.sync.lastSyncedAt);
  const fileAt = parseHttpDate(entry.lastModified);
  return syncedAt > 0 && fileAt > syncedAt;
}

export async function runWebDavSync(
  root: FileSystemDirectoryHandle,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const logs: SyncLogLine[] = [];
  const blockedLocIds = new Set<string>();
  const localScans = await scanAllDatasets(root);
  const remote = await listRemoteTree();

  const tasks: {
    kind: "put" | "get" | "skip";
    locId: string;
    folderName: string;
    path: string;
    reason?: string;
  }[] = [];

  for (const scan of localScans) {
    const prefix = `${scan.folderName}/`;
  const remoteHasFolder =
      remote.has(scan.folderName) ||
      remote.has(`${scan.folderName}/`) ||
      remote.has(scan.locId) ||
      remote.has(`${scan.locId}/`);
    if (!remoteHasFolder) {
      tasks.push({ kind: "put", locId: scan.locId, folderName: scan.folderName, path: `${prefix}`, reason: "mkcol" });
    }
    for (const file of scan.meta.files) {
      const rel = `${prefix}${file.path}`;
      const remoteFile = remote.get(rel);
      const localNew = !remoteFile;
      const localChanged = fileChangedSinceSync(scan.meta, file.path, file.sha256);
      if (localNew || localChanged) {
        if (remoteFile && localChanged && scan.meta.sync.lastSyncedAt) {
          const remoteNewer = remoteFile.mtime > parseHttpDate(scan.meta.sync.lastSyncedAt);
          if (remoteNewer) {
            tasks.push({
              kind: "skip",
              locId: scan.locId,
              folderName: scan.folderName,
              path: rel,
              reason: "conflict",
            });
            blockedLocIds.add(scan.locId);
            continue;
          }
        }
        tasks.push({ kind: "put", locId: scan.locId, folderName: scan.folderName, path: rel });
      }
    }
    const metaPath = `${prefix}${META_FILENAME}`;
    const localMetaChanged =
      parseHttpDate(scan.meta.lastModified) > parseHttpDate(scan.meta.sync.lastSyncedAt);
    if (localMetaChanged) {
      tasks.push({ kind: "put", locId: scan.locId, folderName: scan.folderName, path: metaPath });
    }
  }

  for (const [key, info] of remote) {
    if (info.collection) continue;
    if (key.endsWith(`/${META_FILENAME}`)) continue;
    const localHas =
      tasks.some((t) => t.path === key) ||
      localScans.some((s) => key.startsWith(`${s.folderName}/`) || key.startsWith(`${s.locId}/`));
    const existsLocally = localScans.some(
      (s) => s.meta.files.some((f) => key === `${s.folderName}/${f.path}` || key === `${s.locId}/${f.path}`),
    );
    if (!existsLocally && !localHas) {
      const top = key.split("/")[0] || "";
      const scan = localScans.find((s) => s.folderName === top || s.locId === top);
      tasks.push({
        kind: "get",
        locId: scan?.locId ?? top,
        folderName: scan?.folderName ?? top,
        path: key,
      });
    }
  }

  const work = tasks.filter((t) => t.kind !== "skip");
  const total = work.length;
  let current = 0;

  for (const scan of localScans) {
    const needsMkcol = tasks.some((t) => t.locId === scan.locId && t.reason === "mkcol");
    if (needsMkcol) {
      try {
        await mkcol(scan.folderName);
        logs.push({ level: "info", message: `Ordner angelegt: ${scan.folderName}` });
      } catch (e) {
        logs.push({ level: "warn", message: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  for (const task of work) {
    current += 1;
    onProgress?.({ phase: task.kind, current, total, fileName: task.path });
    try {
      if (task.kind === "put") {
        if (task.path.endsWith("/")) continue;
        const scan = localScans.find((s) => s.locId === task.locId);
        if (!scan) continue;
        if (task.path.endsWith(META_FILENAME)) {
          const blob = new Blob([JSON.stringify(scan.meta, null, 2)], { type: "application/json" });
          await putBlob(task.path, blob);
        } else {
          const rel = task.path.slice(task.folderName.length + 1);
          const file = await readFileAtPath(scan.handle, rel);
          if (file) await putBlob(task.path, file);
        }
        logs.push({ level: "info", message: `Hochgeladen: ${task.path}` });
      } else if (task.kind === "get") {
        const blob = await getBlob(task.path);
        const rel = task.path.slice(task.folderName.length + 1);
        await writeFileAtPath(root, `${task.folderName}/${rel}`, blob);
        logs.push({ level: "info", message: `Heruntergeladen: ${task.path}` });
      }
    } catch (e) {
      logs.push({ level: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  for (const task of tasks) {
    if (task.kind === "skip") {
      logs.push({ level: "warn", message: `Übersprungen (Konflikt, Erweiterung geplant): ${task.path}` });
    }
  }

  const refreshed = await scanAllDatasets(root);
  const now = new Date().toISOString();
  for (const scan of refreshed) {
    if (blockedLocIds.has(scan.locId)) continue;
    scan.meta.sync.lastSyncedAt = now;
    await writeMetaToFolder(scan.handle, scan.meta);
  }

  return {
    ok: !logs.some((l) => l.level === "error"),
    logs,
    blockedLocIds: [...blockedLocIds],
  };
}

export function pendingLocalChanges(scans: DatasetScan[]): number {
  return scans.filter((s) => {
    const synced = parseHttpDate(s.meta.sync.lastSyncedAt);
    const mod = parseHttpDate(s.meta.lastModified);
    return mod > synced;
  }).length;
}