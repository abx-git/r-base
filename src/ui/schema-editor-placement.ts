import type { DatasetSchemaDefinition } from "../lib/dataset-schema-types";
import { setSchemaDetailFieldVisible, isDetailFieldVisibleInSchema } from "../lib/detail-field-visibility";
import { isExportFieldVisibleInSchema, setSchemaExportFieldVisible } from "../lib/export-field-visibility";
import {
  excelColumnAt,
  excelPlacementRows,
  isTablePlacementProtected,
  tableColumnAt,
  tablePlacementRows,
  type PlacementRow,
} from "../lib/field-placement-editor";
import {
  applyExcelColumnHidden,
  moveExcelColumn,
  setExcelColumnVisible,
} from "../lib/excel-layout";
import { isOptionalSchemaField } from "../lib/meta-hidden-fields";
import {
  applyTableColumnHidden,
  isTableColumnHidden,
  setTableColumnVisible,
  tableColumnId,
} from "../lib/table-layout";
import { hint, mkBtn, moveTableCol, toggleSwitch } from "./schema-editor-shared";

export type PlacementListMode = "liste" | "excel" | "detail" | "export";

export type PlacementListContext = {
  mode: PlacementListMode;
  getDraft: () => DatasetSchemaDefinition;
  setDraft?: (next: DatasetSchemaDefinition) => void;
  rerender: () => void;
};

const VIS_LABEL: Record<PlacementListMode, string> = {
  liste: "In Tabelle",
  excel: "In Excel",
  detail: "Im Detail",
  export: "Im Export",
};

export function renderFieldPlacementList(parent: HTMLElement, ctx: PlacementListContext): void {
  const draft = ctx.getDraft();
  const mode = ctx.mode;

  if (mode === "detail") {
    renderDetailVisibilityList(parent, ctx);
    return;
  }

  if (mode === "export") {
    renderExportVisibilityList(parent, ctx);
    return;
  }

  const header = document.createElement("div");
  header.className = "schema-editor-liste-header";
  header.innerHTML = `<span></span><span>Bezeichnung</span><span>Feld</span><span>${VIS_LABEL[mode]}</span>`;
  parent.append(header);

  const list = document.createElement("div");
  list.className = "schema-editor-liste-rows";

  const isExcel = mode === "excel";
  const { rows, hidden } = isExcel ? excelPlacementRows(draft) : tablePlacementRows(draft);
  rows.forEach((row, idx) => {
    list.append(renderListeRow(draft, row, idx, rows.length, hidden, ctx, isExcel));
  });
  if (!rows.length) {
    parent.append(
      hint("Keine Felder im Schema — zuerst im Tab „Feldkatalog“ anlegen."),
    );
    return;
  }

  parent.append(list);
}

/** Alle Feldkatalog-Felder: nur Sichtbarkeit im Detaildialog. */
export function renderDetailVisibilityList(parent: HTMLElement, ctx: PlacementListContext): void {
  const draft = ctx.getDraft();

  parent.append(
    hint(
      "Welche Felder im Datensatz-Detail erscheinen. Aktivierte Felder erscheinen unten unter „Anordnung“ (Container oder „Nicht platziert“).",
    ),
  );

  const header = document.createElement("div");
  header.className = "schema-editor-liste-header";
  header.innerHTML = "<span></span><span>Bezeichnung</span><span>Feld</span><span>Im Detail</span>";
  parent.append(header);

  const list = document.createElement("div");
  list.className = "schema-editor-liste-rows";

  for (const def of draft.fields) {
    const hidden = !isDetailFieldVisibleInSchema(draft, def.key);
    const row = document.createElement("div");
    row.className = "schema-editor-liste-row";
    if (hidden) row.classList.add("schema-editor-liste-row--hidden");

    const label = document.createElement("span");
    label.className = "schema-editor-toggle-label";
    label.textContent = def.label;

    const keyBadge = document.createElement("span");
    keyBadge.className = "schema-editor-liste-key";
    keyBadge.textContent = def.key;

    const visCell = document.createElement("div");
    if (!isOptionalSchemaField(def)) {
      const tag = document.createElement("span");
      tag.className = "schema-editor-badge";
      tag.textContent = "immer sichtbar";
      visCell.append(tag);
    } else {
      visCell.append(
        toggleSwitch(!hidden, `${def.label} im Detail anzeigen`, (visible) => {
          setSchemaDetailFieldVisible(ctx.getDraft(), def.key, visible);
          ctx.rerender();
        }),
      );
    }

    const spacer = document.createElement("span");
    row.append(spacer, label, keyBadge, visCell);
    list.append(row);
  }

  if (!draft.fields.length) {
    parent.append(hint("Keine Felder — zuerst im Tab „Feldkatalog“ anlegen."));
    return;
  }

  parent.append(list);
}

/** Feldkatalog: Sichtbarkeit im Schema-PDF-Export. */
export function renderExportVisibilityList(parent: HTMLElement, ctx: PlacementListContext): void {
  const draft = ctx.getDraft();

  parent.append(
    hint(
      "Welche Felder im PDF erscheinen. Unter „Anordnung“: Container, „Nicht platziert“, optional „Bilder“ oder „Außerhalb des Schemas“.",
    ),
  );

  const header = document.createElement("div");
  header.className = "schema-editor-liste-header";
  header.innerHTML = "<span></span><span>Bezeichnung</span><span>Feld</span><span>Im Export</span>";
  parent.append(header);

  const list = document.createElement("div");
  list.className = "schema-editor-liste-rows";

  for (const def of draft.fields) {
    const hidden = !isExportFieldVisibleInSchema(draft, def.key);
    const row = document.createElement("div");
    row.className = "schema-editor-liste-row";
    if (hidden) row.classList.add("schema-editor-liste-row--hidden");

    const label = document.createElement("span");
    label.className = "schema-editor-toggle-label";
    label.textContent = def.label;

    const keyBadge = document.createElement("span");
    keyBadge.className = "schema-editor-liste-key";
    keyBadge.textContent = def.key;

    const visCell = document.createElement("div");
    if (!isOptionalSchemaField(def)) {
      const tag = document.createElement("span");
      tag.className = "schema-editor-badge";
      tag.textContent = "immer sichtbar";
      visCell.append(tag);
    } else {
      visCell.append(
        toggleSwitch(!hidden, `${def.label} im Export anzeigen`, (visible) => {
          setSchemaExportFieldVisible(ctx.getDraft(), def.key, visible);
          ctx.rerender();
        }),
      );
    }

    const spacer = document.createElement("span");
    row.append(spacer, label, keyBadge, visCell);
    list.append(row);
  }

  if (!draft.fields.length) {
    parent.append(hint("Keine Felder — zuerst im Tab „Feldkatalog“ anlegen."));
    return;
  }

  parent.append(list);
}

function renderListeRow(
  draft: DatasetSchemaDefinition,
  row: PlacementRow,
  idx: number,
  rowCount: number,
  hidden: Set<string>,
  ctx: PlacementListContext,
  excelMode = false,
): HTMLElement {
  const col = excelMode ? excelColumnAt(draft, idx) : tableColumnAt(draft, idx);
  const id = col
    ? tableColumnId(col)
    : tableColumnId({
        fieldKey: row.fieldKey,
        label: row.label,
        source: row.kind === "index" ? "index" : "meta",
      });
  const isHidden = col ? isTableColumnHidden(col, hidden) : hidden.has(id);
  const protectedCol = row.kind === "meta" && isTablePlacementProtected(draft, row);

  const el = document.createElement("div");
  el.className = "schema-editor-liste-row";
  if (isHidden && !protectedCol) el.classList.add("schema-editor-liste-row--hidden");

  const moves = document.createElement("div");
  moves.className = "schema-editor-liste-moves";
  moves.append(
    mkBtn("↑", idx === 0, () => {
      if (excelMode) moveExcelColumn(ctx.getDraft(), idx, -1);
      else moveTableCol(ctx.getDraft(), idx, -1);
      ctx.rerender();
    }),
    mkBtn("↓", idx === rowCount - 1, () => {
      if (excelMode) moveExcelColumn(ctx.getDraft(), idx, 1);
      else moveTableCol(ctx.getDraft(), idx, 1);
      ctx.rerender();
    }),
  );

  const label = document.createElement("span");
  label.className = "schema-editor-toggle-label";
  label.textContent = row.label;

  const keyBadge = document.createElement("span");
  keyBadge.className = "schema-editor-liste-key";
  keyBadge.textContent = `${row.fieldKey} (${row.kind === "index" ? "index" : "meta"})`;

  const visCell = document.createElement("div");
  if (protectedCol) {
    const tag = document.createElement("span");
    tag.className = "schema-editor-badge";
    tag.textContent = "immer sichtbar";
    visCell.append(tag);
  } else {
    const visTarget = excelMode ? "Excel" : "Tabelle";
    visCell.append(
      toggleSwitch(!isHidden, `${row.label} in ${visTarget}`, (visible) => {
        const d = ctx.getDraft();
        const candidate = {
          fieldKey: row.fieldKey,
          label: row.label,
          source: row.kind === "index" ? ("index" as const) : ("meta" as const),
        };
        let next: DatasetSchemaDefinition;
        if (visible) {
          next = excelMode
            ? setExcelColumnVisible(d, candidate, true)
            : setTableColumnVisible(d, candidate, true);
        } else {
          next = excelMode ? applyExcelColumnHidden(d, id, true) : applyTableColumnHidden(d, id, true);
        }
        if (ctx.setDraft) ctx.setDraft(next);
        else Object.assign(d, next);
        ctx.rerender();
      }),
    );
  }

  el.append(moves, label, keyBadge, visCell);
  return el;
}