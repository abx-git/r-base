import type { DatasetSchemaDefinition, LayoutContainer } from "./dataset-schema-types";

/** Reservierter Container: Datei-Upload in der Detailansicht (keine Felder). */
export const FILES_LAYOUT_CONTAINER_ID = "container-files";

/** Export: Felder in meta.json, die nicht im Feldkatalog stehen. */
export const OBSOLETE_LAYOUT_CONTAINER_ID = "container-obsolete";

export function isFilesLayoutContainer(container: LayoutContainer): boolean {
  return container.id === FILES_LAYOUT_CONTAINER_ID;
}

export function isObsoleteLayoutContainer(container: LayoutContainer): boolean {
  return container.id === OBSOLETE_LAYOUT_CONTAINER_ID;
}

export function isReservedLayoutContainer(container: LayoutContainer): boolean {
  return isFilesLayoutContainer(container) || isObsoleteLayoutContainer(container);
}

export function layoutHasFilesContainer(schema: DatasetSchemaDefinition): boolean {
  return schema.layout.some((row) => (row.containers ?? []).some(isFilesLayoutContainer));
}

/** Legt Dateien-Container an, wenn noch keiner im Schema ist. */
export function ensureFilesLayoutContainer(schema: DatasetSchemaDefinition): void {
  if (layoutHasFilesContainer(schema)) return;
  const row = schema.layout[0];
  if (!row) {
    schema.layout.push({
      id: "row-main",
      containers: [
        {
          id: FILES_LAYOUT_CONTAINER_ID,
          title: "Dateien",
          colSpan: 12,
          fieldKeys: [],
        },
      ],
    });
    return;
  }
  if (!row.containers) row.containers = [];
  row.containers.push({
    id: FILES_LAYOUT_CONTAINER_ID,
    title: "Dateien",
    colSpan: 12,
    fieldKeys: [],
  });
}