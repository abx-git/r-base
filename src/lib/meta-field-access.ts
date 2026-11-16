import type { DatasetMeta } from "./meta-schema";
import type { FieldDataType, SchemaFieldDef } from "./dataset-schema-types";

import { normalizeDatasetTags } from "./dataset-tags";

const CORE_KEYS = new Set(["locId", "bezeichnung", "kategorie", "notes", "tags"]);

export function getMetaFieldValue(meta: DatasetMeta, fieldKey: string): unknown {
  switch (fieldKey) {
    case "locId":
      return meta.locId;
    case "bezeichnung":
      return meta.bezeichnung;
    case "kategorie":
      return meta.kategorie;
    case "notes":
      return meta.notes;
    case "tags":
      return meta.tags ?? [];
    default:
      return meta.data?.[fieldKey];
  }
}

export function setMetaFieldValue(meta: DatasetMeta, fieldKey: string, value: unknown): void {
  if (fieldKey === "locId") return;
  if (fieldKey === "bezeichnung" && typeof value === "string") {
    meta.bezeichnung = value;
    return;
  }
  if (fieldKey === "kategorie" && typeof value === "string") {
    meta.kategorie = value;
    return;
  }
  if (fieldKey === "notes" && typeof value === "string") {
    meta.notes = value;
    return;
  }
  if (fieldKey === "tags") {
    meta.tags = Array.isArray(value) ? normalizeDatasetTags(value) : normalizeDatasetTags(String(value ?? ""));
    return;
  }
  if (!CORE_KEYS.has(fieldKey)) {
    if (!meta.data) meta.data = {};
    if (value === null || value === undefined || value === "") {
      if (meta.data) delete meta.data[fieldKey];
      if (meta.data && !Object.keys(meta.data).length) delete meta.data;
    } else {
      if (!meta.data) meta.data = {};
      meta.data[fieldKey] = value;
    }
  }
}

export function serializeFieldInput(dataType: FieldDataType, raw: string, checked?: boolean): unknown {
  switch (dataType) {
    case "number": {
      const t = raw.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : raw;
    }
    case "boolean":
      return Boolean(checked);
    case "tags":
      return raw
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
    case "date":
      return raw.trim() ? (raw.includes("T") ? raw : `${raw}T12:00:00.000Z`) : null;
    default:
      return raw;
  }
}

export function formatFieldForInput(dataType: FieldDataType, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (dataType === "tags" && Array.isArray(value)) return value.map(String).join(", ");
  if (dataType === "boolean") return value ? "1" : "";
  if (dataType === "date" && typeof value === "string") {
    const d = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : value;
  }
  return String(value);
}

export function fieldDefByKey(fields: SchemaFieldDef[], key: string): SchemaFieldDef | undefined {
  return fields.find((f) => f.key === key);
}