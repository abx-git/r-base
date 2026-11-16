import { getDefaultSchema, resolveSchemaForDataset } from "../lib/dataset-schema-store";
import type { DatasetMeta } from "../lib/meta-schema";
import {
  getHiddenFieldKeySet,
  isOptionalSchemaField,
  orderedSchemaFieldKeys,
} from "../lib/meta-hidden-fields";
import {
  addTableColumnToSchema,
  applyTableColumnHidden,
  listTableColumnLayout,
  type TableColumnCandidate,
} from "../lib/table-layout";
import { fieldDefByKey } from "../lib/meta-field-access";
import { displayLocId } from "../lib/meta-schema";

export type LayoutModalHandlers = {
  onSetFieldHidden: (fieldKey: string, hidden: boolean) => Promise<void>;
  onSetTableColumnHidden: (columnId: string, hidden: boolean) => Promise<void>;
  onAddTableColumn: (candidate: TableColumnCandidate) => Promise<void>;
  onRerender: () => void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function openLayoutModal(
  handlers: LayoutModalHandlers,
  options?: { meta?: DatasetMeta; datasetLabel?: string },
): void {
  const backdrop = el("div", "modal-backdrop");
  const dialog = el("div", "modal modal-wide layout-modal");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Layout");

  const title = el("h2");
  title.textContent = "Layout";
  const intro = el("p", "muted layout-modal-intro");
  intro.textContent =
    "Steuert die sichtbaren Felder in der Detail-Maske (nur dieser Datensatz) und Spalten in der Tabelle (Projekt / Schema).";

  const scroll = el("div", "layout-modal-scroll");
  dialog.append(title, intro, scroll);

  const schema = options?.meta ? resolveSchemaForDataset(options.meta) : getDefaultSchema();
  const hiddenDetail = options?.meta ? getHiddenFieldKeySet(options.meta, schema) : null;

  if (options?.meta && hiddenDetail) {
    const secTitle = el("h3");
    const bez = options.meta.bezeichnung.trim() || "Datensatz";
    secTitle.textContent = `Detail-Maske — ${bez} (${displayLocId(options.meta.locId)})`;
    const hint = el("p", "muted layout-modal-hint");
    hint.textContent = "Optionale Felder können ausgeblendet werden; Pflichtfelder bleiben sichtbar.";
    scroll.append(secTitle, hint);

    const list = el("ul", "hidden-field-reveal-list layout-modal-list");
    for (const key of orderedSchemaFieldKeys(schema)) {
      const def = fieldDefByKey(schema.fields, key);
      if (!def) continue;
      const li = el("li", "hidden-field-reveal-item");
      const label = el("span", "hidden-field-reveal-label");
      label.textContent = def.label;
      if (!isOptionalSchemaField(def)) {
        const tag = el("span", "muted layout-always-tag");
        tag.textContent = "immer";
        li.append(label, tag);
      } else {
        const hidden = hiddenDetail.has(def.key);
        const btn = el("button", "btn btn-mini schema-field-visibility-btn");
        btn.type = "button";
        btn.textContent = hidden ? "Einblenden" : "Ausblenden";
        btn.addEventListener("click", () => {
          const currentlyHidden = hiddenDetail.has(def.key);
          void handlers.onSetFieldHidden(def.key, !currentlyHidden).then(() => {
            if (currentlyHidden) hiddenDetail.delete(def.key);
            else hiddenDetail.add(def.key);
            btn.textContent = hiddenDetail.has(def.key) ? "Einblenden" : "Ausblenden";
            handlers.onRerender();
          });
        });
        li.append(label, btn);
      }
      list.append(li);
    }
    scroll.append(list);
  } else {
    const note = el("p", "muted layout-modal-hint");
    note.textContent = "Detail-Maske: Datensatz in der Detailansicht öffnen, um Felder pro Datensatz anzupassen.";
    scroll.append(note);
  }

  const tableTitle = el("h3");
  tableTitle.textContent = `Tabelle — Schema „${schema.name}“`;
  const tableHint = el("p", "muted layout-modal-hint");
  tableHint.textContent =
    "Spalten in der Liste sind in der Tabelle verfügbar. Weitere Felder unten können hinzugefügt werden.";
  scroll.append(tableTitle, tableHint);

  const { configured, available } = listTableColumnLayout(schema);
  const tableList = el("ul", "hidden-field-reveal-list layout-modal-list");

  for (const row of configured) {
    const li = el("li", "hidden-field-reveal-item");
    const label = el("span", "hidden-field-reveal-label");
    label.textContent = row.col.label;
    const btn = el("button", "btn btn-mini schema-field-visibility-btn");
    btn.type = "button";
    btn.textContent = row.hidden ? "Einblenden" : "Ausblenden";
    btn.addEventListener("click", () => {
      void handlers.onSetTableColumnHidden(row.id, !row.hidden).then(() => {
        row.hidden = !row.hidden;
        btn.textContent = row.hidden ? "Einblenden" : "Ausblenden";
        handlers.onRerender();
      });
    });
    li.append(label, btn);
    tableList.append(li);
  }
  scroll.append(tableList);

  if (available.length) {
    const availTitle = el("h4", "layout-modal-sub");
    availTitle.textContent = "Noch nicht in der Tabelle";
    scroll.append(availTitle);
    const availList = el("ul", "hidden-field-reveal-list layout-modal-list");
    for (const cand of available) {
      const li = el("li", "hidden-field-reveal-item");
      const label = el("span", "hidden-field-reveal-label");
      label.textContent = `${cand.label}${cand.source === "index" ? " (Index)" : ""}`;
      const btn = el("button", "btn btn-mini");
      btn.type = "button";
      btn.textContent = "Spalte hinzufügen";
      btn.addEventListener("click", () => {
        btn.disabled = true;
        void handlers.onAddTableColumn(cand).then(() => {
          backdrop.remove();
          handlers.onRerender();
          openLayoutModal(handlers, options);
        });
      });
      li.append(label, btn);
      availList.append(li);
    }
    scroll.append(availList);
  }

  const actions = el("div", "modal-actions layout-modal-actions");
  const close = el("button", "btn btn-primary");
  close.type = "button";
  close.textContent = "Schließen";
  close.addEventListener("click", () => {
    backdrop.remove();
    handlers.onRerender();
  });
  actions.append(close);
  dialog.append(actions);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
      handlers.onRerender();
    }
  });

  backdrop.append(dialog);
  document.body.append(backdrop);
}