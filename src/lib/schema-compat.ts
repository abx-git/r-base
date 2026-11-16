import type { DatasetSchemaDefinition, SystemSchemaConfig, TableColumnDef } from "./dataset-schema-types";
import { DEFAULT_RUD_SCHEMA } from "./dataset-schema-defaults";
import { tableColumnId } from "./table-layout";

/** In Tabelle und Detail immer sichtbar halten. */
export const PROTECTED_DETAIL_FIELD_KEYS = new Set(["locId", "bezeichnung"]);

const CORE_TABLE_COLUMNS: TableColumnDef[] = DEFAULT_RUD_SCHEMA.tableColumns.map((c) => ({ ...c }));

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

  for (const def of defaults.fields) {
    if (!next.fields.some((f) => f.key === def.key)) {
      next.fields.push(structuredClone(def));
    }
  }

  for (const col of CORE_TABLE_COLUMNS) {
    ensureColumn(next, col);
  }

  const hidden = new Set(next.hiddenTableColumnKeys ?? []);
  for (const col of CORE_TABLE_COLUMNS) {
    hidden.delete(tableColumnId(col));
  }
  const visibleCount = next.tableColumns.filter((c) => !hidden.has(tableColumnId(c))).length;
  if (visibleCount < 2) {
    for (const col of CORE_TABLE_COLUMNS) hidden.delete(tableColumnId(col));
  }
  if (hidden.size) next.hiddenTableColumnKeys = [...hidden];
  else delete next.hiddenTableColumnKeys;

  if (next.defaultHiddenDetailFieldKeys?.length) {
    next.defaultHiddenDetailFieldKeys = next.defaultHiddenDetailFieldKeys.filter(
      (k) => !PROTECTED_DETAIL_FIELD_KEYS.has(k),
    );
    if (!next.defaultHiddenDetailFieldKeys.length) delete next.defaultHiddenDetailFieldKeys;
  }

  const metaContainer = next.layout.flatMap((r) => r.containers).find((c) => c.id === "container-meta");
  if (metaContainer) {
    for (const key of ["locId", "bezeichnung", "kategorie", "tags"]) {
      if (next.fields.some((f) => f.key === key) && !metaContainer.fieldKeys.includes(key)) {
        metaContainer.fieldKeys.unshift(key);
      }
    }
  }

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