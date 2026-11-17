import type { DatasetSchemaDefinition } from "../lib/dataset-schema-types";
import {
  addTableColumnToSchema,
  applyTableColumnHidden,
  isProtectedTableColumn,
  listTableColumnLayout,
  tableColumnId,
  type TableColumnCandidate,
} from "../lib/table-layout";
import { columnKeyOptions, hint, mkBtn, moveTableCol, toggleSwitch } from "./schema-editor-shared";

export type ListeRenderContext = {
  getDraft: () => DatasetSchemaDefinition;
  setDraft: (next: DatasetSchemaDefinition) => void;
  rerender: () => void;
};

export function renderListenansicht(parent: HTMLElement, ctx: ListeRenderContext): void {
  const draft = ctx.getDraft();
  parent.replaceChildren();
  parent.append(
    hint("Spalten der Datensatz-Tabelle: Reihenfolge, Beschriftung und ob die Spalte sichtbar ist."),
  );

  const header = document.createElement("div");
  header.className = "schema-editor-liste-header";
  header.innerHTML = "<span></span><span>Label</span><span>Feld</span><span>Sichtbar</span><span></span>";
  parent.append(header);

  const list = document.createElement("div");
  list.className = "schema-editor-liste-rows";

  draft.tableColumns.forEach((col, idx) => {
    const colId = tableColumnId(col);
    const hidden = new Set(draft.hiddenTableColumnKeys ?? []).has(colId);

    const row = document.createElement("div");
    row.className = "schema-editor-liste-row";

    const moves = document.createElement("div");
    moves.className = "schema-editor-liste-moves";
    moves.append(
      mkBtn("↑", idx === 0, () => {
        moveTableCol(ctx.getDraft(), idx, -1);
        ctx.rerender();
      }),
      mkBtn("↓", idx === draft.tableColumns.length - 1, () => {
        moveTableCol(ctx.getDraft(), idx, 1);
        ctx.rerender();
      }),
    );

    const labelIn = document.createElement("input");
    labelIn.className = "field";
    labelIn.value = col.label;
    labelIn.setAttribute("aria-label", "Spaltenlabel");
    labelIn.addEventListener("change", () => {
      col.label = labelIn.value;
    });

    const keySel = document.createElement("select");
    keySel.className = "field";
    for (const opt of columnKeyOptions(draft)) {
      const o = document.createElement("option");
      o.value = opt.key;
      o.textContent = `${opt.key} (${opt.source})`;
      keySel.append(o);
    }
    keySel.value = col.fieldKey;
    keySel.addEventListener("change", () => {
      const d = ctx.getDraft();
      const current = d.tableColumns[idx]!;
      const oldId = tableColumnId(current);
      const pick = columnKeyOptions(d).find((o) => o.key === keySel.value);
      current.fieldKey = keySel.value;
      current.source = pick?.source ?? "meta";
      const newId = tableColumnId(current);
      if (oldId !== newId && d.hiddenTableColumnKeys?.length) {
        const hid = new Set(d.hiddenTableColumnKeys);
        if (hid.has(oldId)) {
          hid.delete(oldId);
          hid.add(newId);
        }
        if (hid.size) d.hiddenTableColumnKeys = [...hid];
        else delete d.hiddenTableColumnKeys;
      }
      ctx.rerender();
    });

    const visCell = document.createElement("div");
    const protectedCol = isProtectedTableColumn(col);
    if (protectedCol) {
      const tag = document.createElement("span");
      tag.className = "schema-editor-badge";
      tag.textContent = "immer sichtbar";
      visCell.append(tag);
    } else {
      visCell.append(
        toggleSwitch(!hidden, `Spalte ${col.label} sichtbar`, (visible) => {
          const d = ctx.getDraft();
          const current = d.tableColumns[idx]!;
          const id = tableColumnId(current);
          const next = applyTableColumnHidden(d, id, !visible);
          ctx.setDraft(next);
          ctx.rerender();
        }),
      );
    }

    const del = mkBtn("×", false, () => {
      const d = ctx.getDraft();
      d.tableColumns.splice(idx, 1);
      const hid = new Set(d.hiddenTableColumnKeys ?? []);
      hid.delete(colId);
      if (hid.size) d.hiddenTableColumnKeys = [...hid];
      else delete d.hiddenTableColumnKeys;
      ctx.rerender();
    });
    del.title = "Spalte entfernen";

    row.append(moves, labelIn, keySel, visCell, del);
    list.append(row);
  });

  parent.append(list);

  const addRow = document.createElement("div");
  addRow.className = "schema-add-row";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn";
  addBtn.textContent = "Leere Spalte hinzufügen";
  addBtn.addEventListener("click", () => {
    ctx.getDraft().tableColumns.push({ fieldKey: "bezeichnung", label: "Neu", source: "meta" });
    ctx.rerender();
  });
  addRow.append(addBtn);
  parent.append(addRow);

  const { available } = listTableColumnLayout(draft);
  if (available.length) {
    const title = document.createElement("h3");
    title.className = "schema-editor-section-title";
    title.textContent = "Noch nicht als Spalte";
    parent.append(title);

    for (const cand of available) {
      const row = document.createElement("div");
      row.className = "schema-editor-candidate-row";
      const label = document.createElement("span");
      label.className = "schema-editor-toggle-label";
      label.textContent = `${cand.label}${cand.source === "index" ? " (Index)" : ""}`;
      const add = document.createElement("button");
      add.type = "button";
      add.className = "btn";
      add.textContent = "+ Spalte";
      add.addEventListener("click", () => {
        const next = addTableColumnToSchema(ctx.getDraft(), cand as TableColumnCandidate);
        ctx.setDraft(next);
        ctx.rerender();
      });
      row.append(label, add);
      parent.append(row);
    }
  }
}