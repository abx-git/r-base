import type { DatasetSchemaDefinition } from "../lib/dataset-schema-types";
import {
  getDetailFieldOrder,
  isTablePlacementProtected,
  moveDetailFieldOrder,
  syncDetailLayoutWithFieldCatalog,
  syncTableColumnsWithFieldCatalog,
  tableColumnAt,
  tablePlacementRows,
  type PlacementRow,
} from "../lib/field-placement-editor";
import { isOptionalSchemaField } from "../lib/meta-hidden-fields";
import {
  applyTableColumnHidden,
  setTableColumnVisible,
  tableColumnId,
} from "../lib/table-layout";
import { hint, mkBtn, moveTableCol, toggleDraftDetailDefaultHidden, toggleSwitch } from "./schema-editor-shared";

export type PlacementListMode = "liste" | "detail";

export type PlacementListContext = {
  mode: PlacementListMode;
  getDraft: () => DatasetSchemaDefinition;
  setDraft?: (next: DatasetSchemaDefinition) => void;
  rerender: () => void;
};

const VIS_LABEL: Record<PlacementListMode, string> = {
  liste: "In Tabelle",
  detail: "Im Detail",
};

/**
 * Einheitliche Felderliste für Listen- und Detail-Tab: alle Katalogfelder (+ Index in Liste),
 * Sichtbarkeit und Sortierung.
 */
export function renderFieldPlacementList(parent: HTMLElement, ctx: PlacementListContext): void {
  const draft = ctx.getDraft();
  const mode = ctx.mode;

  if (mode === "liste") {
    syncTableColumnsWithFieldCatalog(draft);
  } else {
    syncDetailLayoutWithFieldCatalog(draft);
  }

  const header = document.createElement("div");
  header.className = "schema-editor-liste-header";
  header.innerHTML = `<span></span><span>Bezeichnung</span><span>Feld</span><span>${VIS_LABEL[mode]}</span>`;
  parent.append(header);

  const list = document.createElement("div");
  list.className = "schema-editor-liste-rows";

  if (mode === "liste") {
  const { rows, hidden } = tablePlacementRows(draft);
    rows.forEach((row, idx) => {
      list.append(renderListeRow(draft, row, idx, rows.length, hidden, ctx));
    });
    if (!rows.length) {
      parent.append(
        hint("Keine Felder im Schema — zuerst im Tab „Feldkatalog“ anlegen."),
      );
      return;
    }
  } else {
    const hiddenDefaults = new Set(draft.defaultHiddenDetailFieldKeys ?? []);
    const order = getDetailFieldOrder(draft);
    const count = order.length;
    for (let idx = 0; idx < count; idx++) {
      const key = order[idx]!;
      const def = draft.fields.find((f) => f.key === key);
      if (!def) continue;
      list.append(renderDetailRow(def, idx, count, hiddenDefaults.has(key), ctx));
    }
    if (!count) {
      parent.append(
        hint("Keine Felder im Schema — zuerst im Tab „Feldkatalog“ anlegen."),
      );
      return;
    }
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
): HTMLElement {
  const col = tableColumnAt(draft, idx);
  const id = col
    ? tableColumnId(col)
    : tableColumnId({
        fieldKey: row.fieldKey,
        label: row.label,
        source: row.kind === "index" ? "index" : "meta",
      });
  const isHidden = hidden.has(id);
  const protectedCol = row.kind === "meta" && isTablePlacementProtected(draft, row);

  const el = document.createElement("div");
  el.className = "schema-editor-liste-row";
  if (isHidden && !protectedCol) el.classList.add("schema-editor-liste-row--hidden");

  const moves = document.createElement("div");
  moves.className = "schema-editor-liste-moves";
  moves.append(
    mkBtn("↑", idx === 0, () => {
      moveTableCol(ctx.getDraft(), idx, -1);
      ctx.rerender();
    }),
    mkBtn("↓", idx === rowCount - 1, () => {
      moveTableCol(ctx.getDraft(), idx, 1);
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
    visCell.append(
      toggleSwitch(!isHidden, `${row.label} in Tabelle`, (visible) => {
        const d = ctx.getDraft();
        const candidate = {
          fieldKey: row.fieldKey,
          label: row.label,
          source: row.kind === "index" ? ("index" as const) : ("meta" as const),
        };
        let next: DatasetSchemaDefinition;
        if (visible) {
          next = setTableColumnVisible(d, candidate, true);
        } else {
          next = applyTableColumnHidden(d, id, true);
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

function renderDetailRow(
  def: import("../lib/dataset-schema-types").SchemaFieldDef,
  idx: number,
  rowCount: number,
  hidden: boolean,
  ctx: PlacementListContext,
): HTMLElement {
  const el = document.createElement("div");
  el.className = "schema-editor-liste-row";
  if (hidden) el.classList.add("schema-editor-liste-row--hidden");

  const moves = document.createElement("div");
  moves.className = "schema-editor-liste-moves";
  moves.append(
    mkBtn("↑", idx === 0, () => {
      moveDetailFieldOrder(ctx.getDraft(), def.key, -1);
      ctx.rerender();
    }),
    mkBtn("↓", idx === rowCount - 1, () => {
      moveDetailFieldOrder(ctx.getDraft(), def.key, 1);
      ctx.rerender();
    }),
  );

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
        toggleDraftDetailDefaultHidden(ctx.getDraft(), def.key, !visible);
        ctx.rerender();
      }),
    );
  }

  el.append(moves, label, keyBadge, visCell);
  return el;
}