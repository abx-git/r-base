import type { DatasetMeta } from "../lib/meta-schema";
import type { DatasetSchemaDefinition, LayoutContainer } from "../lib/dataset-schema-types";
import { fieldDefByKey } from "../lib/meta-field-access";
import {
  isOptionalSchemaField,
  resolveDetailHiddenKeys,
} from "../lib/meta-hidden-fields";
import {
  FILES_LAYOUT_CONTAINER_ID,
  isFilesLayoutContainer,
  layoutHasFilesContainer,
} from "../lib/detail-layout";
import { getVisibleUnassignedDetailFieldKeys } from "../lib/field-placement-editor";
import { isDetailFieldVisibleInSchema } from "../lib/detail-field-visibility";
import {
  consolidateDetailLayout,
  DETAIL_UNPLACED_DROP_ID,
  enableDrop,
  ensureDetailLayoutRow,
  fieldChip,
  hint,
  mkBtn,
  moveContainerInRow,
  moveFieldInContainer,
  toggleSwitch,
} from "./schema-editor-shared";
import { renderDetailVisibilityList } from "./schema-editor-placement";

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

const WIDTH_PRESETS: { value: number; label: string }[] = [
  { value: 12, label: "Volle Breite" },
  { value: 6, label: "Halbe Breite (2 nebeneinander)" },
  { value: 4, label: "Ein Drittel (3 nebeneinander)" },
];

export function renderDetailformular(parent: HTMLElement, ctx: DetailRenderContext): void {
  const { draft, datasetContext, rerender } = ctx;
  consolidateDetailLayout(draft);
  const row = ensureDetailLayoutRow(draft);
  if (!row.containers.length) {
    row.containers.push({
      id: "container-meta",
      title: "",
      colSpan: 12,
      fieldKeys: [],
    });
  }

  parent.replaceChildren();

  if (datasetContext) {
    const card = document.createElement("section");
    card.className = "schema-editor-card";
    const title = document.createElement("h3");
    title.className = "schema-editor-section-title";
    title.textContent = "Ausnahme: dieser Datensatz";
    card.append(
      title,
      hint(
        "Überschreibt die Schema-Sichtbarkeit nur für diesen Datensatz — wird in meta.json gespeichert.",
      ),
    );
    const meta = datasetContext.getMeta();
    const hiddenDetail =
      meta !== undefined ? resolveDetailHiddenKeys(meta, draft) : new Set<string>();
    for (const def of draft.fields) {
      if (!isOptionalSchemaField(def)) continue;
      const toggleRow = document.createElement("div");
      toggleRow.className = "schema-editor-toggle-row";
      const label = document.createElement("span");
      label.className = "schema-editor-toggle-label";
      label.textContent = def.label;
      const isHidden = hiddenDetail.has(def.key);
      toggleRow.append(
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
      card.append(toggleRow);
    }
    parent.append(card);
  }

  const visibilityTitle = document.createElement("h3");
  visibilityTitle.className = "schema-editor-section-title";
  visibilityTitle.textContent = "Sichtbarkeit im Detail";
  parent.append(visibilityTitle);

  const visibilityPanel = document.createElement("div");
  visibilityPanel.className = "schema-editor-placement-panel";
  parent.append(visibilityPanel);
  renderDetailVisibilityList(visibilityPanel, {
    mode: "detail",
    getDraft: () => draft,
    rerender,
  });

  const layoutTitle = document.createElement("h3");
  layoutTitle.className = "schema-editor-section-title";
  layoutTitle.textContent = "Anordnung";
  parent.append(
    layoutTitle,
    hint("Nur Felder mit „Im Detail“ aktiv. Per Drag & Drop in Container ziehen oder unter „Nicht platziert“ lassen."),
  );

  const layoutWrap = document.createElement("div");
  layoutWrap.className = "schema-editor-detail-layout";

  const unplaced = document.createElement("aside");
  unplaced.className = "schema-editor-unplaced layout-pool";
  const unplacedTitle = document.createElement("strong");
  unplacedTitle.textContent = "Nicht platziert";
  unplaced.append(unplacedTitle);
  const unplacedZone = document.createElement("div");
  unplacedZone.className = "layout-dropzone layout-dropzone--compact";
  unplacedZone.dataset.containerId = DETAIL_UNPLACED_DROP_ID;
  for (const key of getVisibleUnassignedDetailFieldKeys(draft)) {
    unplacedZone.append(fieldChip(key, draft));
  }
  enableDrop(unplacedZone, draft, rerender);
  unplaced.append(unplacedZone);

  const canvas = document.createElement("div");
  canvas.className = "schema-editor-detail-canvas";
  const rowGrid = document.createElement("div");
  rowGrid.className = "layout-row-grid schema-editor-container-grid";
  for (const container of row.containers) {
    rowGrid.append(renderContainer(container, draft, row.containers, rerender));
  }
  canvas.append(rowGrid);

  const btnRow = document.createElement("div");
  btnRow.className = "schema-editor-detail-actions";
  const addCont = document.createElement("button");
  addCont.type = "button";
  addCont.className = "btn";
  addCont.textContent = "+ Feld-Container";
  addCont.addEventListener("click", () => {
    row.containers.push({
      id: `container-${Date.now()}`,
      title: "",
      colSpan: 6,
      fieldKeys: [],
    });
    rerender();
  });
  const addFiles = document.createElement("button");
  addFiles.type = "button";
  addFiles.className = "btn";
  addFiles.textContent = "+ Dateien";
  addFiles.disabled = layoutHasFilesContainer(draft);
  addFiles.title = "Upload & Miniaturvorschau (einmal pro Schema)";
  addFiles.addEventListener("click", () => {
    row.containers.push({
      id: FILES_LAYOUT_CONTAINER_ID,
      title: "Dateien",
      colSpan: 6,
      fieldKeys: [],
    });
    rerender();
  });
  btnRow.append(addCont, addFiles);
  canvas.append(btnRow);

  layoutWrap.append(unplaced, canvas);
  parent.append(layoutWrap);
}

function renderContainer(
  container: LayoutContainer,
  draft: DatasetSchemaDefinition,
  allContainers: LayoutContainer[],
  rerender: () => void,
): HTMLElement {
  if (isFilesLayoutContainer(container)) {
    return renderFilesContainerEditor(container, allContainers, rerender);
  }

  const box = document.createElement("div");
  box.className = "layout-container schema-editor-layout-container";
  box.style.gridColumn = `span ${container.colSpan ?? 12}`;

  const head = document.createElement("div");
  head.className = "schema-editor-container-head";
  const idx = allContainers.indexOf(container);
  head.append(
    mkBtn("←", idx <= 0, () => {
      moveContainerInRow(allContainers, container.id, -1);
      rerender();
    }),
    mkBtn("→", idx < 0 || idx >= allContainers.length - 1, () => {
      moveContainerInRow(allContainers, container.id, 1);
      rerender();
    }),
  );

  const titleIn = document.createElement("input");
  titleIn.className = "field";
  titleIn.placeholder = "Titel (optional)";
  titleIn.value = container.title ?? "";
  titleIn.addEventListener("change", () => {
    container.title = titleIn.value.trim();
  });

  const widthSel = document.createElement("select");
  widthSel.className = "field schema-editor-container-width";
  widthSel.title = "Breite im 12-Spalten-Raster";
  for (const p of WIDTH_PRESETS) {
    const opt = document.createElement("option");
    opt.value = String(p.value);
    opt.textContent = p.label;
    widthSel.append(opt);
  }
  const span = container.colSpan ?? 12;
  const preset = WIDTH_PRESETS.some((p) => p.value === span) ? span : 12;
  widthSel.value = String(preset);
  if (!WIDTH_PRESETS.some((p) => p.value === span) && span !== 12) {
    container.colSpan = preset;
  }
  widthSel.addEventListener("change", () => {
    container.colSpan = Number(widthSel.value) || 12;
    rerender();
  });

  const removeBtn = mkBtn("×", allContainers.length <= 1, () => {
    const idx = allContainers.indexOf(container);
    if (idx >= 0) allContainers.splice(idx, 1);
    rerender();
  });
  removeBtn.classList.add("schema-editor-container-remove");
  removeBtn.title = "Container entfernen (Felder landen bei „Nicht platziert“)";

  head.append(titleIn, widthSel, removeBtn);
  box.append(head);

  const zone = document.createElement("div");
  zone.className = "layout-dropzone layout-dropzone--compact";
  zone.dataset.containerId = container.id;
  for (const key of container.fieldKeys) {
    if (!draft.fields.some((f) => f.key === key)) continue;
    if (!isDetailFieldVisibleInSchema(draft, key)) continue;
    zone.append(renderFieldRow(key, container, draft, rerender));
  }
  enableDrop(zone, draft, rerender);
  box.append(zone);
  return box;
}

function renderFilesContainerEditor(
  container: LayoutContainer,
  allContainers: LayoutContainer[],
  rerender: () => void,
): HTMLElement {
  const box = document.createElement("div");
  box.className = "layout-container schema-editor-layout-container schema-editor-files-container";
  box.style.gridColumn = `span ${container.colSpan ?? 12}`;

  const head = document.createElement("div");
  head.className = "schema-editor-container-head";
  const idx = allContainers.indexOf(container);
  head.append(
    mkBtn("←", idx <= 0, () => {
      moveContainerInRow(allContainers, container.id, -1);
      rerender();
    }),
    mkBtn("→", idx < 0 || idx >= allContainers.length - 1, () => {
      moveContainerInRow(allContainers, container.id, 1);
      rerender();
    }),
  );

  const badge = document.createElement("span");
  badge.className = "schema-editor-badge";
  badge.textContent = "Dateien & Upload";
  head.append(badge);

  const widthSel = document.createElement("select");
  widthSel.className = "field schema-editor-container-width";
  for (const p of WIDTH_PRESETS) {
    const opt = document.createElement("option");
    opt.value = String(p.value);
    opt.textContent = p.label;
    widthSel.append(opt);
  }
  const span = container.colSpan ?? 12;
  widthSel.value = String(WIDTH_PRESETS.some((p) => p.value === span) ? span : 12);
  widthSel.addEventListener("change", () => {
    container.colSpan = Number(widthSel.value) || 12;
    rerender();
  });

  const titleIn = document.createElement("input");
  titleIn.className = "field";
  titleIn.placeholder = "Titel (optional)";
  titleIn.value = container.title ?? "Dateien";
  titleIn.addEventListener("change", () => {
    container.title = titleIn.value.trim();
  });

  const removeBtn = mkBtn("×", false, () => {
    const i = allContainers.indexOf(container);
    if (i >= 0) allContainers.splice(i, 1);
    rerender();
  });
  removeBtn.classList.add("schema-editor-container-remove");
  removeBtn.title = "Dateien-Container entfernen";
  head.append(titleIn, widthSel, removeBtn);
  box.append(head, hint("Drag & Drop, Miniaturraster und Dateiliste erscheinen hier in der Detailansicht."));
  return box;
}

function renderFieldRow(
  key: string,
  container: LayoutContainer,
  draft: DatasetSchemaDefinition,
  rerender: () => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "schema-editor-field-row";
  const idx = container.fieldKeys.indexOf(key);
  row.append(
    fieldChip(key, draft),
    mkBtn("↑", idx <= 0, () => {
      moveFieldInContainer(container, key, -1);
      rerender();
    }),
    mkBtn("↓", idx < 0 || idx >= container.fieldKeys.length - 1, () => {
      moveFieldInContainer(container, key, 1);
      rerender();
    }),
  );
  return row;
}