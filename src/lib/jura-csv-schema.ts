import type { DatasetSchemaDefinition } from "./dataset-schema-types";
import { createMinimalDatasetSchema } from "./dataset-schema-defaults";
import { mergeFieldsIntoSchema } from "./schema-dynamic";

/** Spalten der Rudisten-Datenbank Jura (CSV Zeile 2). */
export const JURA_CSV_COLUMN_KEYS = [
  "eigene_nr",
  "bild_link",
  "sammlung",
  "sammlungs_nr",
  "aktueller_name",
  "bestimmt_durch_aktuell",
  "typus",
  "vorherige_namen",
  "bestimmt_durch_vorherig",
  "fundort",
  "koordinaten",
  "merkmale",
  "pers_gesehen",
  "stratigraphie",
  "sonstiges",
  "slg_link",
  "literatur_link",
] as const;

export type JuraCsvColumnKey = (typeof JURA_CSV_COLUMN_KEYS)[number];

export const JURA_CSV_MATCH_KEY: JuraCsvColumnKey = "eigene_nr";

const JURA_LABELS: Record<JuraCsvColumnKey, string> = {
  eigene_nr: "Eigene Nr.",
  bild_link: "Bild-Link",
  sammlung: "Sammlung",
  sammlungs_nr: "Sammlungs-Nr.",
  aktueller_name: "Aktueller Name",
  bestimmt_durch_aktuell: "Bestimmt durch (aktuell)",
  typus: "Typus",
  vorherige_namen: "Vorherige Namen",
  bestimmt_durch_vorherig: "Bestimmt durch (vorherig)",
  fundort: "Fundort",
  koordinaten: "Koordinaten",
  merkmale: "Merkmale",
  pers_gesehen: "Pers. gesehen Ja/Nein",
  stratigraphie: "Stratigraphie",
  sonstiges: "Sonstiges",
  slg_link: "Slg.-Link",
  literatur_link: "Literatur-Link",
};

export const JURA_CSV_FIELD_DEFS = JURA_CSV_COLUMN_KEYS.map((key) => ({
  key,
  label: JURA_LABELS[key],
  dataType: (key === "merkmale" || key === "sonstiges" ? "text" : "string") as const,
}));

export const JURA_CSV_SOURCE_ID = "rudisten-jura-csv-v1";

/** Entfernt alte Jura-Gruppe und hängt Felder an „Metadaten“. */
export function absorbLegacyJuraContainer(schema: DatasetSchemaDefinition): void {
  const META_CONTAINER_ID = "container-meta";
  const meta = schema.layout.flatMap((r) => r.containers).find((c) => c.id === META_CONTAINER_ID);
  for (const row of schema.layout) {
    row.containers = row.containers.filter((c) => {
      if (c.id !== "container-jura") return true;
      if (meta) {
        for (const k of c.fieldKeys) {
          if (!meta.fieldKeys.includes(k)) meta.fieldKeys.push(k);
        }
      }
      return false;
    });
  }
  schema.layout = schema.layout.filter((row) => row.containers.length > 0);
}

export function mergeJuraImportIntoSchema(schema: DatasetSchemaDefinition): DatasetSchemaDefinition {
  return mergeFieldsIntoSchema(schema, JURA_CSV_FIELD_DEFS, {
    layoutFieldKeys: JURA_CSV_COLUMN_KEYS,
    hideNewDetailKeys: true,
    hideNewTableColumns: true,
    labelsForTable: JURA_LABELS,
  });
}

/** Vollständiges Startschema für Rudisten-Jura-Projekte (ohne RUD-Werksvorgabe). */
export function createJuraDatasetSchema(): DatasetSchemaDefinition {
  const base = createMinimalDatasetSchema({
    id: "jura-v1",
    name: "Rudisten Jura",
    loxPrefix: "JUR",
  });
  return mergeFieldsIntoSchema(base, JURA_CSV_FIELD_DEFS, {
    layoutFieldKeys: [...JURA_CSV_COLUMN_KEYS],
    hideNewDetailKeys: false,
    hideNewTableColumns: false,
    labelsForTable: JURA_LABELS,
  });
}

/** @deprecated Alias */
export function mergeJuraFieldsIntoBuiltinSchema(schema: DatasetSchemaDefinition): DatasetSchemaDefinition {
  return mergeJuraImportIntoSchema(schema);
}