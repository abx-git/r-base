import type { DatasetSchemaDefinition, LayoutContainer } from "../lib/dataset-schema-types";
import {
  FILES_LAYOUT_CONTAINER_ID,
  isFilesLayoutContainer,
} from "../lib/detail-layout";
import { exportLayoutHasFilesContainer } from "../lib/export-layout";
import { getVisibleUnassignedExportFieldKeys } from "../lib/export-placement-editor";
import { isExportFieldVisibleInSchema } from "../lib/export-field-visibility";
import {
  consolidateExportLayout,
  enableExportDrop,
  ensureExportLayoutRow,
  EXPORT_UNPLACED_DROP_ID,
  fieldChip,
  hint,
  mkBtn,
  moveContainerInRow,
  moveFieldInContainer,
} from "./schema-editor-shared";
import { renderFieldPlacementList } from "./schema-editor-placement";

export type ExportRenderContext = {
  draft: DatasetSchemaDefinition;
  rerender: () => void;
};

const WIDTH_PRESETS: { value: number; label: string }[] = [
  { value: 12, label: "Volle Breite" },
  { value: 6, label: "Halbe Breite (2 nebeneinander)" },
  { value: 4, label: "Ein Drittel (3 nebeneinander)" },
];

export function renderExportformular(parent: HTMLElement, ctx: ExportRenderContext): void {
  const { draft, rerender } = ctx;
  consolidateExportLayout(draft);
  const row = ensureExportLayoutRow(draft);
  if (!row.containers.length) {
    row.containers.push({
      id: "container-meta",
      title: "",
      colSpan: 12,
      fieldKeys: [],
    });
  }

  parent.replaceChildren();

  const syncRow = document.createElement("div");
  syncRow.className = "schema-editor-detail-actions";
  const syncBtn = document.createElement("button");
  syncBtn.type = "button";
  syncBtn.className = "btn";
  syncBtn.textContent = "Vom Detailformular übernehmen";
  syncBtn.title = "Kopiert Layout und Sichtbarkeit aus dem Tab „Detailformular“";
  syncBtn.addEventListener("click", () => {
    draft.exportLayout = structuredClone(draft.layout);
    if (draft.defaultHiddenDetailFieldKeys?.length) {
      draft.defaultHiddenExportFieldKeys = [...draft.defaultHiddenDetailFieldKeys];
    } else {
      delete draft.defaultHiddenExportFieldKeys;
    }
    rerender();
  });
  syncRow.append(syncBtn);
  parent.append(syncRow, hint("Steuert den Schema-PDF-Export: welche Felder und Bilder pro Datensatz erscheinen."));

  const visibilityTitle = document.createElement("h3");
  visibilityTitle.className = "schema-editor-section-title";
  visibilityTitle.textContent = "Sichtbarkeit im Export";
  parent.append(visibilityTitle);

  const visibilityPanel = document.createElement("div");
  visibilityPanel.className = "schema-editor-placement-panel";
  parent.append(visibilityPanel);
  renderFieldPlacementList(visibilityPanel, {
    mode: "export",
    getDraft: () => draft,
    rerender,
  });

  const layoutTitle = document.createElement("h3");
  layoutTitle.className = "schema-editor-section-title";
  layoutTitle.textContent = "Anordnung";
  parent.append(
    layoutTitle,
    hint(
      "Nur Felder mit „Im Export“ aktiv. Container „Bilder“ bindet Fotos des Datensatzes ein. Felder per Drag & Drop zuordnen.",
    ),
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
  unplacedZone.dataset.containerId = EXPORT_UNPLACED_DROP_ID;
  for (const key of getVisibleUnassignedExportFieldKeys(draft)) {
    unplacedZone.append(fieldChip(key, draft));
  }
  enableExportDrop(unplacedZone, draft, rerender);
  unplaced.append(unplacedZone);

  const canvas = document.createElement("div");
  canvas.className = "schema-editor-detail-canvas";
  const rowGrid = document.createElement("div");
  rowGrid.className = "layout-row-grid schema-editor-container-grid";
  for (const container of row.containers) {
    rowGrid.append(renderExportContainer(container, draft, row.containers, rerender));
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
      id: `export-container-${Date.now()}`,
      title: "",
      colSpan: 6,
      fieldKeys: [],
    });
    rerender();
  });
  const addFiles = document.createElement("button");
  addFiles.type = "button";
  addFiles.className = "btn";
  addFiles.textContent = "+ Bilder";
  addFiles.disabled = exportLayoutHasFilesContainer(draft);
  addFiles.title = "Fotos des Datensatzes im PDF (einmal pro Export-Schema)";
  addFiles.addEventListener("click", () => {
    row.containers.push({
      id: FILES_LAYOUT_CONTAINER_ID,
      title: "Bilder",
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

function renderExportContainer(
  container: LayoutContainer,
  draft: DatasetSchemaDefinition,
  allContainers: LayoutContainer[],
  rerender: () => void,
): HTMLElement {
  if (isFilesLayoutContainer(container)) {
    return renderExportFilesContainerEditor(container, allContainers, rerender);
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

  const removeBtn = mkBtn("×", allContainers.length <= 1, () => {
    const i = allContainers.indexOf(container);
    if (i >= 0) allContainers.splice(i, 1);
    rerender();
  });
  removeBtn.classList.add("schema-editor-container-remove");
  removeBtn.title = "Container entfernen";

  head.append(titleIn, widthSel, removeBtn);
  box.append(head);

  const zone = document.createElement("div");
  zone.className = "layout-dropzone layout-dropzone--compact";
  zone.dataset.containerId = container.id;
  for (const key of container.fieldKeys) {
    if (!draft.fields.some((f) => f.key === key)) continue;
    if (!isExportFieldVisibleInSchema(draft, key)) continue;
    zone.append(renderFieldRow(key, container, draft, rerender));
  }
  enableExportDrop(zone, draft, rerender);
  box.append(zone);
  return box;
}

function renderExportFilesContainerEditor(
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
  badge.textContent = "Bilder im PDF";
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
  titleIn.value = container.title ?? "Bilder";
  titleIn.addEventListener("change", () => {
    container.title = titleIn.value.trim();
  });

  const removeBtn = mkBtn("×", false, () => {
    const i = allContainers.indexOf(container);
    if (i >= 0) allContainers.splice(i, 1);
    rerender();
  });
  removeBtn.classList.add("schema-editor-container-remove");
  head.append(titleIn, widthSel, removeBtn);
  box.append(
    head,
    hint("Alle Bilddateien des Datensatz-Ordners werden im PDF eingebettet (Raster entsprechend der Breite)."),
  );
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