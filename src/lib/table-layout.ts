import type { DatasetSchemaDefinition, TableColumnDef } from "./dataset-schema-types";
import { DEFAULT_RUD_SCHEMA } from "./dataset-schema-defaults";

/** Spalten, die in der Tabelle nicht dauerhaft ausgeblendet werden können. */
export const PROTECTED_TABLE_FIELD_KEYS = new Set(["locId", "bezeichnung"]);

export function isProtectedTableColumn(col: TableColumnDef): boolean {
  return col.source !== "index" && PROTECTED_TABLE_FIELD_KEYS.has(col.fieldKey);
}

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
  const source = col.source ?? inferColumnSource(col.fieldKey);
  return `${source}:${col.fieldKey}`;
}

const INDEX_FIELD_KEYS = new Set(INDEX_TABLE_FIELDS.map((f) => f.fieldKey));

export function inferColumnSource(fieldKey: string): "meta" | "index" {
  return INDEX_FIELD_KEYS.has(fieldKey) ? "index" : "meta";
}

/** Normalisiert gespeicherte IDs (früher nur fieldKey oder falsches source:-Präfix). */
export function resolveHiddenTableColumnIds(
  schema: DatasetSchemaDefinition,
  rawKeys?: string[],
): Set<string> {
  const cols = schema.tableColumns.length ? schema.tableColumns : DEFAULT_RUD_SCHEMA.tableColumns;
  const hidden = new Set<string>();
  for (const raw of rawKeys ?? []) {
    const t = raw.trim();
    if (!t) continue;
    if (t.includes(":")) {
      hidden.add(t);
      continue;
    }
    const matches = cols.filter((c) => c.fieldKey === t);
    if (matches.length) {
      for (const c of matches) hidden.add(tableColumnId(c));
    } else {
      hidden.add(`${inferColumnSource(t)}:${t}`);
    }
  }
  return hidden;
}

export function isTableColumnHidden(col: TableColumnDef, hidden: Set<string>): boolean {
  const id = tableColumnId(col);
  if (hidden.has(id)) return true;
  if (hidden.has(col.fieldKey)) return true;
  const otherSource = col.source === "index" ? "meta" : "index";
  if (hidden.has(`${otherSource}:${col.fieldKey}`)) return true;
  return false;
}

export function getHiddenTableColumnIdSet(schema: DatasetSchemaDefinition): Set<string> {
  return resolveHiddenTableColumnIds(schema, schema.hiddenTableColumnKeys);
}

export function visibleTableColumns(schema: DatasetSchemaDefinition): TableColumnDef[] {
  const hidden = getHiddenTableColumnIdSet(schema);
  const cols = schema.tableColumns.length ? schema.tableColumns : [...DEFAULT_RUD_SCHEMA.tableColumns];
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