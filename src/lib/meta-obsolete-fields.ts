import type { DatasetSchemaDefinition } from "./dataset-schema-types";
import type { DatasetMeta } from "./meta-schema";
import { getMetaFieldValue } from "./meta-field-access";

const CORE_KEYS = ["locId", "bezeichnung", "kategorie", "notes", "tags"] as const;

export type ObsoleteFieldEntry = {
  key: string;
  value: unknown;
};

export function schemaActiveFieldKeys(schema: DatasetSchemaDefinition): Set<string> {
  return new Set(schema.fields.map((f) => f.key));
}

export function collectStoredFieldKeys(meta: DatasetMeta): string[] {
  const keys = new Set<string>(CORE_KEYS);
  if (meta.data) {
    for (const k of Object.keys(meta.data)) keys.add(k);
  }
  return [...keys];
}

function hasStoredValue(meta: DatasetMeta, key: string, value: unknown): boolean {
  if (value !== undefined && value !== null && value !== "") return true;
  if (Array.isArray(value) && value.length > 0) return true;
  if (meta.data && Object.prototype.hasOwnProperty.call(meta.data, key)) return true;
  if (key === "bezeichnung" || key === "kategorie" || key === "notes" || key === "tags") {
    return true;
  }
  return false;
}

export function listObsoleteFields(meta: DatasetMeta, schema: DatasetSchemaDefinition): ObsoleteFieldEntry[] {
  const active = schemaActiveFieldKeys(schema);
  const out: ObsoleteFieldEntry[] = [];
  for (const key of collectStoredFieldKeys(meta)) {
    if (key === "locId" || active.has(key)) continue;
    const value = getMetaFieldValue(meta, key);
    if (!hasStoredValue(meta, key, value)) continue;
    out.push({ key, value });
  }
  out.sort((a, b) => a.key.localeCompare(b.key, "de"));
  return out;
}

export function formatObsoleteValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}