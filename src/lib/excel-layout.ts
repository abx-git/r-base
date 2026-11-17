import type { DatasetSchemaDefinition, TableColumnDef } from "./dataset-schema-types";
import { DEFAULT_RUD_SCHEMA } from "./dataset-schema-defaults";
import {
  INDEX_TABLE_FIELDS,
  type TableColumnCandidate,
  applyTableColumnHidden,
  addTableColumnToSchema,
  getHiddenTableColumnIdSet,
  inferColumnSource,
  isProtectedTableColumn,
  isTableColumnHidden,
  PROTECTED_TABLE_FIELD_KEYS,
  resolveHiddenColumnIds,
  tableColumnId,
  type ConfiguredTableColumnRow,
} from "./table-layout";

export function ensureExcelColumnsInitialized(schema: DatasetSchemaDefinition): void {
  if (!schema.excelColumns?.length) {
    const base = schema.tableColumns.length ? schema.tableColumns : DEFAULT_RUD_SCHEMA.tableColumns;
    schema.excelColumns = base.map((c) => ({ ...c }));
    // Nur beim ersten Anlegen: Sichtbarkeit von der Listenansicht übernehmen.
    if (
      schema.hiddenTableColumnKeys?.length &&
      !schema.hiddenExcelColumnKeys?.length
    ) {
      schema.hiddenExcelColumnKeys = [...schema.hiddenTableColumnKeys];
    }
  }
}

export function getHiddenExcelColumnIdSet(schema: DatasetSchemaDefinition): Set<string> {
  ensureExcelColumnsInitialized(schema);
  return resolveHiddenColumnIds(schema.excelColumns!, schema.hiddenExcelColumnKeys);
}

export function visibleExcelColumns(schema: DatasetSchemaDefinition): TableColumnDef[] {
  ensureExcelColumnsInitialized(schema);
  const hidden = getHiddenExcelColumnIdSet(schema);
  const cols = schema.excelColumns!.length ? schema.excelColumns! : [...DEFAULT_RUD_SCHEMA.tableColumns];
  let visible = cols.filter((c) => !isTableColumnHidden(c, hidden));
  if (!visible.length) {
    const preferred = cols.filter(
      (c) => PROTECTED_TABLE_FIELD_KEYS.has(c.fieldKey) && !isTableColumnHidden(c, hidden),
    );
    visible =
      preferred.length > 0
        ? preferred
        : DEFAULT_RUD_SCHEMA.tableColumns.filter((c) => PROTECTED_TABLE_FIELD_KEYS.has(c.fieldKey));
  }
  return visible;
}

export function applyExcelColumnHidden(
  schema: DatasetSchemaDefinition,
  columnId: string,
  hidden: boolean,
): DatasetSchemaDefinition {
  ensureExcelColumnsInitialized(schema);
  const next = structuredClone(schema);
  const set = new Set(next.hiddenExcelColumnKeys ?? []);
  if (hidden) set.add(columnId);
  else {
    set.delete(columnId);
    const bare = columnId.includes(":") ? columnId.slice(columnId.indexOf(":") + 1) : columnId;
    set.delete(bare);
    const source = columnId.includes(":") ? columnId.split(":")[0] : "meta";
    const alt = source === "meta" ? `index:${bare}` : `meta:${bare}`;
    set.delete(alt);
  }
  const keys = [...set];
  if (keys.length) next.hiddenExcelColumnKeys = keys;
  else delete next.hiddenExcelColumnKeys;
  return next;
}

export function setExcelColumnVisible(
  schema: DatasetSchemaDefinition,
  candidate: TableColumnCandidate,
  visible: boolean,
): DatasetSchemaDefinition {
  ensureExcelColumnsInitialized(schema);
  const col: TableColumnDef = {
    fieldKey: candidate.fieldKey,
    label: candidate.label,
    source: candidate.source,
  };
  const id = tableColumnId(col);
  const exists = schema.excelColumns!.some((c) => tableColumnId(c) === id);
  if (visible) {
    let next = structuredClone(schema);
    if (!exists) {
      next.excelColumns!.push(col);
      const hidden = new Set(next.hiddenExcelColumnKeys ?? []);
      hidden.delete(id);
      if (hidden.size) next.hiddenExcelColumnKeys = [...hidden];
      else delete next.hiddenExcelColumnKeys;
    }
    return applyExcelColumnHidden(next, id, false);
  }
  if (!exists) return schema;
  return applyExcelColumnHidden(structuredClone(schema), id, true);
}

export function isExcelPlacementProtected(col: TableColumnDef): boolean {
  return isProtectedTableColumn(col);
}

export function moveExcelColumn(draft: DatasetSchemaDefinition, idx: number, delta: number): void {
  ensureExcelColumnsInitialized(draft);
  const next = idx + delta;
  const cols = draft.excelColumns!;
  if (next < 0 || next >= cols.length) return;
  const tmp = cols[idx]!;
  cols[idx] = cols[next]!;
  cols[next] = tmp;
}