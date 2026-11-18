import type { DatasetSchemaDefinition, SystemSchemaConfig } from "./dataset-schema-types";
import { BUILTIN_SCHEMA_ID, createDefaultSystemSchemaConfig } from "./dataset-schema-defaults";
import { absorbLegacyJuraContainer } from "./jura-csv-schema";
import { repairSchemaDefinition, repairSystemSchemaConfig } from "./schema-compat";
import { getBoundProjectRoot, persistCurrentProjectConfig } from "./project-config";
import { getWebDavSettings } from "./credentials";

const STORAGE_KEY = "r-base.system-schemas";

let activeConfig: SystemSchemaConfig | null = null;

function loadConfigFromLocalStorage(): SystemSchemaConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSystemSchemaConfig();
    const parsed = JSON.parse(raw) as SystemSchemaConfig;
    if (parsed?.configVersion !== 1 || !Array.isArray(parsed.schemas) || !parsed.schemas.length) {
      return createDefaultSystemSchemaConfig();
    }
    return parsed;
  } catch {
    return createDefaultSystemSchemaConfig();
  }
}

export function loadSystemSchemaConfig(): SystemSchemaConfig {
  if (activeConfig) return activeConfig;
  return normalizeConfig(repairSystemSchemaConfig(loadConfigFromLocalStorage()));
}

/** Beim Öffnen des Stammordners: Projektdatei → aktive Schema-Konfiguration. */
export function installSystemSchemaConfig(config: SystemSchemaConfig): SystemSchemaConfig {
  const repaired = repairSystemSchemaConfig(config);
  const normalized = normalizeConfig(repaired);
  activeConfig = normalized;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
  }
  if (getBoundProjectRoot()) {
    void persistCurrentProjectConfig(normalized, getWebDavSettings()).catch(() => {});
  }
  return normalized;
}

export function clearActiveSchemaConfig(): void {
  activeConfig = null;
}

function normalizeConfig(config: SystemSchemaConfig): SystemSchemaConfig {
  const defaultSchemaId = config.schemas.some((s) => s.id === config.defaultSchemaId)
    ? config.defaultSchemaId
    : config.schemas[0]!.id;
  return { configVersion: 1, defaultSchemaId, schemas: config.schemas.map(normalizeSchema) };
}

function ensureBuiltinTagsField(schema: DatasetSchemaDefinition): DatasetSchemaDefinition {
  if (schema.id !== BUILTIN_SCHEMA_ID) return schema;
  let next = structuredClone(schema);
  if (!next.fields.some((f) => f.key === "tags")) {
    next.fields.push({ key: "tags", label: "Tags", dataType: "tags" });
    const tagsPlaced = next.layout.some((row) =>
      (row.containers ?? []).some((c) => (c.fieldKeys ?? []).includes("tags")),
    );
    if (!tagsPlaced) {
      for (const row of next.layout) {
        for (const c of row.containers ?? []) {
          if (c.fieldKeys.includes("notes") && !c.fieldKeys.includes("tags")) {
            c.fieldKeys.push("tags");
            break;
          }
        }
      }
    }
  }
  if (!next.tableColumns.some((c) => c.fieldKey === "tags")) {
    const afterKat = next.tableColumns.findIndex((c) => c.fieldKey === "kategorie");
    const col = { fieldKey: "tags" as const, label: "Tags", source: "meta" as const, width: "9rem" };
    if (afterKat >= 0) next.tableColumns.splice(afterKat + 1, 0, col);
    else next.tableColumns.push(col);
  }
  return next;
}

function normalizeSchema(schema: DatasetSchemaDefinition): DatasetSchemaDefinition {
  const colSpan = (n?: number) => (typeof n === "number" && n >= 1 && n <= 12 ? n : 12);
  let base = schema.id === BUILTIN_SCHEMA_ID ? ensureBuiltinTagsField(schema) : schema;
  if (base.id === BUILTIN_SCHEMA_ID) {
    const next = structuredClone(base);
    absorbLegacyJuraContainer(next);
    base = next;
  }
  const repaired = repairSchemaDefinition(base);
  return {
    ...repaired,
    layout: (repaired.layout ?? []).map((row) => ({
      ...row,
      containers: (row.containers ?? []).map((c) => ({
        ...c,
        colSpan: colSpan(c.colSpan),
        fieldKeys: [...(c.fieldKeys ?? [])],
      })),
    })),
    fields: [...(repaired.fields ?? [])],
    tableColumns: [...(repaired.tableColumns ?? [])],
    ...(repaired.hiddenTableColumnKeys?.length
      ? { hiddenTableColumnKeys: [...repaired.hiddenTableColumnKeys] }
      : {}),
    ...(repaired.excelColumns?.length
      ? { excelColumns: [...repaired.excelColumns] }
      : {}),
    ...(repaired.hiddenExcelColumnKeys?.length
      ? { hiddenExcelColumnKeys: [...repaired.hiddenExcelColumnKeys] }
      : {}),
    ...(repaired.defaultHiddenDetailFieldKeys?.length
      ? { defaultHiddenDetailFieldKeys: [...repaired.defaultHiddenDetailFieldKeys] }
      : {}),
    ...(repaired.exportLayout?.length
      ? {
          exportLayout: repaired.exportLayout.map((row) => ({
            ...row,
            containers: (row.containers ?? []).map((c) => ({
              ...c,
              colSpan: colSpan(c.colSpan),
              fieldKeys: [...(c.fieldKeys ?? [])],
            })),
          })),
        }
      : {}),
    ...(repaired.defaultHiddenExportFieldKeys?.length
      ? { defaultHiddenExportFieldKeys: [...repaired.defaultHiddenExportFieldKeys] }
      : {}),
  };
}

export function saveSystemSchemaConfig(config: SystemSchemaConfig): void {
  const normalized = normalizeConfig(config);
  activeConfig = normalized;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
  }
  if (getBoundProjectRoot()) {
    void persistCurrentProjectConfig(normalized, getWebDavSettings()).catch(() => {
    });
  }
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

/** Aktives Listen-/Arbeits-Schema (null = Standardschema). */
export function activeListSchemaId(listViewSchemaId: string | null): string {
  return listViewSchemaId ?? getDefaultSchemaId();
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
  saveSystemSchemaConfig(createDefaultSystemSchemaConfig());
}

export function loxPrefixFromDefaultSchema(): string {
  return getDefaultSchema().loxPrefix;
}