import type { DatasetScan } from "./fs-local";
import type { DatasetMeta } from "./meta-schema";
import {
  createDataset,
  scanAllDatasets,
  writeMetaToFolder,
} from "./fs-local";
import { getMetaFieldValue, setMetaFieldValue } from "./meta-field-access";
import { normalizeDatasetTags } from "./dataset-tags";
import { parseJuraCsvText } from "./csv-parse";
import {
  JURA_CSV_COLUMN_KEYS,
  JURA_CSV_MATCH_KEY,
  JURA_CSV_SOURCE_ID,
  mergeJuraFieldsIntoBuiltinSchema,
  type JuraCsvColumnKey,
} from "./jura-csv-schema";
import { upsertSchemaDefinition, getSchemaById, getDefaultSchema, resolveSchemaForDataset } from "./dataset-schema-store";
import { setSchemaFieldHidden } from "./meta-hidden-fields";
import { BUILTIN_SCHEMA_ID, DEFAULT_RUD_SCHEMA } from "./dataset-schema-defaults";
import { getDirectoryAtPath, writeFileInFolder } from "./workspace";

const IMPORTS_DIR = "_imports";

export type JuraCsvImportOptions = {
  /** Wird allen in diesem Lauf neu angelegten Datensätzen hinzugefügt (ohne Duplikate). */
  importTag?: string;
};

export type JuraCsvImportResult = {
  created: number;
  updated: number;
  skipped: number;
  storedPath: string;
  errors: string[];
};

function rowToRecord(cells: string[]): Partial<Record<JuraCsvColumnKey, string>> {
  const rec: Partial<Record<JuraCsvColumnKey, string>> = {};
  for (let i = 0; i < JURA_CSV_COLUMN_KEYS.length; i++) {
    const key = JURA_CSV_COLUMN_KEYS[i]!;
    const v = (cells[i] ?? "").trim();
    if (v) rec[key] = v;
  }
  return rec;
}

function findScanByEigeneNr(scans: DatasetScan[], eigeneNr: string): DatasetScan | undefined {
  const key = eigeneNr.trim().toLowerCase();
  if (!key) return undefined;
  return scans.find((s) => {
    const v = getMetaFieldValue(s.meta, JURA_CSV_MATCH_KEY);
    return typeof v === "string" && v.trim().toLowerCase() === key;
  });
}

function applyImportTag(meta: DatasetMeta, importTag: string | undefined): void {
  const tag = importTag?.trim();
  if (!tag) return;
  meta.tags = normalizeDatasetTags([...(meta.tags ?? []), tag]);
}

function hideImportedCsvFieldsInDetail(meta: DatasetMeta): void {
  const schema = resolveSchemaForDataset(meta);
  for (const key of JURA_CSV_COLUMN_KEYS) {
    setSchemaFieldHidden(meta, schema, key, true);
  }
}

function applyJuraRowToMeta(scan: DatasetScan, row: Partial<Record<JuraCsvColumnKey, string>>): void {
  const meta = scan.meta;
  for (const colKey of JURA_CSV_COLUMN_KEYS) {
    const val = row[colKey];
    if (val !== undefined) setMetaFieldValue(meta, colKey, val);
  }
  if (row.aktueller_name) meta.bezeichnung = row.aktueller_name.trim();
  if (row.sammlung) meta.kategorie = row.sammlung.trim();
  if (!meta.schemaKey) meta.schemaKey = getDefaultSchema().id;
  if (!meta.data) meta.data = {};
  meta.data[JURA_CSV_SOURCE_ID] = storedPathMarker();
}

function storedPathMarker(): string {
  return new Date().toISOString();
}

export function ensureJuraCsvSchemaInStore(): void {
  const current = getSchemaById(BUILTIN_SCHEMA_ID) ?? structuredClone(DEFAULT_RUD_SCHEMA);
  const merged = mergeJuraFieldsIntoBuiltinSchema(current);
  upsertSchemaDefinition(merged);
}

async function storeCsvInWorkspace(root: FileSystemDirectoryHandle, file: File): Promise<string> {
  const imports = await getDirectoryAtPath(root, IMPORTS_DIR, { create: true });
  const safeName = file.name.replace(/[^\wäöüÄÖÜß.\- ]+/g, "_");
  await writeFileInFolder(imports, safeName, file);
  return `${IMPORTS_DIR}/${safeName}`;
}

export async function importJuraCsvFile(
  root: FileSystemDirectoryHandle,
  file: File,
  options: JuraCsvImportOptions = {},
): Promise<JuraCsvImportResult> {
  const importTag = options.importTag?.trim() || undefined;
  ensureJuraCsvSchemaInStore();
  const text = await file.text();
  const { rows } = parseJuraCsvText(text);
  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  let scans = await scanAllDatasets(root);
  const storedPath = await storeCsvInWorkspace(root, file);

  for (const cells of rows) {
    const row = rowToRecord(cells);
    const eigeneNr = row[JURA_CSV_MATCH_KEY]?.trim();
    if (!eigeneNr) {
      skipped++;
      continue;
    }
    const existing = findScanByEigeneNr(scans, eigeneNr);
    if (existing) {
      applyJuraRowToMeta(existing, row);
      try {
        await writeMetaToFolder(existing.handle, existing.meta);
        updated++;
      } catch (e) {
        errors.push(`${eigeneNr}: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }
    try {
      const scan = await createDataset(root, {
        bezeichnung: row.aktueller_name?.trim() || eigeneNr,
        kategorie: row.sammlung?.trim() || "",
      });
      applyJuraRowToMeta(scan, row);
      hideImportedCsvFieldsInDetail(scan.meta);
      applyImportTag(scan.meta, importTag);
      await writeMetaToFolder(scan.handle, scan.meta);
      scans = [...scans, scan];
      created++;
    } catch (e) {
      errors.push(`${eigeneNr}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { created, updated, skipped, storedPath, errors };
}