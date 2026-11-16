/**
 * Datensatz-Identität = Lox-ID (ET2-Karten), Feldname im JSON weiterhin `locId`.
 */

import { DELETED_DATASET_DIR } from "./dataset-trash";
import { listChildNames, readTextFromFolder } from "./workspace";
import { META_FILENAME } from "./meta-schema";
import { getLoxIdPrefix } from "./id-config";
import { defaultLoxIdService, isLoxId } from "./lox-id";

export { isLoxId };

/** @deprecated Alias — meint Lox-ID */
export const isLoxTaskId = isLoxId;

export function parseLocIdToken(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const canonical = defaultLoxIdService.canonicalId(t);
  if (canonical) return canonical;
  const normalized = defaultLoxIdService.normalizeId(t);
  if (defaultLoxIdService.validateId(normalized)) return normalized;
  return t;
}

export function formatLocIdDisplay(locId: string): string {
  const key = locId.trim();
  if (isLoxId(key)) {
    return defaultLoxIdService.canonicalId(key) ?? defaultLoxIdService.normalizeId(key);
  }
  return key;
}

/** Ordnername auf Platte = kanonische Lox-ID (ggf. mit Prefix). */
export function folderNameForLocId(locId: string): string {
  return formatLocIdDisplay(locId);
}

export function locIdsEqual(a: string, b: string): boolean {
  return parseLocIdToken(a).toUpperCase() === parseLocIdToken(b).toUpperCase();
}

async function collectTakenInParent(
  parent: FileSystemDirectoryHandle,
  taken: Set<string>,
  skipNames: Set<string>,
): Promise<void> {
  const children = await listChildNames(parent);
  for (const child of children) {
    if (child.kind !== "directory" || skipNames.has(child.name)) continue;
    taken.add(child.name.toUpperCase());
    const fromFolder = parseLocIdToken(child.name);
    if (fromFolder) taken.add(fromFolder.toUpperCase());
    try {
      const folder = await parent.getDirectoryHandle(child.name);
      const metaText = await readTextFromFolder(folder, META_FILENAME);
      if (!metaText) continue;
      const raw = JSON.parse(metaText) as Record<string, unknown>;
      const id = parseLocIdToken(String(raw.locId ?? raw.id ?? raw.uuid ?? ""));
      if (id) taken.add(id.toUpperCase());
    } catch {
      /* ignore */
    }
  }
}

async function collectTakenIds(root: FileSystemDirectoryHandle): Promise<Set<string>> {
  const taken = new Set<string>();
  await collectTakenInParent(root, taken, new Set([DELETED_DATASET_DIR]));
  try {
    const trash = await root.getDirectoryHandle(DELETED_DATASET_DIR);
    await collectTakenInParent(trash, taken, new Set());
  } catch {
    /* kein Papierkorb */
  }
  return taken;
}

export function parseUserLocIdInput(
  raw: string,
  requirePrefix = true,
  prefixOverride?: string,
): string | null {
  const parsed = parseLocIdToken(raw);
  if (!isLoxId(parsed)) return null;
  const canonical = defaultLoxIdService.canonicalId(parsed) ?? defaultLoxIdService.normalizeId(parsed);
  if (!defaultLoxIdService.validateId(canonical)) return null;
  if (requirePrefix) {
    const prefix = (prefixOverride ?? getLoxIdPrefix()).toUpperCase();
    if (!canonical.toUpperCase().startsWith(`${prefix}-`)) return null;
  }
  return canonical;
}

export async function allocateNextLocId(root: FileSystemDirectoryHandle): Promise<string> {
  const taken = await collectTakenIds(root);
  const lox = defaultLoxIdService;
  const prefix = getLoxIdPrefix();
  for (let attempt = 0; attempt < 512; attempt++) {
    const id = lox.generateId(prefix);
    const folder = folderNameForLocId(id);
    if (!taken.has(id.toUpperCase()) && !taken.has(folder.toUpperCase())) return id;
  }
  throw new Error("Keine freie ID gefunden.");
}