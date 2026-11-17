import type { DatasetScan } from "./fs-local";
import type { DatasetSchemaDefinition, SchemaFieldDef } from "./dataset-schema-types";
import { resolveSchemaForDataset } from "./dataset-schema-store";
import { isExportFieldVisibleInSchema } from "./export-field-visibility";
import { fieldDefByKey, formatFieldForInput, getMetaFieldValue } from "./meta-field-access";
import { displayLocId } from "./meta-schema";

export type SchemaExportRenderOptions = {
  omitEmptyOptional?: boolean;
};

export function scansForSchemaExport(
  scans: DatasetScan[],
  schema: DatasetSchemaDefinition,
): DatasetScan[] {
  return scans
    .filter((s) => resolveSchemaForDataset(s.meta).id === schema.id)
    .sort((a, b) => a.meta.locId.localeCompare(b.meta.locId, "de", { numeric: true }));
}

export function isEmptyExportValue(text: string): boolean {
  const t = text.trim();
  return !t || t === "—";
}

export function formatExportFieldValue(
  def: SchemaFieldDef | undefined,
  meta: DatasetScan["meta"],
  key: string,
): string {
  if (!def) {
    const raw = getMetaFieldValue(meta, key);
    return raw === null || raw === undefined || raw === "" ? "—" : String(raw);
  }
  const v = getMetaFieldValue(meta, def.key);
  if (def.key === "locId") return displayLocId(String(v ?? meta.locId));
  if (v === null || v === undefined || v === "") return "—";
  if (def.dataType === "boolean") return v ? "Ja" : "Nein";
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (def.dataType === "date" && typeof v === "string") {
    const d = v.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      try {
        return new Date(`${d}T12:00:00`).toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      } catch {
        return d;
      }
    }
  }
  return formatFieldForInput(def.dataType, v) || "—";
}

export function filterExportFieldKeys(
  schema: DatasetSchemaDefinition,
  meta: DatasetScan["meta"],
  keys: string[],
  omitEmpty: boolean,
): string[] {
  return keys.filter((key) => {
    if (!isExportFieldVisibleInSchema(schema, key)) return false;
    if (!omitEmpty) return true;
    const def = fieldDefByKey(schema.fields, key);
    const text = formatExportFieldValue(def, meta, key);
    if (!def) return !isEmptyExportValue(text);
    if (def.constraints?.required || def.key === "locId" || def.key === "bezeichnung") return true;
    return !isEmptyExportValue(text);
  });
}

export function slugForExportPath(value: string): string {
  const s = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return s || "dataset";
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}