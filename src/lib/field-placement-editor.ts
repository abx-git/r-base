import type { DatasetSchemaDefinition, LayoutRow, TableColumnDef } from "./dataset-schema-types";
import { isFilesLayoutContainer } from "./detail-layout";
import {
  INDEX_TABLE_FIELDS,
  getHiddenTableColumnIdSet,
  isProtectedTableColumn,
  tableColumnId,
} from "./table-layout";

export type PlacementRowMeta = {
  kind: "meta";
  fieldKey: string;
  label: string;
};

export type PlacementRowIndex = {
  kind: "index";
  fieldKey: string;
  label: string;
};

export type PlacementRow = PlacementRowMeta | PlacementRowIndex;

function ensureDetailLayoutRow(draft: DatasetSchemaDefinition): LayoutRow {
  if (!draft.layout.length) {
    draft.layout = [{ id: "row-main", containers: [] }];
  }
  const containers = draft.layout.flatMap((r) => r.containers ?? []);
  draft.layout = [{ id: "row-main", containers }];
  let row = draft.layout[0]!;
  if (!row.containers) row.containers = [];
  return row;
}

/** Alle Feldkatalog-Felder in tableColumns, fehlende ans Ende. Reihenfolge = einheitliche Editor-Liste. */
export function syncTableColumnsWithFieldCatalog(draft: DatasetSchemaDefinition): void {
  const seen = new Set<string>();
  const nextCols: TableColumnDef[] = [];
  for (const col of draft.tableColumns) {
    const id = tableColumnId(col);
    if (seen.has(id)) continue;
    const validMeta =
      col.source !== "index" && draft.fields.some((f) => f.key === col.fieldKey);
    const validIndex = col.source === "index" && INDEX_TABLE_FIELDS.some((i) => i.fieldKey === col.fieldKey);
    if (!validMeta && !validIndex) continue;
    seen.add(id);
    if (col.source !== "index") {
      const def = draft.fields.find((f) => f.key === col.fieldKey);
      if (def) col.label = def.label;
    }
    nextCols.push(col);
  }
  for (const f of draft.fields) {
    const id = tableColumnId({ fieldKey: f.key, label: f.label, source: "meta" });
    if (seen.has(id)) continue;
    seen.add(id);
    nextCols.push({ fieldKey: f.key, label: f.label, source: "meta" });
  }
  for (const idx of INDEX_TABLE_FIELDS) {
    const id = tableColumnId(idx);
    if (seen.has(id)) continue;
    seen.add(id);
    nextCols.push({ ...idx });
  }
  draft.tableColumns = nextCols;
}

export function tablePlacementRows(draft: DatasetSchemaDefinition): {
  rows: PlacementRow[];
  hidden: Set<string>;
} {
  syncTableColumnsWithFieldCatalog(draft);
  const hidden = getHiddenTableColumnIdSet(draft);
  const rows: PlacementRow[] = draft.tableColumns.map((col) => {
    if (col.source === "index") {
      const idx = INDEX_TABLE_FIELDS.find((i) => i.fieldKey === col.fieldKey);
      return {
        kind: "index",
        fieldKey: col.fieldKey,
        label: idx?.label ?? col.label,
      };
    }
    const def = draft.fields.find((f) => f.key === col.fieldKey);
    return {
      kind: "meta",
      fieldKey: col.fieldKey,
      label: def?.label ?? col.label,
    };
  });
  return { rows, hidden };
}

export function tableColumnAt(draft: DatasetSchemaDefinition, rowIndex: number): TableColumnDef | undefined {
  syncTableColumnsWithFieldCatalog(draft);
  return draft.tableColumns[rowIndex];
}

export function isTablePlacementProtected(draft: DatasetSchemaDefinition, row: PlacementRow): boolean {
  if (row.kind === "index") return false;
  return isProtectedTableColumn({
    fieldKey: row.fieldKey,
    label: row.label,
    source: "meta",
  });
}

/** Detail: Reihenfolge über alle nicht-Datei-Container + nicht platzierte Katalogfelder. */
export function syncDetailLayoutWithFieldCatalog(draft: DatasetSchemaDefinition): void {
  const row = ensureDetailLayoutRow(draft);
  let meta = row.containers.find((c) => c.id === "container-meta");
  if (!meta) {
    meta = { id: "container-meta", title: "", colSpan: 12, fieldKeys: [] };
    row.containers.unshift(meta);
  }
  if (!meta.fieldKeys) meta.fieldKeys = [];

  const order = getDetailFieldOrder(draft);
  for (const key of order) {
    if (meta.fieldKeys.includes(key)) continue;
    meta.fieldKeys.push(key);
  }
}

export function getDetailFieldOrder(draft: DatasetSchemaDefinition): string[] {
  const row = ensureDetailLayoutRow(draft);
  const seen = new Set<string>();
  const order: string[] = [];
  for (const c of row.containers) {
    if (isFilesLayoutContainer(c)) continue;
    for (const k of c.fieldKeys ?? []) {
      if (!draft.fields.some((f) => f.key === k)) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      order.push(k);
    }
  }
  for (const f of draft.fields) {
    if (!seen.has(f.key)) order.push(f.key);
  }
  return order;
}

export function moveDetailFieldOrder(draft: DatasetSchemaDefinition, fieldKey: string, delta: number): void {
  const order = getDetailFieldOrder(draft);
  const idx = order.indexOf(fieldKey);
  if (idx < 0) return;
  const next = idx + delta;
  if (next < 0 || next >= order.length) return;
  const tmp = order[idx]!;
  order[idx] = order[next]!;
  order[next] = tmp;
  applyDetailFieldOrder(draft, order);
}

function applyDetailFieldOrder(draft: DatasetSchemaDefinition, order: string[]): void {
  const row = ensureDetailLayoutRow(draft);
  const meta = row.containers.find((c) => c.id === "container-meta");
  for (const c of row.containers) {
    if (isFilesLayoutContainer(c)) continue;
    c.fieldKeys = (c.fieldKeys ?? []).filter((k) => !order.includes(k));
  }
  if (meta) {
    const rest = (meta.fieldKeys ?? []).filter((k) => !order.includes(k));
    meta.fieldKeys = [...order, ...rest];
  } else {
    row.containers.unshift({
      id: "container-meta",
      title: "",
      colSpan: 12,
      fieldKeys: [...order],
    });
  }
}