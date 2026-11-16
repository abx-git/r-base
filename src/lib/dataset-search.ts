import type { DatasetMeta } from "./meta-schema";
import type { DatasetSchemaDefinition } from "./dataset-schema-types";
import type { DatasetScan } from "./fs-local";
import { displayLocId } from "./meta-schema";
import { getMetaFieldValue } from "./meta-field-access";
import { isHiddenFieldsMetaKey } from "./meta-hidden-fields";

function valueToSearchFragment(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "ja" : "nein";
  if (Array.isArray(value)) return value.map((item) => valueToSearchFragment(item)).join(" ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value).trim();
}

function collectSearchFieldKeys(meta: DatasetMeta, schema?: DatasetSchemaDefinition): string[] {
  const keys = new Set<string>(["locId", "bezeichnung", "kategorie", "notes"]);
  if (schema) {
    for (const f of schema.fields) {
      if (f.key === "tags") continue;
      keys.add(f.key);
    }
  }
  if (meta.data) {
    for (const k of Object.keys(meta.data)) {
      if (isHiddenFieldsMetaKey(k)) continue;
      keys.add(k);
    }
  }
  return [...keys];
}

/** Kleinschreibung, ohne Tags — für Teiltextsuche. */
export function datasetSearchHaystack(meta: DatasetMeta, schema?: DatasetSchemaDefinition): string {
  const parts: string[] = [meta.locId, displayLocId(meta.locId)];
  for (const key of collectSearchFieldKeys(meta, schema)) {
    if (key === "tags") continue;
    parts.push(valueToSearchFragment(getMetaFieldValue(meta, key)));
  }
  for (const file of meta.files ?? []) {
    parts.push(file.path);
    if (file.meta?.title) parts.push(file.meta.title);
    if (file.meta?.description) parts.push(file.meta.description);
    if (file.meta?.capturedAt) parts.push(String(file.meta.capturedAt));
  }
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function metaByLocId(scans: DatasetScan[]): Map<string, DatasetMeta> {
  return new Map(scans.map((s) => [s.meta.locId, s.meta]));
}