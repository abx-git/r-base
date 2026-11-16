import type { DatasetSchemaDefinition, SystemSchemaConfig } from "./dataset-schema-types";
import {
  BUILTIN_SCHEMA_ID,
  DEFAULT_RUD_SCHEMA,
  createDefaultSystemSchemaConfig,
} from "./dataset-schema-defaults";
import { mergeJuraFieldsIntoBuiltinSchema } from "./jura-csv-schema";

const STORAGE_KEY = "r-base.system-schemas";

export function loadSystemSchemaConfig(): SystemSchemaConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSystemSchemaConfig();
    const parsed = JSON.parse(raw) as SystemSchemaConfig;
    if (parsed?.configVersion !== 1 || !Array.isArray(parsed.schemas) || !parsed.schemas.length) {
      return createDefaultSystemSchemaConfig();
    }
    return mergeWithBuiltin(parsed);
  } catch {
    return createDefaultSystemSchemaConfig();
  }
}

function mergeWithBuiltin(config: SystemSchemaConfig): SystemSchemaConfig {
  const hasBuiltin = config.schemas.some((s) => s.id === BUILTIN_SCHEMA_ID);
  if (hasBuiltin) return normalizeConfig(config);
  return normalizeConfig({
    ...config,
    schemas: [structuredClone(DEFAULT_RUD_SCHEMA), ...config.schemas],
  });
}

function normalizeConfig(config: SystemSchemaConfig): SystemSchemaConfig {
  const defaultSchemaId = config.schemas.some((s) => s.id === config.defaultSchemaId)
    ? config.defaultSchemaId
    : config.schemas[0]!.id;
  return { configVersion: 1, defaultSchemaId, schemas: config.schemas.map(normalizeSchema) };
}

function ensureBuiltinTagsField(schema: DatasetSchemaDefinition): DatasetSchemaDefinition {
  if (schema.id !== BUILTIN_SCHEMA_ID || schema.fields.some((f) => f.key === "tags")) return schema;
  const next = structuredClone(schema);
  next.fields.push({ key: "tags", label: "Tags", dataType: "tags" });
  for (const row of next.layout) {
    for (const c of row.containers) {
      if (c.fieldKeys.includes("notes") && !c.fieldKeys.includes("tags")) c.fieldKeys.push("tags");
    }
  }
  return next;
}

function normalizeSchema(schema: DatasetSchemaDefinition): DatasetSchemaDefinition {
  const colSpan = (n?: number) => (typeof n === "number" && n >= 1 && n <= 12 ? n : 12);
  let base = schema.id === BUILTIN_SCHEMA_ID ? ensureBuiltinTagsField(schema) : schema;
  if (base.id === BUILTIN_SCHEMA_ID) base = mergeJuraFieldsIntoBuiltinSchema(base);
  return {
    ...base,
    layout: (base.layout ?? []).map((row) => ({
      ...row,
      containers: (row.containers ?? []).map((c) => ({
        ...c,
        colSpan: colSpan(c.colSpan),
        fieldKeys: [...(c.fieldKeys ?? [])],
      })),
    })),
    fields: [...(base.fields ?? [])],
    tableColumns: [...(base.tableColumns ?? [])],
  };
}

export function saveSystemSchemaConfig(config: SystemSchemaConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeConfig(config)));
}

export function getDefaultSchema(): DatasetSchemaDefinition {
  const cfg = loadSystemSchemaConfig();
  return (
    cfg.schemas.find((s) => s.id === cfg.defaultSchemaId) ??
    cfg.schemas.find((s) => s.id === BUILTIN_SCHEMA_ID) ??
    cfg.schemas[0]!
  );
}

export function getDefaultSchemaId(): string {
  return loadSystemSchemaConfig().defaultSchemaId;
}

export function getSchemaById(id: string): DatasetSchemaDefinition | undefined {
  return loadSystemSchemaConfig().schemas.find((s) => s.id === id);
}

export function resolveSchemaForDataset(meta: {
  schemaKey?: string;
  locId: string;
}): DatasetSchemaDefinition {
  const cfg = loadSystemSchemaConfig();
  const key = meta.schemaKey?.trim();
  if (key) {
    const byId = cfg.schemas.find((s) => s.id === key);
    if (byId) return byId;
    const byPrefix = cfg.schemas.find((s) => s.loxPrefix.toUpperCase() === key.toUpperCase());
    if (byPrefix) return byPrefix;
  }
  const prefix = meta.locId.split("-")[0]?.toUpperCase();
  if (prefix) {
    const byLoc = cfg.schemas.find((s) => s.loxPrefix.toUpperCase() === prefix);
    if (byLoc) return byLoc;
  }
  return getDefaultSchema();
}

export function upsertSchemaDefinition(schema: DatasetSchemaDefinition): void {
  const cfg = loadSystemSchemaConfig();
  const idx = cfg.schemas.findIndex((s) => s.id === schema.id);
  const next = structuredClone(schema);
  if (schema.id === BUILTIN_SCHEMA_ID) next.builtin = true;
  if (idx >= 0) cfg.schemas[idx] = next;
  else cfg.schemas.push(next);
  saveSystemSchemaConfig(cfg);
}

export function removeSchemaDefinition(id: string): boolean {
  if (id === BUILTIN_SCHEMA_ID) return false;
  const cfg = loadSystemSchemaConfig();
  if (cfg.schemas.length <= 1) return false;
  cfg.schemas = cfg.schemas.filter((s) => s.id !== id);
  if (cfg.defaultSchemaId === id) cfg.defaultSchemaId = cfg.schemas[0]!.id;
  saveSystemSchemaConfig(cfg);
  return true;
}

export function setDefaultSchemaId(id: string): void {
  const cfg = loadSystemSchemaConfig();
  if (!cfg.schemas.some((s) => s.id === id)) return;
  cfg.defaultSchemaId = id;
  saveSystemSchemaConfig(cfg);
}

export function resetSchemasToDefaults(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function loxPrefixFromDefaultSchema(): string {
  return getDefaultSchema().loxPrefix;
}