import type { DatasetSchemaDefinition, LayoutContainer, LayoutRow } from "./dataset-schema-types";
import { isFilesLayoutContainer } from "./detail-layout";
import { isExportFieldVisibleInSchema } from "./export-field-visibility";
import { consolidateExportLayout, ensureExportLayoutInitialized, ensureExportLayoutRow } from "./export-layout";

function dedupeExportLayoutFieldKeys(schema: DatasetSchemaDefinition): void {
  ensureExportLayoutInitialized(schema);
  const seen = new Set<string>();
  for (const row of schema.exportLayout ?? []) {
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

function pruneInvisibleExportFieldsFromLayout(draft: DatasetSchemaDefinition): void {
  for (const row of draft.exportLayout ?? []) {
    for (const c of row.containers ?? []) {
      if (isFilesLayoutContainer(c)) continue;
      c.fieldKeys = (c.fieldKeys ?? []).filter((k) => isExportFieldVisibleInSchema(draft, k));
    }
  }
}

export function prepareExportLayoutDraft(draft: DatasetSchemaDefinition): void {
  consolidateExportLayout(draft);
  dedupeExportLayoutFieldKeys(draft);
  pruneInvisibleExportFieldsFromLayout(draft);
}

export function unassignedExportFieldKeys(draft: DatasetSchemaDefinition): string[] {
  const row = ensureExportLayoutRow(draft);
  const placed = new Set<string>();
  for (const c of row.containers) {
    if (isFilesLayoutContainer(c)) continue;
    for (const k of c.fieldKeys ?? []) placed.add(k);
  }
  return draft.fields.map((f) => f.key).filter((k) => !placed.has(k));
}

export function getVisibleUnassignedExportFieldKeys(draft: DatasetSchemaDefinition): string[] {
  return unassignedExportFieldKeys(draft).filter((k) => isExportFieldVisibleInSchema(draft, k));
}

/** Anzeige-Reihenfolge für PDF: Export-Layout, danach Katalog. */
export function getExportFieldOrder(draft: DatasetSchemaDefinition): string[] {
  const row = ensureExportLayoutRow(draft);
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

export type ExportBlock =
  | { kind: "fields"; title?: string; fieldKeys: string[] }
  | { kind: "files"; title?: string; colSpan?: number }
  | { kind: "unplaced"; fieldKeys: string[] };

export function exportBlocksForSchema(schema: DatasetSchemaDefinition): ExportBlock[] {
  prepareExportLayoutDraft(schema);
  const row = ensureExportLayoutRow(schema);
  const blocks: ExportBlock[] = [];
  const placed = new Set<string>();

  for (const c of row.containers) {
    if (isFilesLayoutContainer(c)) {
      blocks.push({ kind: "files", title: c.title, colSpan: c.colSpan });
      continue;
    }
    const keys = (c.fieldKeys ?? []).filter(
      (k) => schema.fields.some((f) => f.key === k) && isExportFieldVisibleInSchema(schema, k),
    );
    for (const k of keys) placed.add(k);
    if (keys.length || c.title?.trim()) {
      blocks.push({ kind: "fields", title: c.title, fieldKeys: keys });
    }
  }

  const unplaced = unassignedExportFieldKeys(schema).filter(
    (k) => isExportFieldVisibleInSchema(schema, k) && !placed.has(k),
  );
  if (unplaced.length) blocks.push({ kind: "unplaced", fieldKeys: unplaced });

  return blocks;
}