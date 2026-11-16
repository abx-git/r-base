import type { DatasetMeta } from "./meta-schema";
import type { DatasetSchemaDefinition, SchemaFieldDef } from "./dataset-schema-types";

/** Reservierter Schlüssel in meta.data — keine Nutzdaten. */
export const HIDDEN_FIELDS_DATA_KEY = "__rBaseHiddenFields";
/** Felder, die trotz Schema-Standard ausgeblendet explizit eingeblendet werden. */
export const SHOWN_FIELDS_DATA_KEY = "__rBaseShownFields";

export function isHiddenFieldsMetaKey(key: string): boolean {
  return key === HIDDEN_FIELDS_DATA_KEY || key === SHOWN_FIELDS_DATA_KEY;
}

export function isOptionalSchemaField(def: SchemaFieldDef): boolean {
  if (def.dataType === "locId") return false;
  if (def.constraints?.required) return false;
  return true;
}

function readRawStringList(meta: DatasetMeta, dataKey: string): string[] {
  const raw = meta.data?.[dataKey];
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function readRawHidden(meta: DatasetMeta): string[] {
  return readRawStringList(meta, HIDDEN_FIELDS_DATA_KEY);
}

function readRawShown(meta: DatasetMeta): string[] {
  return readRawStringList(meta, SHOWN_FIELDS_DATA_KEY);
}

function normalizeKeyList(meta: DatasetMeta, schema: DatasetSchemaDefinition, raw: string[]): string[] {
  const optional = new Set(
    schema.fields.filter(isOptionalSchemaField).map((f) => f.key),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    if (!optional.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function normalizeHiddenFieldKeys(meta: DatasetMeta, schema: DatasetSchemaDefinition): string[] {
  return normalizeKeyList(meta, schema, readRawHidden(meta));
}

export function normalizeShownFieldKeys(meta: DatasetMeta, schema: DatasetSchemaDefinition): string[] {
  return normalizeKeyList(meta, schema, readRawShown(meta));
}

export function getHiddenFieldKeySet(meta: DatasetMeta, schema: DatasetSchemaDefinition): Set<string> {
  return new Set(normalizeHiddenFieldKeys(meta, schema));
}

/** Effektiv ausgeblendete Detailfelder (Schema-Standard + meta-Overrides). */
export function resolveDetailHiddenKeys(
  meta: DatasetMeta,
  schema: DatasetSchemaDefinition,
): Set<string> {
  const hidden = new Set<string>();
  for (const key of schema.defaultHiddenDetailFieldKeys ?? []) {
    const def = schema.fields.find((f) => f.key === key);
    if (def && isOptionalSchemaField(def)) hidden.add(key);
  }
  for (const k of normalizeHiddenFieldKeys(meta, schema)) hidden.add(k);
  for (const k of normalizeShownFieldKeys(meta, schema)) hidden.delete(k);
  return hidden;
}

function writeStringListToMeta(meta: DatasetMeta, dataKey: string, keys: string[]): void {
  if (!meta.data) meta.data = {};
  if (keys.length) meta.data[dataKey] = keys;
  else delete meta.data[dataKey];
  if (meta.data && !Object.keys(meta.data).length) delete meta.data;
}

export function setSchemaFieldHidden(
  meta: DatasetMeta,
  schema: DatasetSchemaDefinition,
  fieldKey: string,
  hidden: boolean,
): void {
  const def = schema.fields.find((f) => f.key === fieldKey);
  if (!def || !isOptionalSchemaField(def)) return;

  const defaults = new Set(schema.defaultHiddenDetailFieldKeys ?? []);
  const hiddenSet = new Set(normalizeHiddenFieldKeys(meta, schema));
  const shownSet = new Set(normalizeShownFieldKeys(meta, schema));

  if (hidden) {
    hiddenSet.add(fieldKey);
    shownSet.delete(fieldKey);
  } else {
    hiddenSet.delete(fieldKey);
    if (defaults.has(fieldKey)) shownSet.add(fieldKey);
    else shownSet.delete(fieldKey);
  }

  writeStringListToMeta(meta, HIDDEN_FIELDS_DATA_KEY, [...hiddenSet]);
  writeStringListToMeta(meta, SHOWN_FIELDS_DATA_KEY, [...shownSet]);
}

export function applySchemaDefaultHiddenDetailFields(
  meta: DatasetMeta,
  schema: DatasetSchemaDefinition,
): void {
  for (const key of schema.defaultHiddenDetailFieldKeys ?? []) {
    setSchemaFieldHidden(meta, schema, key, true);
  }
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