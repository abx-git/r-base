import type { DatasetSchemaDefinition, LayoutContainer, LayoutRow } from "./dataset-schema-types";
import { isObsoleteLayoutContainer, isFilesLayoutContainer, layoutHasFilesContainer } from "./detail-layout";

export function getExportLayoutRows(schema: DatasetSchemaDefinition): LayoutRow[] {
  return schema.exportLayout?.length ? schema.exportLayout : schema.layout;
}

export function exportLayoutHasFilesContainer(schema: DatasetSchemaDefinition): boolean {
  return getExportLayoutRows(schema).some((row) => (row.containers ?? []).some(isFilesLayoutContainer));
}

export function exportLayoutHasObsoleteContainer(schema: DatasetSchemaDefinition): boolean {
  return getExportLayoutRows(schema).some((row) => (row.containers ?? []).some(isObsoleteLayoutContainer));
}

export function ensureExportLayoutInitialized(schema: DatasetSchemaDefinition): void {
  if (schema.exportLayout?.length) return;
  schema.exportLayout = structuredClone(schema.layout);
  if (schema.defaultHiddenDetailFieldKeys?.length && !schema.defaultHiddenExportFieldKeys?.length) {
    schema.defaultHiddenExportFieldKeys = [...schema.defaultHiddenDetailFieldKeys];
  }
}

export function consolidateExportLayout(schema: DatasetSchemaDefinition): void {
  ensureExportLayoutInitialized(schema);
  const rows = schema.exportLayout!;
  if (!rows.length) {
    schema.exportLayout = [{ id: "row-export", containers: [] }];
    return;
  }
  const containers = rows.flatMap((r) => r.containers ?? []);
  schema.exportLayout = [{ id: "row-export", containers }];
}

export function ensureExportLayoutRow(schema: DatasetSchemaDefinition): LayoutRow {
  consolidateExportLayout(schema);
  let row = schema.exportLayout![0]!;
  if (!row.containers) row.containers = [];
  return row;
}

export function findExportContainer(schema: DatasetSchemaDefinition, id: string): LayoutContainer | undefined {
  for (const row of getExportLayoutRows(schema)) {
    for (const c of row.containers ?? []) {
      if (c.id === id) return c;
    }
  }
  return undefined;
}

export function ensureFilesInExportLayout(schema: DatasetSchemaDefinition): void {
  if (exportLayoutHasFilesContainer(schema)) return;
  const row = ensureExportLayoutRow(schema);
  row.containers.push({
    id: "container-files",
    title: "Dateien",
    colSpan: 12,
    fieldKeys: [],
  });
}

export function layoutHasFilesContainerForKind(
  schema: DatasetSchemaDefinition,
  kind: "detail" | "export",
): boolean {
  return kind === "export" ? exportLayoutHasFilesContainer(schema) : layoutHasFilesContainer(schema);
}