import type { DatasetSchemaDefinition } from "../lib/dataset-schema-types";
import { hint } from "./schema-editor-shared";
import { renderFieldPlacementList } from "./schema-editor-placement";

export type ExcelRenderContext = {
  getDraft: () => DatasetSchemaDefinition;
  setDraft: (next: DatasetSchemaDefinition) => void;
  rerender: () => void;
};

export function renderExcelExportTab(parent: HTMLElement, ctx: ExcelRenderContext): void {
  parent.replaceChildren();
  parent.append(
    hint(
      "Spalten und Reihenfolge für den Metadaten-Export (.xlsx). Unabhängig von der Listenansicht — Kopfzeilen entsprechen den Spaltenbezeichnungen hier.",
    ),
  );

  const panel = document.createElement("div");
  panel.className = "schema-editor-placement-panel";
  parent.append(panel);

  renderFieldPlacementList(panel, {
    mode: "excel",
    getDraft: ctx.getDraft,
    setDraft: ctx.setDraft,
    rerender: ctx.rerender,
  });
}