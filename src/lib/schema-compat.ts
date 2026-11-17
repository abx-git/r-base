import type { DatasetSchemaDefinition, SystemSchemaConfig, TableColumnDef } from "./dataset-schema-types";
import { DEFAULT_RUD_SCHEMA } from "./dataset-schema-defaults";
import { ensureFilesLayoutContainer, isFilesLayoutContainer } from "./detail-layout";
import {
  inferColumnSource,
  isTableColumnHidden,
  PROTECTED_TABLE_FIELD_KEYS,
  resolveHiddenTableColumnIds,
  tableColumnId,
} from "./table-layout";

/** In Tabelle und Detail immer sichtbar halten. */
export const PROTECTED_DETAIL_FIELD_KEYS = new Set(["locId", "bezeichnung"]);

const CORE_TABLE_COLUMNS: TableColumnDef[] = DEFAULT_RUD_SCHEMA.tableColumns.map((c) => ({ ...c }));


function normalizeTableColumnDefs(schema: DatasetSchemaDefinition): void {
  if (!schema.tableColumns.length) {
    schema.tableColumns = CORE_TABLE_COLUMNS.map((c) => ({ ...c }));
    return;
  }
  for (const col of schema.tableColumns) {
    if (!col.source) col.source = inferColumnSource(col.fieldKey);
  }
}

function unhideProtectedTableColumns(hidden: Set<string>, schema: DatasetSchemaDefinition): void {
  const cols = schema.tableColumns.length ? schema.tableColumns : CORE_TABLE_COLUMNS;
  for (const fieldKey of PROTECTED_TABLE_FIELD_KEYS) {
    for (const key of [...hidden]) {
      if (key === fieldKey || key.endsWith(`:${fieldKey}`)) hidden.delete(key);
    }
    for (const col of cols.filter((c) => c.fieldKey === fieldKey && c.source !== "index")) {
      hidden.delete(tableColumnId(col));
    }
  }
}

function ensureAtLeastOneVisibleTableColumn(hidden: Set<string>, schema: DatasetSchemaDefinition): void {
  const cols = schema.tableColumns.length ? schema.tableColumns : CORE_TABLE_COLUMNS;
  const visibleCount = cols.filter((c) => !isTableColumnHidden(c, hidden)).length;
  if (visibleCount > 0) return;
  unhideProtectedTableColumns(hidden, schema);
}

function fieldKeysPlacedInLayout(schema: DatasetSchemaDefinition): Set<string> {
  const placed = new Set<string>();
  for (const row of schema.layout) {
    for (const c of row.containers ?? []) {
      if (isFilesLayoutContainer(c)) continue;
      for (const k of c.fieldKeys ?? []) placed.add(k);
    }
  }
  return placed;
}

/** Jedes Feld höchstens einmal im Layout. */
export function dedupeLayoutFieldKeys(schema: DatasetSchemaDefinition): void {
  const seen = new Set<string>();
  for (const row of schema.layout) {
    for (const c of row.containers ?? []) {
      if (isFilesLayoutContainer(c)) continue;
      const keys: string[] = [];
      for (const k of c.fieldKeys ?? []) {
        if (seen.has(k)) continue;
        seen.add(k);
        keys.push(k);
      }
      c.fieldKeys = keys;
    }
  }
}

/** Detail-Layout: Kernfelder nur ergänzen, wenn sie nirgends platziert sind. */
export function ensureMetaDetailLayout(schema: DatasetSchemaDefinition): void {
  let metaContainer = schema.layout.flatMap((r) => r.containers ?? []).find((c) => c.id === "container-meta");
  if (!metaContainer) {
    metaContainer = {
      id: "container-meta",
      title: "Metadaten",
      colSpan: 12,
      fieldKeys: [],
    };
    const row = schema.layout.find((r) => (r.containers ?? []).length > 0) ?? schema.layout[0];
    if (row) {
      if (!row.containers) row.containers = [];
      row.containers.unshift(metaContainer);
    } else {
      schema.layout.push({ id: "row-main", containers: [metaContainer] });
    }
  }
  if (!metaContainer.fieldKeys) metaContainer.fieldKeys = [];

  dedupeLayoutFieldKeys(schema);
  const placed = fieldKeysPlacedInLayout(schema);

  const requireSomewhere = ["locId", "bezeichnung"] as const;
  for (const key of requireSomewhere) {
    if (!schema.fields.some((f) => f.key === key)) continue;
    if (placed.has(key)) continue;
    if (!metaContainer.fieldKeys.includes(key)) metaContainer.fieldKeys.unshift(key);
    placed.add(key);
  }

  for (const key of ["kategorie", "notes", "tags"]) {
    if (!schema.fields.some((f) => f.key === key)) continue;
    if (placed.has(key)) continue;
    if (!metaContainer.fieldKeys.includes(key)) metaContainer.fieldKeys.push(key);
  }
}

function ensureColumn(schema: DatasetSchemaDefinition, col: TableColumnDef): void {
  const id = tableColumnId(col);
  if (!schema.tableColumns.some((c) => tableColumnId(c) === id)) {
    schema.tableColumns.push({ ...col });
  }
}

/** Repariert nach Schema-Editor / Import: Kernspalten wieder sichtbar, Kernfelder in Layout. */
export function repairSchemaDefinition(schema: DatasetSchemaDefinition): DatasetSchemaDefinition {
  const next = structuredClone(schema);
  const defaults = DEFAULT_RUD_SCHEMA;

  normalizeTableColumnDefs(next);

  for (const def of defaults.fields) {
    if (!next.fields.some((f) => f.key === def.key)) {
      next.fields.push(structuredClone(def));
    }
  }

  for (const col of CORE_TABLE_COLUMNS) {
    ensureColumn(next, col);
  }

  const hidden = resolveHiddenTableColumnIds(next, next.hiddenTableColumnKeys);
  unhideProtectedTableColumns(hidden, next);
  ensureAtLeastOneVisibleTableColumn(hidden, next);
  if (hidden.size) next.hiddenTableColumnKeys = [...hidden];
  else delete next.hiddenTableColumnKeys;

  if (next.defaultHiddenDetailFieldKeys?.length) {
    next.defaultHiddenDetailFieldKeys = next.defaultHiddenDetailFieldKeys.filter(
      (k) => !PROTECTED_DETAIL_FIELD_KEYS.has(k),
    );
    if (!next.defaultHiddenDetailFieldKeys.length) delete next.defaultHiddenDetailFieldKeys;
  }

  ensureMetaDetailLayout(next);
  ensureFilesLayoutContainer(next);

  if (!next.layout.length) next.layout = structuredClone(defaults.layout);

  return next;
}

export function repairSystemSchemaConfig(config: SystemSchemaConfig): SystemSchemaConfig {
  return {
    ...config,
    schemas: config.schemas.map((s) =>
      repairSchemaDefinition(s),
    ),
  };
}