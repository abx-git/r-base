import type { DatasetMeta } from "../lib/meta-schema";
import type { DatasetSchemaDefinition, LayoutContainer } from "../lib/dataset-schema-types";
import { fieldDefByKey } from "../lib/meta-field-access";
import {
  getHiddenFieldKeySet,
  isOptionalSchemaField,
  orderedSchemaFieldKeys,
  resolveDetailHiddenKeys,
} from "../lib/meta-hidden-fields";
import {
  enableDrop,
  fieldChip,
  hint,
  mkBtn,
  toggleDraftDetailDefaultHidden,
  toggleSwitch,
  unassignedFieldKeys,
} from "./schema-editor-shared";

export type DetailRenderContext = {
  draft: DatasetSchemaDefinition;
  datasetContext?: {
    locId: string;
    getMeta: () => DatasetMeta | undefined;
    onSetFieldHidden: (
      fieldKey: string,
      hidden: boolean,
      schema: DatasetSchemaDefinition,
    ) => Promise<void>;
    onRerender: () => void;
  };
  rerender: () => void;
};

export function renderDetailformular(parent: HTMLElement, ctx: DetailRenderContext): void {
  const { draft, datasetContext, rerender } = ctx;
  parent.replaceChildren();

  if (datasetContext) {
    const card = document.createElement("section");
    card.className = "schema-editor-card";
    const title = document.createElement("h3");
    title.className = "schema-editor-section-title";
    title.textContent = "Nur dieser Datensatz";
    card.append(
      title,
      hint("Überschreibt die Schema-Vorgabe in der Detailansicht — wird in meta.json gespeichert."),
    );
    const meta = datasetContext.getMeta();
    const hiddenDetail =
      meta !== undefined ? resolveDetailHiddenKeys(meta, draft) : new Set<string>();
    for (const key of orderedSchemaFieldKeys(draft)) {
      const def = fieldDefByKey(draft.fields, key);
      if (!def || !isOptionalSchemaField(def)) continue;
      const row = document.createElement("div");
      row.className = "schema-editor-toggle-row";
      const label = document.createElement("span");
      label.className = "schema-editor-toggle-label";
      label.textContent = def.label;
      const isHidden = hiddenDetail.has(def.key);
      row.append(
        label,
        toggleSwitch(!isHidden, `${def.label} im Detail anzeigen`, (visible) => {
          const latestMeta = datasetContext.getMeta();
          if (!latestMeta) return;
          void datasetContext.onSetFieldHidden(def.key, !visible, draft).then(() => {
            datasetContext.onRerender();
            rerender();
          });
        }),
      );
      card.append(row);
    }
    parent.append(card);
  }

  parent.append(
    hint("Felder in Abschnitte ziehen. Die Reihenfolge entspricht der Detailansicht im Hauptfenster."),
  );

  const layoutWrap = document.createElement("div");
  layoutWrap.className = "schema-editor-detail-layout";

  const pool = document.createElement("aside");
  pool.className = "schema-editor-layout-pool layout-pool";
  const poolTitle = document.createElement("strong");
  poolTitle.textContent = "Nicht platziert";
  pool.append(poolTitle);
  const poolZone = document.createElement("div");
  poolZone.className = "layout-dropzone";
  poolZone.dataset.containerId = "__pool__";
  for (const key of unassignedFieldKeys(draft)) {
    poolZone.append(fieldChip(key, draft));
  }
  enableDrop(poolZone, draft, rerender);
  pool.append(poolZone);

  const canvas = document.createElement("div");
  canvas.className = "layout-canvas";
  draft.layout.forEach((row, rowIndex) => {
    const acc = document.createElement("details");
    acc.className = "schema-editor-accordion";
    acc.open = rowIndex === 0;
    const summary = document.createElement("summary");
    summary.textContent = `Abschnitt ${rowIndex + 1}`;
    const addCont = document.createElement("button");
    addCont.type = "button";
    addCont.className = "btn";
    addCont.textContent = "+ Container";
    addCont.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.containers.push({
        id: `container-${Date.now()}`,
        title: "Container",
        colSpan: 12,
        fieldKeys: [],
      });
      rerender();
    });
    summary.append(addCont);

    const body = document.createElement("div");
    body.className = "schema-editor-accordion-body";
    const rowGrid = document.createElement("div");
    rowGrid.className = "layout-row-grid";
    for (const container of row.containers) {
      rowGrid.append(renderContainer(container, draft, rerender));
    }
    body.append(rowGrid);
    acc.append(summary, body);
    canvas.append(acc);
  });

  const addRowBtn = document.createElement("button");
  addRowBtn.type = "button";
  addRowBtn.className = "btn";
  addRowBtn.textContent = "+ Abschnitt";
  addRowBtn.addEventListener("click", () => {
    draft.layout.push({
      id: `row-${Date.now()}`,
      containers: [{ id: `container-${Date.now()}`, title: "Neu", colSpan: 12, fieldKeys: [] }],
    });
    rerender();
  });

  layoutWrap.append(pool, canvas);
  parent.append(layoutWrap, addRowBtn);

  const defaultsTitle = document.createElement("h3");
  defaultsTitle.className = "schema-editor-section-title";
  defaultsTitle.textContent = "Standard: ausgeblendete Detailfelder";
  parent.append(
    defaultsTitle,
    hint("Gilt für neue Datensätze und Imports, sofern der Datensatz nichts anderes festlegt."),
  );

    const hiddenDefaults = new Set(draft.defaultHiddenDetailFieldKeys ?? []);
    const defaultsList = document.createElement("div");
    defaultsList.className = "schema-editor-defaults-list";
    for (const key of orderedSchemaFieldKeys(draft)) {
      const def = fieldDefByKey(draft.fields, key);
      if (!def) continue;
      const row = document.createElement("div");
      row.className = "schema-editor-toggle-row";
      const label = document.createElement("span");
      label.className = "schema-editor-toggle-label";
      label.textContent = def.label;
      if (!isOptionalSchemaField(def)) {
        const badge = document.createElement("span");
        badge.className = "schema-editor-badge";
        badge.textContent = "immer sichtbar";
        row.append(label, badge);
      } else {
        const isHidden = hiddenDefaults.has(def.key);
        const fieldKey = def.key;
        row.append(
          label,
          toggleSwitch(!isHidden, `${def.label} standardmäßig anzeigen`, (visible) => {
            toggleDraftDetailDefaultHidden(draft, fieldKey, !visible);
            rerender();
          }),
        );
      }
      defaultsList.append(row);
    }
    parent.append(defaultsList);
}

function renderContainer(
  container: LayoutContainer,
  draft: DatasetSchemaDefinition,
  rerender: () => void,
): HTMLElement {
  const box = document.createElement("div");
  box.className = "layout-container";
  box.style.gridColumn = `span ${container.colSpan ?? 12}`;
  const head = document.createElement("div");
  head.className = "schema-editor-container-head";
  const titleIn = document.createElement("input");
  titleIn.className = "field";
  titleIn.placeholder = "Titel";
  titleIn.value = container.title ?? "";
  titleIn.addEventListener("change", () => {
    container.title = titleIn.value;
  });
  const spanIn = document.createElement("input");
  spanIn.className = "field schema-editor-container-span";
  spanIn.type = "number";
  spanIn.min = "1";
  spanIn.max = "12";
  spanIn.value = String(container.colSpan ?? 12);
  spanIn.title = "Breite (1–12)";
  spanIn.setAttribute("aria-label", "Container-Breite");
  spanIn.addEventListener("change", () => {
    const n = Number(spanIn.value);
    container.colSpan = Number.isFinite(n) ? Math.min(12, Math.max(1, Math.floor(n))) : 12;
    rerender();
  });
  head.append(titleIn, spanIn);
  box.append(head);
  const zone = document.createElement("div");
  zone.className = "layout-dropzone";
  zone.dataset.containerId = container.id;
  for (const key of container.fieldKeys) {
    if (draft.fields.some((f) => f.key === key)) zone.append(fieldChip(key, draft));
  }
  enableDrop(zone, draft, rerender);
  box.append(zone);
  return box;
}