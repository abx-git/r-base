import type { DatasetSchemaDefinition, TableColumnDef } from "../lib/dataset-schema-types";
import {
  applyTableColumnHidden,
  INDEX_TABLE_FIELDS,
  isProtectedTableColumn,
  listTableColumnLayout,
  setTableColumnVisible,
  tableColumnId,
  type TableColumnCandidate,
} from "../lib/table-layout";
import { hint, mkBtn, moveTableCol, toggleSwitch } from "./schema-editor-shared";

export type ListeRenderContext = {
  getDraft: () => DatasetSchemaDefinition;
  setDraft: (next: DatasetSchemaDefinition) => void;
  rerender: () => void;
};

function columnDisplayLabel(draft: DatasetSchemaDefinition, col: TableColumnDef): string {
  if (col.source === "index") {
    return INDEX_TABLE_FIELDS.find((f) => f.fieldKey === col.fieldKey)?.label ?? col.fieldKey;
  }
  return draft.fields.find((f) => f.key === col.fieldKey)?.label ?? col.label;
}

export function renderListenansicht(parent: HTMLElement, ctx: ListeRenderContext): void {
  const draft = ctx.getDraft();
  parent.replaceChildren();
  parent.append(
    hint(
      "Welche Felder als Spalten in der Datensatz-Liste erscheinen und in welcher Reihenfolge. Bezeichnungen kommen aus dem Feldkatalog.",
    ),
  );

  const header = document.createElement("div");
  header.className = "schema-editor-liste-header";
  header.innerHTML = "<span></span><span>Bezeichnung</span><span>Feld</span><span>In Tabelle</span>";
  parent.append(header);

  const list = document.createElement("div");
  list.className = "schema-editor-liste-rows";

  const { configured, available } = listTableColumnLayout(draft);

  configured.forEach(({ col, hidden }, idx) => {
    list.append(renderConfiguredRow(draft, col, idx, hidden, draft.tableColumns.length, ctx));
  });

  for (const cand of available) {
    list.append(renderAvailableRow(cand, ctx));
  }

  parent.append(list);

  if (!configured.length && !available.length) {
    parent.append(hint("Keine Felder im Schema — zuerst im Tab „Feldkatalog“ anlegen."));
  }
}

function renderConfiguredRow(
  draft: DatasetSchemaDefinition,
  col: TableColumnDef,
  idx: number,
  hidden: boolean,
  colCount: number,
  ctx: ListeRenderContext,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "schema-editor-liste-row";
  if (hidden) row.classList.add("schema-editor-liste-row--hidden");

  const moves = document.createElement("div");
  moves.className = "schema-editor-liste-moves";
  moves.append(
    mkBtn("↑", idx === 0, () => {
      moveTableCol(ctx.getDraft(), idx, -1);
      ctx.rerender();
    }),
    mkBtn("↓", idx === colCount - 1, () => {
      moveTableCol(ctx.getDraft(), idx, 1);
      ctx.rerender();
    }),
  );

  const label = document.createElement("span");
  label.className = "schema-editor-toggle-label";
  label.textContent = columnDisplayLabel(draft, col);

  const keyBadge = document.createElement("span");
  keyBadge.className = "schema-editor-liste-key";
  keyBadge.textContent = `${col.fieldKey} (${col.source ?? "meta"})`;

  const visCell = document.createElement("div");
  const protectedCol = isProtectedTableColumn(col);
  if (protectedCol) {
    const tag = document.createElement("span");
    tag.className = "schema-editor-badge";
    tag.textContent = "immer sichtbar";
    visCell.append(tag);
  } else {
    visCell.append(
      toggleSwitch(!hidden, `Spalte ${label.textContent} in Tabelle`, (visible) => {
        const d = ctx.getDraft();
        const current = d.tableColumns[idx]!;
        const id = tableColumnId(current);
        const next = applyTableColumnHidden(d, id, !visible);
        ctx.setDraft(next);
        ctx.rerender();
      }),
    );
  }

  row.append(moves, label, keyBadge, visCell);
  return row;
}

function renderAvailableRow(cand: TableColumnCandidate, ctx: ListeRenderContext): HTMLElement {
  const row = document.createElement("div");
  row.className = "schema-editor-liste-row schema-editor-liste-row--available";

  const moves = document.createElement("div");
  moves.className = "schema-editor-liste-moves schema-editor-liste-moves--idle";
  const dash = document.createElement("span");
  dash.className = "schema-editor-liste-idle";
  dash.textContent = "—";
  dash.title = "Sortierbar nach Aktivierung";
  moves.append(dash);

  const label = document.createElement("span");
  label.className = "schema-editor-toggle-label";
  label.textContent = cand.label;

  const keyBadge = document.createElement("span");
  keyBadge.className = "schema-editor-liste-key";
  keyBadge.textContent = `${cand.fieldKey} (${cand.source})`;

  const visCell = document.createElement("div");
  const protoCol: TableColumnDef = {
    fieldKey: cand.fieldKey,
    label: cand.label,
    source: cand.source,
  };
  const protectedCol = isProtectedTableColumn(protoCol);
  if (protectedCol) {
    const wrap = document.createElement("div");
    wrap.className = "schema-editor-liste-vis-protected";
    const tag = document.createElement("span");
    tag.className = "schema-editor-badge";
    tag.textContent = "immer sichtbar";
    wrap.append(
      tag,
      toggleSwitch(false, `Spalte ${cand.label} in Tabelle`, (visible) => {
        if (!visible) return;
        const next = setTableColumnVisible(ctx.getDraft(), cand, true);
        ctx.setDraft(next);
        ctx.rerender();
      }),
    );
    visCell.append(wrap);
  } else {
    visCell.append(
      toggleSwitch(false, `Spalte ${cand.label} in Tabelle`, (visible) => {
        const next = setTableColumnVisible(ctx.getDraft(), cand, visible);
        ctx.setDraft(next);
        ctx.rerender();
      }),
    );
  }

  row.append(moves, label, keyBadge, visCell);
  return row;
}