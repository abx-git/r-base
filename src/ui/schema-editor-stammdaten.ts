import type { DatasetSchemaDefinition } from "../lib/dataset-schema-types";
import { fieldInput, hint, slugId } from "./schema-editor-shared";

export function renderStammdaten(
  parent: HTMLElement,
  draft: DatasetSchemaDefinition,
): void {
  parent.replaceChildren();
  parent.append(
    hint("Grunddaten für dieses Schema. Neue Datensätze mit Standard-Schema nutzen das ID-Präfix für Lox-IDs."),
  );

  const grid = document.createElement("div");
  grid.className = "schema-editor-stammdaten-grid";

  grid.append(
    fieldInput("Anzeigename", draft.name, true, (v) => {
      draft.name = v;
    }),
    fieldInput("ID-Präfix (Lox)", draft.loxPrefix, true, (v) => {
      draft.loxPrefix = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    }),
    fieldInput("Meta-Version", String(draft.metaVersion), true, (v) => {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1) draft.metaVersion = Math.floor(n);
    }),
  );

  const advanced = document.createElement("details");
  advanced.className = "schema-editor-advanced";
  advanced.open = !draft.builtin;
  const summary = document.createElement("summary");
  summary.textContent = "Technische Schema-ID";
  const idRow = fieldInput("Schema-ID", draft.id, !draft.builtin, (v) => {
    draft.id = slugId(v);
  });
  advanced.append(summary, idRow, hint("Nur ändern, wenn Sie wissen, wie bestehende Datensätze verknüpft sind."));
  grid.append(advanced);

  parent.append(grid);
  parent.append(
    hint(`Beispiel-ID: ${draft.loxPrefix || "RUD"}-XXXX-XXXX für neue Datensätze mit diesem Schema.`),
  );
}