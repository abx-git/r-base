import type { DatasetSchemaDefinition, SystemSchemaConfig } from "./dataset-schema-types";

export const BUILTIN_SCHEMA_ID = "rud-v1";

export const DEFAULT_RUD_SCHEMA: DatasetSchemaDefinition = {
  id: BUILTIN_SCHEMA_ID,
  name: "RUD Standard",
  loxPrefix: "RUD",
  metaVersion: 1,
  builtin: true,
  fields: [
    { key: "locId", label: "ID", dataType: "locId", system: true },
    { key: "bezeichnung", label: "Bezeichnung", dataType: "string", system: true, constraints: { required: true } },
    { key: "kategorie", label: "Kategorie", dataType: "string" },
    { key: "notes", label: "Notizen", dataType: "text" },
  ],
  layout: [
    {
      id: "row-main",
      containers: [
        {
          id: "container-meta",
          title: "Metadaten",
          colSpan: 12,
          fieldKeys: ["locId", "bezeichnung", "kategorie", "notes"],
        },
      ],
    },
  ],
  tableColumns: [
    { fieldKey: "locId", label: "ID", source: "meta", width: "10rem" },
    { fieldKey: "bezeichnung", label: "Bezeichnung", source: "meta" },
    { fieldKey: "kategorie", label: "Kategorie", source: "meta", width: "9rem" },
    { fieldKey: "fileCount", label: "Dateien", source: "index", width: "5rem" },
    { fieldKey: "syncStatus", label: "Sync", source: "index", width: "7rem" },
  ],
};

export function createDefaultSystemSchemaConfig(): SystemSchemaConfig {
  return {
    configVersion: 1,
    defaultSchemaId: BUILTIN_SCHEMA_ID,
    schemas: [structuredClone(DEFAULT_RUD_SCHEMA)],
  };
}