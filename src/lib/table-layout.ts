import type { DatasetSchemaDefinition, TableColumnDef } from "./dataset-schema-types";

export function tableColumnId(col: TableColumnDef): string {
  const source = col.source ?? "meta";
  return `${source}:${col.fieldKey}`;
}

export function getHiddenTableColumnIdSet(schema: DatasetSchemaDefinition): Set<string> {
  return new Set(schema.hiddenTableColumnKeys ?? []);
}

export function visibleTableColumns(schema: DatasetSchemaDefinition): TableColumnDef[] {
  const hidden = getHiddenTableColumnIdSet(schema);
  const cols = schema.tableColumns.length ? schema.tableColumns : [];
  return cols.filter((c) => !hidden.has(tableColumnId(c)));
}

export function applyTableColumnHidden(
  schema: DatasetSchemaDefinition,
  columnId: string,
  hidden: boolean,
): DatasetSchemaDefinition {
  const next = structuredClone(schema);
  const set = new Set(next.hiddenTableColumnKeys ?? []);
  if (hidden) set.add(columnId);
  else set.delete(columnId);
  const keys = [...set];
  if (keys.length) next.hiddenTableColumnKeys = keys;
  else delete next.hiddenTableColumnKeys;
  return next;
}