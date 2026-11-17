import type {
  DatasetSchemaDefinition,
  FieldDataType,
  LayoutContainer,
  LayoutRow,
  SchemaFieldDef,
} from "../lib/dataset-schema-types";
import { isFilesLayoutContainer, isReservedLayoutContainer } from "../lib/detail-layout";
import { isDetailFieldVisibleInSchema } from "../lib/detail-field-visibility";
import { isExportFieldVisibleInSchema } from "../lib/export-field-visibility";
import { consolidateExportLayout, ensureExportLayoutRow, findExportContainer } from "../lib/export-layout";
import { validateSchemaDefinition } from "../lib/schema-validation";

export type SchemaEditorTabId = "stammdaten" | "felder" | "liste" | "detail" | "export";

/** Legacy + neue Tab-IDs aus Aufrufern */
export type SchemaEditorInitialTab =
  | SchemaEditorTabId
  | "general"
  | "fields"
  | "table"
  | "layout"
  | "visibility";

export const SCHEMA_EDITOR_TABS: {
  id: SchemaEditorTabId;
  label: string;
  description: string;
}[] = [
  { id: "stammdaten", label: "Stammdaten", description: "Name, ID-Präfix, Version" },
  { id: "felder", label: "Feldkatalog", description: "Felder anlegen: Label, Typ, Pflicht" },
  { id: "liste", label: "Listenansicht", description: "Tabellen-Spalten & Reihenfolge" },
  { id: "detail", label: "Detailformular", description: "Detail-Sichtbarkeit & Layout" },
  { id: "export", label: "Exportformular", description: "PDF-Export: Felder, Anordnung & Bilder" },
];

export function mapInitialTab(
  raw: SchemaEditorInitialTab | undefined,
  hasDatasetContext: boolean,
): SchemaEditorTabId {
  if (!raw || raw === "general") return "stammdaten";
  if (raw === "fields") return "felder";
  if (raw === "table" || raw === "visibility") {
    return hasDatasetContext ? "detail" : "liste";
  }
  if (raw === "layout") return "detail";
  if (raw === "stammdaten" || raw === "felder" || raw === "liste" || raw === "detail" || raw === "export") return raw;
  return "stammdaten";
}

export function isDraftDirty(a: DatasetSchemaDefinition, b: DatasetSchemaDefinition): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function validationErrorTab(err: string | null): SchemaEditorTabId | null {
  if (!err) return null;
  if (err.includes("Tabellenspalte")) return "liste";
  if (err.includes("Layout")) return "detail";
  if (err.includes("Feld") || err.includes("Key")) return "felder";
  if (err.includes("Prefix") || err.includes("Name") || err.includes("ID")) return "stammdaten";
  return null;
}

export function validateDraft(draft: DatasetSchemaDefinition): string | null {
  return validateSchemaDefinition(draft);
}

export function slugId(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function slugFieldKey(v: string): string {
  const s = v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s || ["locId", "files", "sync", "schemaVersion", "lastModified"].includes(s)) return "";
  return s;
}

export function fieldTypes(): FieldDataType[] {
  return ["string", "text", "number", "date", "boolean", "select", "tags"];
}

export function columnKeyOptions(draft: DatasetSchemaDefinition): { key: string; source: "meta" | "index" }[] {
  const index: { key: string; source: "index" }[] = [
    { key: "fileCount", source: "index" },
    { key: "syncStatus", source: "index" },
    { key: "lastModified", source: "index" },
  ];
  const meta = draft.fields.map((f) => ({ key: f.key, source: "meta" as const }));
  return [...meta, ...index];
}

export function moveSchemaField(draft: DatasetSchemaDefinition, idx: number, delta: number): void {
  const next = idx + delta;
  if (next < 0 || next >= draft.fields.length) return;
  const fields = draft.fields;
  const tmp = fields[idx]!;
  fields[idx] = fields[next]!;
  fields[next] = tmp;
}

export function moveTableCol(draft: DatasetSchemaDefinition, idx: number, delta: number): void {
  const next = idx + delta;
  if (next < 0 || next >= draft.tableColumns.length) return;
  const cols = draft.tableColumns;
  const tmp = cols[idx]!;
  cols[idx] = cols[next]!;
  cols[next] = tmp;
}

export function purgeFieldFromLayout(draft: DatasetSchemaDefinition, key: string): void {
  removeFieldFromAllContainers(draft, key);
  removeFieldFromAllExportContainers(draft, key);
}

export function removeFieldFromAllExportContainers(draft: DatasetSchemaDefinition, key: string): void {
  consolidateExportLayout(draft);
  for (const row of draft.exportLayout ?? []) {
    for (const c of row.containers ?? []) {
      if (isFilesLayoutContainer(c)) continue;
      c.fieldKeys = (c.fieldKeys ?? []).filter((k) => k !== key);
    }
  }
}

export { consolidateExportLayout, ensureExportLayoutRow };

export function purgeFieldFromTable(draft: DatasetSchemaDefinition, key: string): void {
  draft.tableColumns = draft.tableColumns.filter((c) => c.fieldKey !== key);
  const hidden = new Set(draft.hiddenTableColumnKeys ?? []);
  hidden.delete(key);
  hidden.delete(`meta:${key}`);
  hidden.delete(`index:${key}`);
  if (hidden.size) draft.hiddenTableColumnKeys = [...hidden];
  else delete draft.hiddenTableColumnKeys;
  if (draft.defaultHiddenDetailFieldKeys?.length) {
    draft.defaultHiddenDetailFieldKeys = draft.defaultHiddenDetailFieldKeys.filter((k) => k !== key);
    if (!draft.defaultHiddenDetailFieldKeys.length) delete draft.defaultHiddenDetailFieldKeys;
  }
  if (draft.defaultHiddenExportFieldKeys?.length) {
    draft.defaultHiddenExportFieldKeys = draft.defaultHiddenExportFieldKeys.filter((k) => k !== key);
    if (!draft.defaultHiddenExportFieldKeys.length) delete draft.defaultHiddenExportFieldKeys;
  }
}

export function removeFieldFromAllContainers(draft: DatasetSchemaDefinition, key: string): void {
  for (const row of draft.layout) {
    for (const c of row.containers ?? []) {
      if (isFilesLayoutContainer(c)) continue;
      c.fieldKeys = (c.fieldKeys ?? []).filter((k) => k !== key);
    }
  }
}

export function findContainer(draft: DatasetSchemaDefinition, id: string): LayoutContainer | undefined {
  for (const row of draft.layout) {
    for (const c of row.containers) {
      if (c.id === id) return c;
    }
  }
  return undefined;
}

/** Editor + Speichern: eine Zeile, Container nebeneinander über colSpan. */
export function consolidateDetailLayout(draft: DatasetSchemaDefinition): void {
  if (!draft.layout.length) {
    draft.layout = [{ id: "row-main", containers: [] }];
    return;
  }
  const containers = draft.layout.flatMap((r) => r.containers ?? []);
  draft.layout = [{ id: "row-main", containers }];
}

export function ensureDetailLayoutRow(draft: DatasetSchemaDefinition): LayoutRow {
  consolidateDetailLayout(draft);
  let row = draft.layout[0]!;
  if (!row.containers) row.containers = [];
  return row;
}

export function moveContainerInRow(containers: LayoutContainer[], containerId: string, delta: number): void {
  const idx = containers.findIndex((c) => c.id === containerId);
  if (idx < 0) return;
  const next = idx + delta;
  if (next < 0 || next >= containers.length) return;
  const tmp = containers[idx]!;
  containers[idx] = containers[next]!;
  containers[next] = tmp;
}

export function moveFieldInContainer(container: LayoutContainer, fieldKey: string, delta: number): void {
  const idx = container.fieldKeys.indexOf(fieldKey);
  if (idx < 0) return;
  const next = idx + delta;
  if (next < 0 || next >= container.fieldKeys.length) return;
  const keys = container.fieldKeys;
  const tmp = keys[idx]!;
  keys[idx] = keys[next]!;
  keys[next] = tmp;
}

/** Drop-Ziel für Felder ohne Container-Zuordnung (nur im Schema-Editor). */
export const DETAIL_UNPLACED_DROP_ID = "__unplaced__";
export const EXPORT_UNPLACED_DROP_ID = "__export_unplaced__";

export function fieldChip(key: string, draft: DatasetSchemaDefinition): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "layout-chip";
  chip.draggable = true;
  chip.dataset.fieldKey = key;
  const def = draft.fields.find((f) => f.key === key);
  chip.textContent = def ? `${def.label} (${key})` : key;
  chip.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData("text/field-key", key);
    e.dataTransfer!.effectAllowed = "move";
  });
  return chip;
}

export function enableExportDrop(
  zone: HTMLElement,
  draft: DatasetSchemaDefinition,
  rerender: () => void,
): void {
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-over");
    const key = e.dataTransfer?.getData("text/field-key");
    if (!key) return;
    removeFieldFromAllExportContainers(draft, key);
    const targetId = zone.dataset.containerId;
    if (targetId === EXPORT_UNPLACED_DROP_ID) {
      rerender();
      return;
    }
    const container = findExportContainer(draft, targetId ?? "");
    if (!container || isReservedLayoutContainer(container)) return;
    if (!isExportFieldVisibleInSchema(draft, key)) return;
    if (!container.fieldKeys.includes(key)) container.fieldKeys.push(key);
    rerender();
  });
}

export function enableDrop(
  zone: HTMLElement,
  draft: DatasetSchemaDefinition,
  rerender: () => void,
): void {
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-over");
    const key = e.dataTransfer?.getData("text/field-key");
    if (!key) return;
    removeFieldFromAllContainers(draft, key);
    const targetId = zone.dataset.containerId;
    if (targetId === DETAIL_UNPLACED_DROP_ID) {
      rerender();
      return;
    }
    const container = findContainer(draft, targetId ?? "");
    if (!container || isFilesLayoutContainer(container)) return;
    if (!isDetailFieldVisibleInSchema(draft, key)) return;
    if (!container.fieldKeys.includes(key)) container.fieldKeys.push(key);
    rerender();
  });
}

export function fieldInput(
  label: string,
  value: string,
  editable: boolean,
  onChange: (v: string) => void,
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.textContent = label;
  const input = document.createElement("input");
  input.className = "field";
  input.value = value;
  input.readOnly = !editable;
  input.addEventListener("change", () => onChange(input.value));
  wrap.append(input);
  return wrap;
}

export function hint(text: string, className = "schema-editor-hint"): HTMLElement {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

export function mkBtn(text: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn";
  b.textContent = text;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

export function toggleSwitch(
  checked: boolean,
  ariaLabel: string,
  onChange: (next: boolean) => void,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.role = "switch";
  input.className = "schema-editor-switch";
  input.checked = checked;
  input.setAttribute("aria-label", ariaLabel);
  input.addEventListener("change", () => onChange(input.checked));
  return input;
}
