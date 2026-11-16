import { BUILTIN_SCHEMA_ID } from "./dataset-schema-defaults";
import type { DatasetSchemaDefinition, SchemaFieldDef } from "./dataset-schema-types";

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

export const JURA_CSV_FIELD_DEFS: SchemaFieldDef[] = JURA_CSV_COLUMN_KEYS.map((key) => ({
  key,
  label: JURA_LABELS[key],
  dataType: key === "merkmale" || key === "sonstiges" ? "text" : "string",
}));

export const JURA_CSV_SOURCE_ID = "rudisten-jura-csv-v1";

export function mergeJuraFieldsIntoBuiltinSchema(schema: DatasetSchemaDefinition): DatasetSchemaDefinition {
  if (schema.id !== BUILTIN_SCHEMA_ID) return schema;
  const next = structuredClone(schema);
  const keys = new Set(next.fields.map((f) => f.key));
  for (const def of JURA_CSV_FIELD_DEFS) {
    if (!keys.has(def.key)) {
      next.fields.push(structuredClone(def));
      keys.add(def.key);
    }
  }
  let container = next.layout.flatMap((r) => r.containers).find((c) => c.id === "container-jura");
  if (!container) {
    next.layout.push({
      id: "row-jura",
      containers: [
        {
          id: "container-jura",
          title: "Rudisten-Datenbank Jura",
          colSpan: 12,
          fieldKeys: [...JURA_CSV_COLUMN_KEYS],
        },
      ],
    });
  } else {
    for (const k of JURA_CSV_COLUMN_KEYS) {
      if (!container.fieldKeys.includes(k)) container.fieldKeys.push(k);
    }
  }
  const colKeys = new Set(next.tableColumns.map((c) => c.fieldKey));
  if (!colKeys.has("eigene_nr")) {
    next.tableColumns.splice(1, 0, {
      fieldKey: "eigene_nr",
      label: "Eigene Nr.",
      source: "meta",
      width: "6rem",
    });
  }
  if (!colKeys.has("aktueller_name")) {
    const idx = next.tableColumns.findIndex((c) => c.fieldKey === "eigene_nr");
    next.tableColumns.splice(idx >= 0 ? idx + 1 : 1, 0, {
      fieldKey: "aktueller_name",
      label: "Aktueller Name",
      source: "meta",
    });
  }
  return next;
}