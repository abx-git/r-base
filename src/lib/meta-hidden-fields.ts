import type { DatasetMeta } from "./meta-schema";
import type { DatasetSchemaDefinition, SchemaFieldDef } from "./dataset-schema-types";

/** Reservierter Schlüssel in meta.data — keine Nutzdaten. */
export const HIDDEN_FIELDS_DATA_KEY = "__rBaseHiddenFields";

export function isHiddenFieldsMetaKey(key: string): boolean {
  return key === HIDDEN_FIELDS_DATA_KEY;
}

export function isOptionalSchemaField(def: SchemaFieldDef): boolean {
  if (def.dataType === "locId") return false;
  if (def.constraints?.required) return false;
  return true;
}

function readRawHidden(meta: DatasetMeta): string[] {
  const raw = meta.data?.[HIDDEN_FIELDS_DATA_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export function normalizeHiddenFieldKeys(meta: DatasetMeta, schema: DatasetSchemaDefinition): string[] {
  const optional = new Set(
    schema.fields.filter(isOptionalSchemaField).map((f) => f.key),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of readRawHidden(meta)) {
    if (!optional.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function getHiddenFieldKeySet(meta: DatasetMeta, schema: DatasetSchemaDefinition): Set<string> {
  return new Set(normalizeHiddenFieldKeys(meta, schema));
}

export function setSchemaFieldHidden(
  meta: DatasetMeta,
  schema: DatasetSchemaDefinition,
  fieldKey: string,
  hidden: boolean,
): void {
  const def = schema.fields.find((f) => f.key === fieldKey);
  if (!def || !isOptionalSchemaField(def)) return;
  let keys = normalizeHiddenFieldKeys(meta, schema);
  const set = new Set(keys);
  if (hidden) set.add(fieldKey);
  else set.delete(fieldKey);
  keys = [...set];
  if (!meta.data) meta.data = {};
  if (keys.length) meta.data[HIDDEN_FIELDS_DATA_KEY] = keys;
  else delete meta.data[HIDDEN_FIELDS_DATA_KEY];
  if (meta.data && !Object.keys(meta.data).length) delete meta.data;
}

export function orderedSchemaFieldKeys(schema: DatasetSchemaDefinition): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of schema.layout) {
    for (const c of row.containers) {
      for (const k of c.fieldKeys ?? []) {
        if (!seen.has(k)) {
          seen.add(k);
          out.push(k);
        }
      }
    }
  }
  for (const f of schema.fields) {
    if (!seen.has(f.key)) {
      seen.add(f.key);
      out.push(f.key);
    }
  }
  return out;
}