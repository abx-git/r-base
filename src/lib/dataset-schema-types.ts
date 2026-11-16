/** Definition eines Datensatz-Schemas (Struktur, UI, Tabelle). */

export type FieldDataType =
  | "locId"
  | "string"
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "tags";

export type FieldConstraints = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
};

export type SchemaFieldDef = {
  key: string;
  label: string;
  dataType: FieldDataType;
  /** Gesperrte Kernfelder (z. B. locId) — nicht löschbar im Editor */
  system?: boolean;
  constraints?: FieldConstraints;
  /** Auswahlliste bei dataType select */
  options?: string[];
};

export type LayoutContainer = {
  id: string;
  title?: string;
  /** Rasterbreite 1–12 (Standard 12) */
  colSpan?: number;
  fieldKeys: string[];
};

export type LayoutRow = {
  id: string;
  containers: LayoutContainer[];
};

/** Spalte in der Datensatz-Tabelle */
export type TableColumnDef = {
  fieldKey: string;
  label: string;
  width?: string;
  /** meta = Feld aus meta.json; index = berechneter Index (Dateianzahl, Sync) */
  source?: "meta" | "index";
};

export type DatasetSchemaDefinition = {
  id: string;
  name: string;
  /** Lox-ID-Prefix für dieses Schema (z. B. RUD) */
  loxPrefix: string;
  /** Entspricht schemaVersion in meta.json */
  metaVersion: number;
  fields: SchemaFieldDef[];
  layout: LayoutRow[];
  tableColumns: TableColumnDef[];
  /** Tabellenspalten-IDs (source:fieldKey), in der Liste ausgeblendet */
  hiddenTableColumnKeys?: string[];
  /** Mitgeliefert, nicht löschbar */
  builtin?: boolean;
};

export type SystemSchemaConfig = {
  configVersion: 1;
  defaultSchemaId: string;
  schemas: DatasetSchemaDefinition[];
};

/** Index-Felder für Tabellenspalten */
export type IndexColumnKey = "fileCount" | "syncStatus" | "lastModified";