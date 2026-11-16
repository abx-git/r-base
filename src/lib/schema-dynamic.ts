import type { DatasetSchemaDefinition, SchemaFieldDef } from "./dataset-schema-types";
import { absorbLegacyJuraContainer } from "./jura-csv-schema";
import { tableColumnId } from "./table-layout";

const META_CONTAINER_ID = "container-meta";

export type MergeFieldsIntoSchemaOptions = {
  /** Feld-Keys in Reihenfolge fürs Layout (container-meta). */
  layoutFieldKeys?: readonly string[];
  /** Neue Detailfelder standardmäßig ausgeblendet (Schema + Import). */
  hideNewDetailKeys?: boolean;
  /** Neue Tabellenspalten standardmäßig ausgeblendet. */
  hideNewTableColumns?: boolean;
  labelsForTable?: Record<string, string>;
};

/**
 * Nimmt neue Felddefinitionen ins Schema auf (Felder, Layout, Tabelle, Sichtbarkeit).
 */
export function mergeFieldsIntoSchema(
  schema: DatasetSchemaDefinition,
  fieldDefs: SchemaFieldDef[],
  options: MergeFieldsIntoSchemaOptions = {},
): DatasetSchemaDefinition {
  const next = structuredClone(schema);
  absorbLegacyJuraContainer(next);

  const keys = new Set(next.fields.map((f) => f.key));
  const newlyAdded: string[] = [];
  for (const def of fieldDefs) {
    if (!keys.has(def.key)) {
      next.fields.push(structuredClone(def));
      keys.add(def.key);
      newlyAdded.push(def.key);
    }
  }

  const layoutKeys = options.layoutFieldKeys ?? newlyAdded;
  let meta = next.layout.flatMap((r) => r.containers).find((c) => c.id === META_CONTAINER_ID);
  if (!meta && next.layout[0]?.containers[0]) meta = next.layout[0]!.containers[0]!;
  if (meta) {
    for (const k of layoutKeys) {
      if (keys.has(k) && !meta.fieldKeys.includes(k)) meta.fieldKeys.push(k);
    }
  }

  const hiddenCols = new Set(next.hiddenTableColumnKeys ?? []);
  const hiddenDetail = new Set(next.defaultHiddenDetailFieldKeys ?? []);
  const colIds = new Set(next.tableColumns.map((c) => tableColumnId(c)));
  const labels = options.labelsForTable ?? {};

  for (const key of layoutKeys) {
    if (!keys.has(key)) continue;
    const label = labels[key] ?? next.fields.find((f) => f.key === key)?.label ?? key;
    const col = { fieldKey: key, label, source: "meta" as const };
    const id = tableColumnId(col);
    if (!colIds.has(id)) {
      next.tableColumns.push(col);
      colIds.add(id);
      if (options.hideNewTableColumns !== false) hiddenCols.add(id);
    }
  }

  if (options.hideNewDetailKeys !== false) {
    for (const key of layoutKeys) {
      if (keys.has(key)) hiddenDetail.add(key);
    }
  }

  if (hiddenCols.size) next.hiddenTableColumnKeys = [...hiddenCols];
  else delete next.hiddenTableColumnKeys;
  if (hiddenDetail.size) next.defaultHiddenDetailFieldKeys = [...hiddenDetail];
  else delete next.defaultHiddenDetailFieldKeys;

  return next;
}