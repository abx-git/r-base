import type { DatasetSchemaDefinition, SystemSchemaConfig, TableColumnDef } from "./dataset-schema-types";
import { DEFAULT_RUD_SCHEMA } from "./dataset-schema-defaults";
import {
  inferColumnSource,
  isTableColumnHidden,
  resolveHiddenTableColumnIds,
  tableColumnId,
} from "./table-layout";

/** In Tabelle und Detail immer sichtbar halten. */
export const PROTECTED_DETAIL_FIELD_KEYS = new Set(["locId", "bezeichnung"]);

const CORE_TABLE_COLUMNS: TableColumnDef[] = DEFAULT_RUD_SCHEMA.tableColumns.map((c) => ({ ...c }));

const CORE_TABLE_FIELD_KEYS = new Set(CORE_TABLE_COLUMNS.map((c) => c.fieldKey));

function normalizeTableColumnDefs(schema: DatasetSchemaDefinition): void {
  if (!schema.tableColumns.length) {
    schema.tableColumns = CORE_TABLE_COLUMNS.map((c) => ({ ...c }));
    return;
  }
  for (const col of schema.tableColumns) {
    if (!col.source) col.source = inferColumnSource(col.fieldKey);
  }
}

function unhideCoreTableFields(hidden: Set<string>, schema: DatasetSchemaDefinition): void {
  const cols = schema.tableColumns.length ? schema.tableColumns : CORE_TABLE_COLUMNS;
  for (const fieldKey of CORE_TABLE_FIELD_KEYS) {
    for (const key of [...hidden]) {
      if (key === fieldKey || key.endsWith(`:${fieldKey}`)) hidden.delete(key);
    }
    for (const col of cols.filter((c) => c.fieldKey === fieldKey)) {
      hidden.delete(tableColumnId(col));
    }
  }
}

/** Detail-Layout: container-meta mit Kernfeldern (Editor/Import können sie entfernt haben). */
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
  for (const key of ["locId", "bezeichnung", "kategorie", "notes", "tags"]) {
    if (schema.fields.some((f) => f.key === key) && !metaContainer.fieldKeys.includes(key)) {
      metaContainer.fieldKeys.unshift(key);
    }
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
  unhideCoreTableFields(hidden, next);
  const visibleCount = next.tableColumns.filter((c) => !isTableColumnHidden(c, hidden)).length;
  if (visibleCount < 2) unhideCoreTableFields(hidden, next);
  if (hidden.size) next.hiddenTableColumnKeys = [...hidden];
  else delete next.hiddenTableColumnKeys;

  if (next.defaultHiddenDetailFieldKeys?.length) {
    next.defaultHiddenDetailFieldKeys = next.defaultHiddenDetailFieldKeys.filter(
      (k) => !PROTECTED_DETAIL_FIELD_KEYS.has(k),
    );
    if (!next.defaultHiddenDetailFieldKeys.length) delete next.defaultHiddenDetailFieldKeys;
  }

  ensureMetaDetailLayout(next);

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