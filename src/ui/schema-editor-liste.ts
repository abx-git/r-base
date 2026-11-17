import type { DatasetSchemaDefinition } from "../lib/dataset-schema-types";
import { hint } from "./schema-editor-shared";
import { renderFieldPlacementList } from "./schema-editor-placement";

export type ListeRenderContext = {
  getDraft: () => DatasetSchemaDefinition;
  setDraft: (next: DatasetSchemaDefinition) => void;
  rerender: () => void;
};

export function renderListenansicht(parent: HTMLElement, ctx: ListeRenderContext): void {
  parent.replaceChildren();
  parent.append(
    hint(
      "Alle Felder aus dem Feldkatalog (plus optionale Index-Spalten): Sichtbarkeit in der Datensatz-Liste und Spalten-Reihenfolge.",
    ),
  );

  const panel = document.createElement("div");
  panel.className = "schema-editor-placement-panel";
  parent.append(panel);

  renderFieldPlacementList(panel, {
    mode: "liste",
    getDraft: ctx.getDraft,
    setDraft: ctx.setDraft,
    rerender: ctx.rerender,
  });
}