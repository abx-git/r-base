import type { DatasetSchemaDefinition, SchemaFieldDef } from "./dataset-schema-types";
import { isFilesLayoutContainer } from "./detail-layout";
import { isOptionalSchemaField } from "./meta-hidden-fields";

function removeFieldFromAllContainers(draft: DatasetSchemaDefinition, key: string): void {
  for (const row of draft.layout) {
    for (const c of row.containers ?? []) {
      if (isFilesLayoutContainer(c)) continue;
      c.fieldKeys = (c.fieldKeys ?? []).filter((k) => k !== key);
    }
  }
}

export function isDetailFieldVisibleInSchema(
  draft: DatasetSchemaDefinition,
  fieldKey: string,
): boolean {
  const def = draft.fields.find((f) => f.key === fieldKey);
  if (!def) return false;
  if (!isOptionalSchemaField(def)) return true;
  return !(draft.defaultHiddenDetailFieldKeys ?? []).includes(fieldKey);
}

export function setSchemaDetailFieldVisible(
  draft: DatasetSchemaDefinition,
  fieldKey: string,
  visible: boolean,
): void {
  const set = new Set(draft.defaultHiddenDetailFieldKeys ?? []);
  if (visible) set.delete(fieldKey);
  else set.add(fieldKey);
  if (set.size) draft.defaultHiddenDetailFieldKeys = [...set];
  else delete draft.defaultHiddenDetailFieldKeys;
  if (!visible) removeFieldFromAllContainers(draft, fieldKey);
}

export function visibleSchemaFieldDefs(draft: DatasetSchemaDefinition): SchemaFieldDef[] {
  return draft.fields.filter((f) => isDetailFieldVisibleInSchema(draft, f.key));
}