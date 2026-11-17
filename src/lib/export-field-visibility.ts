import type { DatasetSchemaDefinition, SchemaFieldDef } from "./dataset-schema-types";
import { isFilesLayoutContainer } from "./detail-layout";
import { ensureExportLayoutInitialized } from "./export-layout";
import { isOptionalSchemaField } from "./meta-hidden-fields";

function removeFieldFromAllExportContainers(draft: DatasetSchemaDefinition, key: string): void {
  ensureExportLayoutInitialized(draft);
  for (const row of draft.exportLayout ?? []) {
    for (const c of row.containers ?? []) {
      if (isFilesLayoutContainer(c)) continue;
      c.fieldKeys = (c.fieldKeys ?? []).filter((k) => k !== key);
    }
  }
}

export function isExportFieldVisibleInSchema(
  draft: DatasetSchemaDefinition,
  fieldKey: string,
): boolean {
  const def = draft.fields.find((f) => f.key === fieldKey);
  if (!def) return false;
  if (!isOptionalSchemaField(def)) return true;
  return !(draft.defaultHiddenExportFieldKeys ?? []).includes(fieldKey);
}

export function setSchemaExportFieldVisible(
  draft: DatasetSchemaDefinition,
  fieldKey: string,
  visible: boolean,
): void {
  const set = new Set(draft.defaultHiddenExportFieldKeys ?? []);
  if (visible) set.delete(fieldKey);
  else set.add(fieldKey);
  if (set.size) draft.defaultHiddenExportFieldKeys = [...set];
  else delete draft.defaultHiddenExportFieldKeys;
  if (!visible) removeFieldFromAllExportContainers(draft, fieldKey);
}

export function visibleExportFieldDefs(draft: DatasetSchemaDefinition): SchemaFieldDef[] {
  return draft.fields.filter((f) => isExportFieldVisibleInSchema(draft, f.key));
}