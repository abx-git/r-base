import { BUILTIN_SCHEMA_ID } from "./dataset-schema-defaults";
import type { DatasetSchemaDefinition, SchemaFieldDef } from "./dataset-schema-types";
import { tableColumnId } from "./table-layout";

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

const META_CONTAINER_ID = "container-meta";

/** Entfernt alte Jura-Gruppe und hängt CSV-Felder an „Metadaten“ an. */
export function absorbLegacyJuraContainer(schema: DatasetSchemaDefinition): void {
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

/**
 * Erweitert das Builtin-Schema um alle CSV-Spalten (Felder + Layout „Metadaten“).
 * Keine eigene Feldgruppe. Neue Tabellenspalten starten ausgeblendet.
 */
export function mergeJuraFieldsIntoBuiltinSchema(schema: DatasetSchemaDefinition): DatasetSchemaDefinition {
  if (schema.id !== BUILTIN_SCHEMA_ID) return schema;
  const next = structuredClone(schema);
  absorbLegacyJuraContainer(next);

  const keys = new Set(next.fields.map((f) => f.key));
  for (const def of JURA_CSV_FIELD_DEFS) {
    if (!keys.has(def.key)) {
      next.fields.push(structuredClone(def));
      keys.add(def.key);
    }
  }

  let meta = next.layout.flatMap((r) => r.containers).find((c) => c.id === META_CONTAINER_ID);
  if (!meta && next.layout[0]?.containers[0]) {
    meta = next.layout[0]!.containers[0]!;
  }
  if (meta) {
    for (const k of JURA_CSV_COLUMN_KEYS) {
      if (!meta.fieldKeys.includes(k)) meta.fieldKeys.push(k);
    }
  }

  const hiddenCols = new Set(next.hiddenTableColumnKeys ?? []);
  const colIds = new Set(next.tableColumns.map((c) => tableColumnId(c)));
  for (const key of JURA_CSV_COLUMN_KEYS) {
    const col = { fieldKey: key, label: JURA_LABELS[key], source: "meta" as const };
    const id = tableColumnId(col);
    if (!colIds.has(id)) {
      next.tableColumns.push(col);
      hiddenCols.add(id);
      colIds.add(id);
    }
  }
  if (hiddenCols.size) next.hiddenTableColumnKeys = [...hiddenCols];
  else delete next.hiddenTableColumnKeys;

  return next;
}