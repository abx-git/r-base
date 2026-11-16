import type { DatasetSchemaDefinition, FieldDataType } from "../lib/dataset-schema-types";
import {
  fieldTypes,
  mkBtn,
  purgeFieldFromLayout,
  purgeFieldFromTable,
  slugFieldKey,
} from "./schema-editor-shared";

export type FelderRenderContext = {
  draft: DatasetSchemaDefinition;
  setStatus: (msg: string) => void;
  rerender: () => void;
};

export function renderFeldkatalog(parent: HTMLElement, ctx: FelderRenderContext): void {
  const { draft, setStatus, rerender } = ctx;
  parent.replaceChildren();

  const toolbar = document.createElement("div");
  toolbar.className = "schema-editor-fields-toolbar";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "field";
  search.placeholder = "Felder suchen (Key oder Bezeichnung)…";
  search.setAttribute("aria-label", "Felder suchen");
  toolbar.append(search);
  parent.append(toolbar);

  const scroll = document.createElement("div");
  scroll.className = "schema-editor-fields-scroll";
  const table = document.createElement("table");
  table.className = "schema-mini-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Key</th><th>Label</th><th>Typ</th><th>Pflicht</th><th></th></tr>`;
  const tbody = document.createElement("tbody");
  table.append(thead, tbody);
  scroll.append(table);
  parent.append(scroll);

  const addRow = document.createElement("div");
  addRow.className = "schema-add-row";
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
    rerender();
  });
  addRow.append(keyIn, labelIn, addBtn);
  parent.append(addRow);

  const filter = () => search.value.trim().toLowerCase();

  const paint = () => {
    tbody.replaceChildren();
    const q = filter();
    for (const field of draft.fields) {
      if (q && !field.key.toLowerCase().includes(q) && !field.label.toLowerCase().includes(q)) continue;
      const tr = document.createElement("tr");
      const keyTd = document.createElement("td");
      keyTd.textContent = field.key;
      const labelTd = document.createElement("td");
      const labelInput = document.createElement("input");
      labelInput.className = "field";
      labelInput.value = field.label;
      labelInput.addEventListener("change", () => {
        field.label = labelInput.value;
      });
      labelTd.append(labelInput);
      const typeTd = document.createElement("td");
      if (field.system && field.dataType === "locId") {
        typeTd.textContent = "ID";
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
        typeTd.append(sel);
      }
      const reqTd = document.createElement("td");
      const req = document.createElement("input");
      req.type = "checkbox";
      req.checked = Boolean(field.constraints?.required);
      req.disabled = Boolean(field.system && field.key === "locId");
      req.addEventListener("change", () => {
        field.constraints = { ...field.constraints, required: req.checked };
      });
      reqTd.append(req);
      const actTd = document.createElement("td");
      if (!field.system) {
        const del = mkBtn("Entfernen", false, () => {
          draft.fields = draft.fields.filter((f) => f.key !== field.key);
          purgeFieldFromLayout(draft, field.key);
          purgeFieldFromTable(draft, field.key);
          rerender();
        });
        del.classList.add("btn-danger");
        actTd.append(del);
      }
      tr.append(keyTd, labelTd, typeTd, reqTd, actTd);
      tbody.append(tr);
    }
  };

  search.addEventListener("input", paint);
  paint();
}