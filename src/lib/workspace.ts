import { formatDirectoryPickerError } from "./errors";

const IDB_NAME = "r-base-workspace";
const IDB_STORE = "handles";
const IDB_KEY = "root-directory";

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) return null;
  try {
    return await window.showDirectoryPicker({ mode: "readwrite", id: "r-base-root" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw new Error(formatDirectoryPickerError(err));
  }
}

export async function queryWriteAccess(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (!handle.queryPermission) return true;
  try {
    const state = await handle.queryPermission({ mode: "readwrite" });
    if (state === "granted") return true;
    if (handle.requestPermission) {
      return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
    }
  } catch {
    return false;
  }
  return false;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function persistRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openIdb();
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}

function splitPath(relativePath: string): { dir: string; name: string } {
  const norm = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = norm.split("/");
  const name = parts.pop()!;
  return { dir: parts.join("/"), name };
}

export async function getDirectoryAtPath(
  root: FileSystemDirectoryHandle,
  relativeDir: string,
  opts?: { create?: boolean },
): Promise<FileSystemDirectoryHandle> {
  const create = opts?.create ?? false;
  const parts = relativeDir.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".");
  if (parts.length === 0) return root;
  let cur = root;
  for (const part of parts) {
    cur = await cur.getDirectoryHandle(part, { create });
  }
  return cur;
}

export async function writeTextInFolder(
  folder: FileSystemDirectoryHandle,
  name: string,
  content: string,
): Promise<void> {
  const handle = await folder.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function readTextFromFolder(folder: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    const file = await (await folder.getFileHandle(name)).getFile();
    return await file.text();
  } catch {
    return null;
  }
}

export async function writeFileInFolder(
  folder: FileSystemDirectoryHandle,
  name: string,
  data: Blob | File | string,
): Promise<void> {
  const handle = await folder.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function listChildNames(folder: FileSystemDirectoryHandle): Promise<{ name: string; kind: FileSystemHandle["kind"] }[]> {
  const out: { name: string; kind: FileSystemHandle["kind"] }[] = [];
  for await (const [name, handle] of folder.entries()) {
    out.push({ name, kind: handle.kind });
  }
  return out;
}

export async function listRelativeFiles(
  folder: FileSystemDirectoryHandle,
  prefix = "",
): Promise<string[]> {
  const paths: string[] = [];
  for await (const [name, handle] of folder.entries()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      paths.push(...(await listRelativeFiles(handle as FileSystemDirectoryHandle, rel)));
    } else {
      paths.push(rel);
    }
  }
  return paths;
}

export async function readFileAtPath(root: FileSystemDirectoryHandle, relativePath: string): Promise<File | null> {
  try {
    const { dir, name } = splitPath(relativePath);
    const folder = dir ? await getDirectoryAtPath(root, dir) : root;
    return await (await folder.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

export async function writeFileAtPath(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  data: Blob | File | string,
): Promise<void> {
  const { dir, name } = splitPath(relativePath);
  const folder = dir ? await getDirectoryAtPath(root, dir, { create: true }) : root;
  await writeFileInFolder(folder, name, data);
}

export async function removeFileAtPath(root: FileSystemDirectoryHandle, relativePath: string): Promise<void> {
  const { dir, name } = splitPath(relativePath);
  const folder = dir ? await getDirectoryAtPath(root, dir) : root;
  await folder.removeEntry(name);
}

async function copyDirectoryContents(
  source: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, handle] of source.entries()) {
    if (handle.kind === "directory") {
      const sub = await dest.getDirectoryHandle(name, { create: true });
      await copyDirectoryContents(handle as FileSystemDirectoryHandle, sub);
    } else {
      const file = await (handle as FileSystemFileHandle).getFile();
      await writeFileInFolder(dest, name, file);
    }
  }
}

export async function moveDatasetFolder(
  root: FileSystemDirectoryHandle,
  fromFolderName: string,
  toFolderName: string,
): Promise<FileSystemDirectoryHandle> {
  if (fromFolderName === toFolderName) {
    return root.getDirectoryHandle(fromFolderName);
  }
  const source = await root.getDirectoryHandle(fromFolderName);
  const dest = await root.getDirectoryHandle(toFolderName, { create: true });
  await copyDirectoryContents(source, dest);
  await root.removeEntry(fromFolderName, { recursive: true });
  return dest;
}