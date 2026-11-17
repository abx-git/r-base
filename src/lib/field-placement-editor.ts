import type { DatasetSchemaDefinition, LayoutContainer, LayoutRow, TableColumnDef } from "./dataset-schema-types";
import { prepareExportLayoutDraft } from "./export-placement-editor";
import { dedupeLayoutFieldKeys } from "./schema-compat";
import { isDetailFieldVisibleInSchema } from "./detail-field-visibility";
import { FILES_LAYOUT_CONTAINER_ID, isFilesLayoutContainer } from "./detail-layout";

function pruneInvisibleDetailFieldsFromLayout(draft: DatasetSchemaDefinition): void {
  for (const row of draft.layout) {
    for (const c of row.containers ?? []) {
      if (isFilesLayoutContainer(c)) continue;
      c.fieldKeys = (c.fieldKeys ?? []).filter((k) => isDetailFieldVisibleInSchema(draft, k));
    }
  }
}
import { ensureExcelColumnsInitialized, getHiddenExcelColumnIdSet } from "./excel-layout";
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

function findMetaContainer(row: LayoutRow): LayoutContainer {
  let meta = row.containers.find((c) => c.id === "container-meta");
  if (!meta) {
    meta = { id: "container-meta", title: "", colSpan: 12, fieldKeys: [] };
    row.containers.unshift(meta);
  }
  if (!meta.fieldKeys) meta.fieldKeys = [];
  return meta;
}

/** Einmal beim Öffnen/Speichern des Schema-Editors — nicht bei jedem Tab-Render. */
export function prepareSchemaEditorDraft(draft: DatasetSchemaDefinition): void {
  syncTableColumnsWithFieldCatalog(draft);
  syncExcelColumnsWithFieldCatalog(draft);
  dedupeLayoutFieldKeys(draft);
  pruneInvisibleDetailFieldsFromLayout(draft);
  ensureUnplacedCatalogFieldsInLayout(draft);
  prepareExportLayoutDraft(draft);
}

/** Platzhalter — Platzierung nur über „Anordnung“ (Container / „Nicht platziert“). */
export function ensureUnplacedCatalogFieldsInLayout(_draft: DatasetSchemaDefinition): void {
  /* no-op */
}

/** Alle Feldkatalog-Felder in tableColumns, fehlende ans Ende. */
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

/** Feldkatalog → excelColumns (parallel zur Listenansicht). */
export function syncExcelColumnsWithFieldCatalog(draft: DatasetSchemaDefinition): void {
  ensureExcelColumnsInitialized(draft);
  const seen = new Set<string>();
  const nextCols: TableColumnDef[] = [];
  for (const col of draft.excelColumns!) {
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
  draft.excelColumns = nextCols;
}

export function tablePlacementRows(draft: DatasetSchemaDefinition): {
  rows: PlacementRow[];
  hidden: Set<string>;
} {
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

export function excelPlacementRows(draft: DatasetSchemaDefinition): {
  rows: PlacementRow[];
  hidden: Set<string>;
} {
  ensureExcelColumnsInitialized(draft);
  const hidden = getHiddenExcelColumnIdSet(draft);
  const rows: PlacementRow[] = draft.excelColumns!.map((col) => {
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
  return draft.tableColumns[rowIndex];
}

export function excelColumnAt(draft: DatasetSchemaDefinition, rowIndex: number): TableColumnDef | undefined {
  ensureExcelColumnsInitialized(draft);
  return draft.excelColumns![rowIndex];
}

export function isTablePlacementProtected(draft: DatasetSchemaDefinition, row: PlacementRow): boolean {
  if (row.kind === "index") return false;
  return isProtectedTableColumn({
    fieldKey: row.fieldKey,
    label: row.label,
    source: "meta",
  });
}

export function unassignedDetailFieldKeys(draft: DatasetSchemaDefinition): string[] {
  const placed = new Set<string>();
  for (const row of draft.layout) {
    for (const c of row.containers ?? []) {
      if (isFilesLayoutContainer(c)) continue;
      for (const k of c.fieldKeys ?? []) placed.add(k);
    }
  }
  return draft.fields.map((f) => f.key).filter((k) => !placed.has(k));
}

/** Platzierte Felder, die im Detail sichtbar sind (Bereich „Anordnung“). */
export function getPlacedDetailFieldOrder(draft: DatasetSchemaDefinition): string[] {
  const skip = new Set(unassignedDetailFieldKeys(draft));
  return getDetailFieldOrder(draft).filter(
    (k) => !skip.has(k) && isDetailFieldVisibleInSchema(draft, k),
  );
}

/** Sichtbar, aber noch keinem Container zugeordnet. */
export function getVisibleUnassignedDetailFieldKeys(draft: DatasetSchemaDefinition): string[] {
  return unassignedDetailFieldKeys(draft).filter((k) => isDetailFieldVisibleInSchema(draft, k));
}

export function detailFieldPlacementLabel(draft: DatasetSchemaDefinition, fieldKey: string): string {
  for (const c of ensureDetailLayoutRow(draft).containers) {
    if (isFilesLayoutContainer(c)) continue;
    if (!(c.fieldKeys ?? []).includes(fieldKey)) continue;
    if (c.id === "container-meta") return c.title?.trim() || "Metadaten";
    if (c.id === FILES_LAYOUT_CONTAINER_ID) continue;
    return c.title?.trim() || c.id;
  }
  return "— nicht platziert";
}

/** Anzeige-Reihenfolge im Editor: Layout durchlaufen, danach Felder ohne Platzierung. */
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

function containerHoldingKey(draft: DatasetSchemaDefinition, fieldKey: string): LayoutContainer | null {
  for (const c of ensureDetailLayoutRow(draft).containers) {
    if (isFilesLayoutContainer(c)) continue;
    if ((c.fieldKeys ?? []).includes(fieldKey)) return c;
  }
  return null;
}

/** Vertauscht zwei Felder in der Anzeige-Reihenfolge, ohne Container-Layout zu zerstören. */
export function moveDetailFieldOrder(draft: DatasetSchemaDefinition, fieldKey: string, delta: number): void {
  const order = getPlacedDetailFieldOrder(draft);
  const idx = order.indexOf(fieldKey);
  if (idx < 0) return;
  const j = idx + delta;
  if (j < 0 || j >= order.length) return;
  const otherKey = order[j]!;

  const contA = containerHoldingKey(draft, fieldKey);
  const contB = containerHoldingKey(draft, otherKey);
  if (!contA || !contB) return;
  const ia = contA.fieldKeys.indexOf(fieldKey);
  const ib = contB.fieldKeys.indexOf(otherKey);
  if (ia < 0 || ib < 0) return;

  if (contA === contB) {
    contA.fieldKeys[ia] = otherKey;
    contB.fieldKeys[ib] = fieldKey;
  } else {
    contA.fieldKeys[ia] = otherKey;
    contB.fieldKeys[ib] = fieldKey;
  }
}