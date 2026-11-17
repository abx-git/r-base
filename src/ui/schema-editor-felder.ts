import type { DatasetSchemaDefinition, FieldDataType } from "../lib/dataset-schema-types";
import {
  fieldTypes,
  hint,
  mkBtn,
  moveSchemaField,
  purgeFieldFromLayout,
  purgeFieldFromTable,
  slugFieldKey,
  toggleSwitch,
} from "./schema-editor-shared";

export type FelderRenderContext = {
  draft: DatasetSchemaDefinition;
  setStatus: (msg: string) => void;
  rerender: () => void;
};

export function renderFeldkatalog(parent: HTMLElement, ctx: FelderRenderContext): void {
  const { draft, setStatus, rerender } = ctx;
  parent.replaceChildren();

  parent.append(
    hint(
      "Metafelder für Datensätze: Reihenfolge, Bezeichnung, Typ und Pflicht. Systemfeld „locId“ ist gesperrt.",
    ),
  );

  const toolbar = document.createElement("div");
  toolbar.className = "schema-editor-fields-toolbar";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "field";
  search.placeholder = "Felder suchen (Key oder Bezeichnung)…";
  search.setAttribute("aria-label", "Felder suchen");
  toolbar.append(search);
  parent.append(toolbar);

  const header = document.createElement("div");
  header.className = "schema-editor-liste-header schema-editor-grid-row--felder";
  header.innerHTML = "<span></span><span>Label</span><span>Key</span><span>Typ</span><span>Pflicht</span><span></span>";
  parent.append(header);

  const list = document.createElement("div");
  list.className = "schema-editor-liste-rows";
  parent.append(list);

  const addRow = document.createElement("div");
  addRow.className = "schema-add-row schema-editor-felder-add";
  const keyIn = document.createElement("input");
  keyIn.className = "field";
  keyIn.placeholder = "feld_key";
  const labelIn = document.createElement("input");
  labelIn.className = "field";
  labelIn.placeholder = "Bezeichnung";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn";
  addBtn.textContent = "Feld hinzufügen";
  addBtn.addEventListener("click", () => {
    const key = slugFieldKey(keyIn.value);
    if (!key || draft.fields.some((f) => f.key === key)) {
      setStatus("Ungültiger oder doppelter Feld-Key.");
      return;
    }
    draft.fields.push({
      key,
      label: labelIn.value.trim() || key,
      dataType: "string",
    });
    keyIn.value = "";
    labelIn.value = "";
    setStatus("");
    paint();
  });
  addRow.append(keyIn, labelIn, addBtn);
  parent.append(addRow);

  const filter = () => search.value.trim().toLowerCase();

  const paint = () => {
    list.replaceChildren();
    const q = filter();
    const total = draft.fields.length;
    draft.fields.forEach((field, idx) => {
      if (q && !field.key.toLowerCase().includes(q) && !field.label.toLowerCase().includes(q)) return;

      const row = document.createElement("div");
      row.className = "schema-editor-liste-row schema-editor-grid-row--felder";

      const moves = document.createElement("div");
      moves.className = "schema-editor-liste-moves";
      moves.append(
        mkBtn("↑", idx === 0, () => {
          moveSchemaField(draft, idx, -1);
          rerender();
        }),
        mkBtn("↓", idx === total - 1, () => {
          moveSchemaField(draft, idx, 1);
          rerender();
        }),
      );

      const labelCell = document.createElement("input");
      labelCell.className = "field";
      labelCell.value = field.label;
      labelCell.setAttribute("aria-label", "Feldbezeichnung");
      labelCell.addEventListener("change", () => {
        field.label = labelCell.value;
      });

      const keyBadge = document.createElement("span");
      keyBadge.className = "schema-editor-liste-key";
      keyBadge.textContent = field.key;
      keyBadge.title = field.system ? "Systemfeld (Key nicht änderbar)" : "Key wird beim Anlegen festgelegt";

      const typeCell = document.createElement("div");
      if (field.system && field.dataType === "locId") {
        const tag = document.createElement("span");
        tag.className = "schema-editor-badge";
        tag.textContent = "ID";
        typeCell.append(tag);
      } else {
        const sel = document.createElement("select");
        sel.className = "field";
        for (const dt of fieldTypes()) {
          const opt = document.createElement("option");
          opt.value = dt;
          opt.textContent = dt;
          sel.append(opt);
        }
        sel.value = field.dataType;
        sel.addEventListener("change", () => {
          field.dataType = sel.value as FieldDataType;
        });
        typeCell.append(sel);
      }

      const reqCell = document.createElement("div");
      const isLocId = field.system && field.key === "locId";
      if (isLocId) {
        const tag = document.createElement("span");
        tag.className = "schema-editor-badge";
        tag.textContent = "Pflicht";
        reqCell.append(tag);
      } else {
        reqCell.append(
          toggleSwitch(Boolean(field.constraints?.required), `${field.label} Pflichtfeld`, (on) => {
            field.constraints = { ...field.constraints, required: on };
          }),
        );
      }

      const actCell = document.createElement("div");
      actCell.className = "schema-editor-felder-act";
      if (!field.system) {
        const del = mkBtn("×", false, () => {
          draft.fields = draft.fields.filter((f) => f.key !== field.key);
          purgeFieldFromLayout(draft, field.key);
          purgeFieldFromTable(draft, field.key);
          setStatus("");
          rerender();
        });
        del.classList.add("schema-editor-container-remove");
        del.title = "Feld aus Schema entfernen";
        actCell.append(del);
      }

      row.append(moves, labelCell, keyBadge, typeCell, reqCell, actCell);
      list.append(row);
    });

    if (!list.childNodes.length) {
      list.append(hint(q ? "Keine Treffer für die Suche." : "Noch keine Felder."));
    }
  };

  search.addEventListener("input", paint);
  paint();
}