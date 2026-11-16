import type { DatasetSchemaDefinition, TableColumnDef } from "./dataset-schema-types";

export const INDEX_TABLE_FIELDS: { fieldKey: string; label: string; source: "index" }[] = [
  { fieldKey: "fileCount", label: "Dateien", source: "index" },
  { fieldKey: "syncStatus", label: "Sync", source: "index" },
  { fieldKey: "lastModified", label: "Geändert", source: "index" },
];

export type TableColumnCandidate = {
  fieldKey: string;
  label: string;
  source: "meta" | "index";
};

export type ConfiguredTableColumnRow = {
  col: TableColumnDef;
  id: string;
  hidden: boolean;
};

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

export function listTableColumnLayout(schema: DatasetSchemaDefinition): {
  configured: ConfiguredTableColumnRow[];
  available: TableColumnCandidate[];
} {
  const hidden = getHiddenTableColumnIdSet(schema);
  const inTable = new Set(schema.tableColumns.map((c) => tableColumnId(c)));
  const configured = schema.tableColumns.map((col) => {
    const id = tableColumnId(col);
    return { col, id, hidden: hidden.has(id) };
  });
  const available: TableColumnCandidate[] = [];
  for (const f of schema.fields) {
    const id = tableColumnId({ fieldKey: f.key, label: f.label, source: "meta" });
    if (inTable.has(id)) continue;
    available.push({ fieldKey: f.key, label: f.label, source: "meta" });
  }
  for (const idx of INDEX_TABLE_FIELDS) {
    const id = tableColumnId(idx);
    if (inTable.has(id)) continue;
    available.push(idx);
  }
  available.sort((a, b) => a.label.localeCompare(b.label, "de"));
  return { configured, available };
}

export function addTableColumnToSchema(
  schema: DatasetSchemaDefinition,
  candidate: TableColumnCandidate,
): DatasetSchemaDefinition {
  const next = structuredClone(schema);
  const col: TableColumnDef = {
    fieldKey: candidate.fieldKey,
    label: candidate.label,
    source: candidate.source,
  };
  const id = tableColumnId(col);
  if (next.tableColumns.some((c) => tableColumnId(c) === id)) return next;
  next.tableColumns.push(col);
  const hidden = new Set(next.hiddenTableColumnKeys ?? []);
  hidden.delete(id);
  if (hidden.size) next.hiddenTableColumnKeys = [...hidden];
  else delete next.hiddenTableColumnKeys;
  return next;
}