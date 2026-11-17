import { syncTableColumnsWithFieldCatalog } from "../lib/field-placement-editor";
import { persistSchemaDefinition } from "../lib/schema-editor-persist";
import type { DatasetSchemaDefinition, FieldDataType } from "../lib/dataset-schema-types";
import {
  fieldTypes,
  hint,
  purgeFieldFromLayout,
  purgeFieldFromTable,
  slugFieldKey,
  toggleSwitch,
} from "./schema-editor-shared";

export type FelderRenderContext = {
  draft: DatasetSchemaDefinition;
  setStatus: (msg: string) => void;
  rerender: () => void;
  onSchemaPersisted?: (saved: DatasetSchemaDefinition) => void;
};

export function renderFeldkatalog(parent: HTMLElement, ctx: FelderRenderContext): void {
  const { draft, setStatus, rerender, onSchemaPersisted } = ctx;

  const persistFeldkatalog = () => {
    const err = persistSchemaDefinition(draft);
    if (err) {
      setStatus(err);
      return false;
    }
    onSchemaPersisted?.(structuredClone(draft));
    setStatus("");
    return true;
  };
  parent.replaceChildren();

  parent.append(
    hint("Definition der Metafelder: Bezeichnung, Key, Datentyp und Pflicht. Listen- und Detail-Ansicht konfigurierst du in den anderen Tabs."),
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
  header.innerHTML = "<span>Label</span><span>Key</span><span>Typ</span><span>Pflicht</span>";
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
    syncTableColumnsWithFieldCatalog(draft);
    keyIn.value = "";
    labelIn.value = "";
    if (!persistFeldkatalog()) return;
    paint();
  });
  addRow.append(keyIn, labelIn, addBtn);
  parent.append(addRow);

  const filter = () => search.value.trim().toLowerCase();

  const paint = () => {
    list.replaceChildren();
    const q = filter();
    draft.fields.forEach((field) => {
      if (q && !field.key.toLowerCase().includes(q) && !field.label.toLowerCase().includes(q)) return;

      const row = document.createElement("div");
      row.className = "schema-editor-liste-row schema-editor-grid-row--felder";

      const labelCell = document.createElement("input");
      labelCell.className = "field";
      labelCell.value = field.label;
      labelCell.setAttribute("aria-label", "Feldbezeichnung");
      labelCell.addEventListener("change", () => {
        field.label = labelCell.value;
        for (const col of draft.tableColumns) {
          if (col.fieldKey === field.key && col.source !== "index") col.label = field.label;
        }
      });

      const keyWrap = document.createElement("div");
      keyWrap.className = "schema-editor-feld-key-wrap";
      const keyBadge = document.createElement("span");
      keyBadge.className = "schema-editor-liste-key";
      keyBadge.textContent = field.key;
      keyWrap.append(keyBadge);
      if (!field.system) {
        const rem = document.createElement("button");
        rem.type = "button";
        rem.className = "link-btn schema-editor-feld-remove";
        rem.textContent = "entfernen";
        rem.addEventListener("click", () => {
          draft.fields = draft.fields.filter((f) => f.key !== field.key);
          purgeFieldFromLayout(draft, field.key);
          purgeFieldFromTable(draft, field.key);
          if (!persistFeldkatalog()) return;
          rerender();
        });
        keyWrap.append(rem);
      }

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
        sel.disabled = Boolean(field.system);
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
      } else if (field.system) {
        const tag = document.createElement("span");
        tag.className = "schema-editor-badge";
        tag.textContent = field.constraints?.required ? "Pflicht" : "—";
        reqCell.append(tag);
      } else {
        reqCell.append(
          toggleSwitch(Boolean(field.constraints?.required), `${field.label} Pflichtfeld`, (on) => {
            field.constraints = { ...field.constraints, required: on };
          }),
        );
      }

      row.append(labelCell, keyWrap, typeCell, reqCell);
      list.append(row);
    });

    if (!list.childNodes.length) {
      list.append(hint(q ? "Keine Treffer für die Suche." : "Noch keine Felder."));
    }
  };

  search.addEventListener("input", paint);
  paint();
}