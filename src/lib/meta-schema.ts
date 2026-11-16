import { normalizeDatasetTags } from "./dataset-tags";
import { getDefaultSchemaId } from "./dataset-schema-store";
import { formatLocIdDisplay, isLoxId, parseLocIdToken } from "./loc-id";

export const META_SCHEMA_VERSION = 1 as const;
export const META_FILENAME = "meta.json";
/** Nur UI-Platzhalter, nicht in meta.json speichern (legacy-Werte werden migriert). */
export const DEFAULT_BEZEICHNUNG_HINT = "Neuer Datensatz";

export type FileUserMeta = {
  title?: string;
  description?: string;
  /** ISO-Datum/-Zeit der Aufnahme oder des Dokumentdatums */
  capturedAt?: string | null;
  tags?: string[];
};

export type MetaFileEntry = {
  path: string;
  sha256: string;
  size: number;
  mime: string;
  lastModified: string;
  meta?: FileUserMeta;
};

export function emptyFileUserMeta(): FileUserMeta {
  return {};
}

export function normalizeFileUserMeta(raw: unknown): FileUserMeta | undefined {
  if (!isRecord(raw)) return undefined;
  const title = asString(raw.title).trim();
  const description = asString(raw.description).trim();
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean)
    : [];
  let capturedAt: string | null | undefined;
  if (raw.capturedAt === null) capturedAt = null;
  else if (typeof raw.capturedAt === "string" && raw.capturedAt.trim()) capturedAt = raw.capturedAt.trim();
  const has =
    Boolean(title) || Boolean(description) || Boolean(capturedAt) || tags.length > 0 || raw.capturedAt === null;
  if (!has) return undefined;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(capturedAt !== undefined ? { capturedAt } : {}),
    ...(tags.length ? { tags } : {}),
  };
}

export function mergeFileUserMeta(
  base: FileUserMeta | undefined,
  patch: Partial<FileUserMeta>,
): FileUserMeta | undefined {
  const next: FileUserMeta = { ...(base ?? {}) };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t) next.title = t;
    else delete next.title;
  }
  if (patch.description !== undefined) {
    const d = patch.description.trim();
    if (d) next.description = d;
    else delete next.description;
  }
  if (patch.capturedAt !== undefined) {
    if (patch.capturedAt === null || patch.capturedAt === "") delete next.capturedAt;
    else next.capturedAt = patch.capturedAt;
  }
  if (patch.tags !== undefined) {
    const tags = patch.tags.map((t) => t.trim()).filter(Boolean);
    if (tags.length) next.tags = tags;
    else delete next.tags;
  }
  return normalizeFileUserMeta(next);
}

export type MetaSyncBlock = {
  lastSyncedAt: string | null;
  remoteEtag: string | null;
};

export type DatasetMeta = {
  schemaVersion: typeof META_SCHEMA_VERSION;
  locId: string;
  /** Schema-/Lox-Prefix (z. B. RUD) — für spätere Schema-Varianten */
  schemaKey?: string;
  bezeichnung: string;
  kategorie: string;
  lastModified: string;
  notes: string;
  tags: string[];
  files: MetaFileEntry[];
  sync: MetaSyncBlock;
  /** Benutzerfelder & archivierte Schlüssel (nicht im aktuellen Schema) */
  data?: Record<string, unknown>;
};

export type SyncStatusKind = "unknown" | "synced" | "local-changes" | "remote-only" | "blocked";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function normalizeFileEntry(raw: unknown): MetaFileEntry | null {
  if (!isRecord(raw)) return null;
  const path = asString(raw.path).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path) return null;
  const meta = normalizeFileUserMeta(raw.meta);
  return {
    path,
    sha256: asString(raw.sha256),
    size: typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0,
    mime: asString(raw.mime, "application/octet-stream"),
    lastModified: asString(raw.lastModified, new Date().toISOString()),
    ...(meta ? { meta } : {}),
  };
}

function extractLegacyLocId(raw: Record<string, unknown>, folderName: string): string {
  const fromMeta = parseLocIdToken(asString(raw.locId));
  if (fromMeta && isLoxId(fromMeta)) return fromMeta;
  const fromFolder = parseLocIdToken(folderName);
  if (fromFolder && fromFolder !== META_FILENAME && isLoxId(fromFolder)) return fromFolder;
  if (fromMeta) return fromMeta;
  const legacyId = parseLocIdToken(asString(raw.id));
  if (legacyId) return legacyId;
  const uuid = asString(raw.uuid).trim();
  if (uuid) return uuid;
  if (fromFolder) return fromFolder;
  return "";
}

/** Bekannte meta.json-Felder — alles andere wird in `data` aufbewahrt */
export const META_SYSTEM_KEYS = new Set([
  "schemaVersion",
  "locId",
  "schemaKey",
  "bezeichnung",
  "kategorie",
  "lastModified",
  "notes",
  "tags",
  "files",
  "sync",
  "data",
  "id",
  "uuid",
]);

function isStorableDataValue(v: unknown): boolean {
  if (v === null) return true;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(v)) return true;
  if (t === "object") return true;
  return false;
}

function mergeUnknownTopLevelIntoData(
  src: Record<string, unknown>,
  data: NonNullable<DatasetMeta["data"]>,
): NonNullable<DatasetMeta["data"]> {
  for (const [k, v] of Object.entries(src)) {
    if (META_SYSTEM_KEYS.has(k)) continue;
    if (Object.prototype.hasOwnProperty.call(data, k)) continue;
    if (isStorableDataValue(v)) data[k] = v;
  }
  return data;
}

function normalizeDataBlock(raw: unknown, src?: Record<string, unknown>): DatasetMeta["data"] {
  const out: NonNullable<DatasetMeta["data"]> = {};
  if (isRecord(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof k !== "string" || !k.trim()) continue;
      if (isStorableDataValue(v)) out[k] = v;
    }
  }
  if (src) mergeUnknownTopLevelIntoData(src, out);
  return Object.keys(out).length ? out : undefined;
}

export function createEmptyMeta(locId: string, partial?: Partial<Pick<DatasetMeta, "bezeichnung" | "kategorie">>): DatasetMeta {
  const now = new Date().toISOString();
  const schemaKey = getDefaultSchemaId();
  return {
    schemaVersion: META_SCHEMA_VERSION,
    locId,
    schemaKey,
    bezeichnung: partial?.bezeichnung?.trim() ?? "",
    kategorie: partial?.kategorie?.trim() || "",
    lastModified: now,
    notes: "",
    tags: [],
    files: [],
    sync: { lastSyncedAt: null, remoteEtag: null },
  };
}

export function normalizeMeta(raw: unknown, folderName = ""): DatasetMeta {
  const src = isRecord(raw) ? raw : {};
  let locId = extractLegacyLocId(src, folderName);
  if (!locId) locId = folderName.trim();
  const files: MetaFileEntry[] = [];
  if (Array.isArray(src.files)) {
    for (const item of src.files) {
      const entry = normalizeFileEntry(item);
      if (entry) files.push(entry);
    }
  }
  const syncRaw = isRecord(src.sync) ? src.sync : {};
  const schemaKey = asString(src.schemaKey) || undefined;
  const data = normalizeDataBlock(src.data, src);
  return {
    schemaVersion: META_SCHEMA_VERSION,
    locId,
    schemaKey: schemaKey || undefined,
    bezeichnung: asString(src.bezeichnung, "Ohne Bezeichnung"),
    kategorie: asString(src.kategorie),
    lastModified: asString(src.lastModified, new Date().toISOString()),
    notes: asString(src.notes),
    tags: normalizeDatasetTags(src.tags),
    ...(data ? { data } : {}),
    files,
    sync: {
      lastSyncedAt: asString(syncRaw.lastSyncedAt) || null,
      remoteEtag: asString(syncRaw.remoteEtag) || null,
    },
  };
}

export function metaToJson(doc: DatasetMeta): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Anzeige in UI / Excel (numerisch → `#577`). */
export function displayLocId(locId: string): string {
  return formatLocIdDisplay(locId);
}