import { getLoxIdPrefixForMeta } from "./id-config";
import {
  allocateNextLocId,
  folderNameForLocId,
  isLoxId,
  locIdsEqual,
  parseLocIdToken,
  parseUserLocIdInput,
} from "./loc-id";
import { sha256File } from "./hash";
import {
  type DatasetMeta,
  type FileUserMeta,
  META_FILENAME,
  createEmptyMeta,
  mergeFileUserMeta,
  metaToJson,
  normalizeMeta,
} from "./meta-schema";
import { DELETED_DATASET_DIR } from "./dataset-trash";
import {
  getDirectoryAtPath,
  listChildNames,
  listRelativeFiles,
  moveDatasetFolder,
  readTextFromFolder,
  relocateDirectory,
  removeFileAtPath,
  writeFileInFolder,
  writeTextInFolder,
} from "./workspace";

export { DELETED_DATASET_DIR };

const SKIP_SCAN = new Set([META_FILENAME, ".DS_Store"]);

export type DatasetScan = {
  locId: string;
  folderName: string;
  handle: FileSystemDirectoryHandle;
  meta: DatasetMeta;
};

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (/\.(jpe?g|png|gif|webp|svg)$/.test(lower)) return `image/${lower.split(".").pop()}`;
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

async function buildFilesIndex(
  folder: FileSystemDirectoryHandle,
  previous: DatasetMeta["files"] = [],
): Promise<DatasetMeta["files"]> {
  const prevByPath = new Map(previous.map((f) => [f.path, f]));
  const relPaths = (await listRelativeFiles(folder)).filter(
    (p) => !p.endsWith(`/${META_FILENAME}`) && p !== META_FILENAME,
  );
  const files: DatasetMeta["files"] = [];
  for (const path of relPaths) {
    const file = await readFileAtPath(folder, path);
    if (!file) continue;
    const prev = prevByPath.get(path);
    const entry: DatasetMeta["files"][number] = {
      path,
      sha256: await sha256File(file),
      size: file.size,
      mime: file.type || guessMime(path),
      lastModified: new Date(file.lastModified).toISOString(),
    };
    if (prev?.meta) entry.meta = { ...prev.meta };
    files.push(entry);
  }
  return files;
}

async function readFileAtPath(folder: FileSystemDirectoryHandle, relativePath: string): Promise<File | null> {
  try {
    const parts = relativePath.split("/").filter(Boolean);
    let cur = folder;
    for (let i = 0; i < parts.length - 1; i++) {
      cur = await cur.getDirectoryHandle(parts[i]!);
    }
    const file = await (await cur.getFileHandle(parts[parts.length - 1]!)).getFile();
    return file;
  } catch {
    return null;
  }
}

export async function readMetaFromFolder(
  folder: FileSystemDirectoryHandle,
  folderName: string,
): Promise<DatasetMeta> {
  const text = await readTextFromFolder(folder, META_FILENAME);
  if (text) {
    try {
      const parsed = normalizeMeta(JSON.parse(text) as unknown, folderName);
      const folderKey = parseLocIdToken(folderName);
      if (isLoxId(folderKey) && !locIdsEqual(parsed.locId, folderKey)) {
        parsed.locId = folderKey;
      }
      return parsed;
    } catch {
      /* fall through */
    }
  }
  const meta = createEmptyMeta(folderName);
  await writeTextInFolder(folder, META_FILENAME, metaToJson(meta));
  return meta;
}

export async function writeMetaToFolder(folder: FileSystemDirectoryHandle, meta: DatasetMeta): Promise<void> {
  meta.lastModified = new Date().toISOString();
  await writeTextInFolder(folder, META_FILENAME, metaToJson(meta));
}

export async function scanAllDatasets(root: FileSystemDirectoryHandle): Promise<DatasetScan[]> {
  const children = await listChildNames(root);
  const datasets: DatasetScan[] = [];
  for (const child of children) {
    if (child.kind !== "directory" || SKIP_SCAN.has(child.name) || child.name === DELETED_DATASET_DIR) continue;
    const handle = await root.getDirectoryHandle(child.name);
    const meta = await readMetaFromFolder(handle, child.name);
    const folderKey = parseLocIdToken(child.name);
    if (isLoxId(folderKey) && !locIdsEqual(meta.locId, folderKey)) {
      meta.locId = folderKey;
      await writeMetaToFolder(handle, meta);
    }
    datasets.push({ locId: meta.locId, folderName: child.name, handle, meta });
  }
  return datasets;
}

export async function createDataset(
  root: FileSystemDirectoryHandle,
  partial: { bezeichnung?: string; kategorie?: string },
): Promise<DatasetScan> {
  const locId = await allocateNextLocId(root);
  const folderName = folderNameForLocId(locId);
  const folder = await root.getDirectoryHandle(folderName, { create: true });
  const meta = createEmptyMeta(locId, partial);
  await writeMetaToFolder(folder, meta);
  return { locId, folderName, handle: folder, meta };
}

export async function refreshMetaFiles(folder: FileSystemDirectoryHandle, meta: DatasetMeta): Promise<DatasetMeta> {
  meta.files = await buildFilesIndex(folder, meta.files);
  await writeMetaToFolder(folder, meta);
  return meta;
}

export async function updateFileUserMeta(
  folder: FileSystemDirectoryHandle,
  meta: DatasetMeta,
  relativePath: string,
  patch: Partial<FileUserMeta>,
): Promise<DatasetMeta> {
  const entry = meta.files.find((f) => f.path === relativePath);
  if (!entry) throw new Error("Datei nicht in meta.json");
  const merged = mergeFileUserMeta(entry.meta, patch);
  if (merged) entry.meta = merged;
  else delete entry.meta;
  await writeMetaToFolder(folder, meta);
  return meta;
}

export async function addFilesToDataset(
  folder: FileSystemDirectoryHandle,
  meta: DatasetMeta,
  files: File[],
  subDir?: "" | "B" | "D",
): Promise<DatasetMeta> {
  for (const file of files) {
    const baseName = file.name.trim().split(/[/\\]/).pop() || "datei";
    let target = folder;
    if (subDir) {
      target = await folder.getDirectoryHandle(subDir, { create: true });
    }
    await writeFileInFolder(target, baseName, file);
  }
  return refreshMetaFiles(folder, meta);
}

export async function getDatasetFolder(root: FileSystemDirectoryHandle, locId: string): Promise<FileSystemDirectoryHandle | null> {
  const folderName = folderNameForLocId(locId);
  try {
    return await root.getDirectoryHandle(folderName);
  } catch {
    try {
      return await getDirectoryAtPath(root, locId);
    } catch {
      return null;
    }
  }
}

export async function deleteFileFromDataset(
  folder: FileSystemDirectoryHandle,
  meta: DatasetMeta,
  relativePath: string,
): Promise<DatasetMeta> {
  await removeFileAtPath(folder, relativePath);
  return refreshMetaFiles(folder, meta);
}

export async function renameDatasetLocId(
  root: FileSystemDirectoryHandle,
  scan: DatasetScan,
  rawNewId: string,
): Promise<DatasetScan> {
  const prefix = getLoxIdPrefixForMeta(scan.meta);
  const newId = parseUserLocIdInput(rawNewId, true, prefix);
  if (!newId) throw new Error(`Ungültige ID. Erwartet: gültige Lox-ID mit Prefix ${prefix}.`);
  if (locIdsEqual(newId, scan.meta.locId)) return scan;
  const newFolder = folderNameForLocId(newId);
  const children = await listChildNames(root);
  if (children.some((c) => c.kind === "directory" && c.name === newFolder)) {
    throw new Error(`Ordner „${newFolder}“ existiert bereits.`);
  }
  const handle = await moveDatasetFolder(root, scan.folderName, newFolder);
  scan.meta.locId = newId;
  await writeMetaToFolder(handle, scan.meta);
  return { locId: newId, folderName: newFolder, handle, meta: scan.meta };
}

export function isImagePath(path: string): boolean {
  return /\.(jpe?g|png|gif|webp|svg)$/i.test(path);
}

export async function softDeleteDataset(
  root: FileSystemDirectoryHandle,
  scan: DatasetScan,
): Promise<{ locId: string; folderName: string }> {
  const trash = await root.getDirectoryHandle(DELETED_DATASET_DIR, { create: true });
  const trashChildren = await listChildNames(trash);
  let targetName = scan.folderName;
  if (trashChildren.some((c) => c.kind === "directory" && c.name === targetName)) {
    targetName = `${scan.folderName}__${Date.now()}`;
  }
  await relocateDirectory(root, trash, scan.folderName, targetName);
  return { locId: scan.meta.locId, folderName: targetName };
}

export async function restoreSoftDeletedDataset(
  root: FileSystemDirectoryHandle,
  folderNameInDeleted: string,
): Promise<DatasetScan> {
  const trash = await root.getDirectoryHandle(DELETED_DATASET_DIR);
  const active = await listChildNames(root);
  const liveName = folderNameInDeleted.replace(/__\d+$/, "");
  const restoreAs = active.some((c) => c.kind === "directory" && c.name === liveName)
    ? folderNameInDeleted
    : liveName;
  if (active.some((c) => c.kind === "directory" && c.name === restoreAs)) {
    throw new Error(`Ein aktiver Datensatz-Ordner „${restoreAs}“ existiert bereits.`);
  }
  const handle = await relocateDirectory(trash, root, folderNameInDeleted, restoreAs);
  const meta = await readMetaFromFolder(handle, restoreAs);
  return { locId: meta.locId, folderName: restoreAs, handle, meta };
}