import { getSchemaById, upsertSchemaDefinition } from "../lib/dataset-schema-store";
import type {
  DatasetSchemaDefinition,
  FieldDataType,
  LayoutContainer,
  LayoutRow,
  SchemaFieldDef,
  TableColumnDef,
} from "../lib/dataset-schema-types";
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

type TabId = "general" | "fields" | "table" | "layout" | "visibility";

export type SchemaEditorOpenOptions = {
  initialTab?: TabId;
  datasetContext?: {
    meta: DatasetMeta;
    onSetFieldHidden: (fieldKey: string, hidden: boolean) => Promise<void>;
    onRerender: () => void;
  };
};

export function openSchemaEditorModal(
  schemaId: string,
  onSaved: () => void,
  options?: SchemaEditorOpenOptions,
): void {
  const existing = getSchemaById(schemaId);
  if (!existing) return;
  let draft = structuredClone(existing);
  let tab: TabId = options?.initialTab ?? "general";

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "modal modal-xl";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Schema bearbeiten");

  const tabBar = document.createElement("div");
  tabBar.className = "schema-tabs";
  const body = document.createElement("div");
  body.className = "schema-editor-body";
  const status = document.createElement("p");
  status.className = "modal-status muted";

  const tabs: { id: TabId; label: string }[] = [
    { id: "general", label: "Allgemein" },
    { id: "fields", label: "Felder" },
    { id: "table", label: "Tabelle" },
    { id: "layout", label: "Layout" },
    { id: "visibility", label: "Sichtbarkeit" },
  ];

  function setTab(next: TabId) {
    tab = next;
    render();
  }

  function renderTabs() {
    tabBar.replaceChildren();
    for (const t of tabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn schema-tab${tab === t.id ? " is-active" : ""}`;
      btn.textContent = t.label;
      btn.addEventListener("click", () => setTab(t.id));
      tabBar.append(btn);
    }
  }

  function renderGeneral() {
    body.replaceChildren();
    const idRow = fieldInput("Technische ID", draft.id, !draft.builtin, (v) => {
      draft.id = slugId(v);
    });
    const nameRow = fieldInput("Anzeigename", draft.name, true, (v) => {
      draft.name = v;
    });
    const prefixRow = fieldInput("Lox-Prefix", draft.loxPrefix, true, (v) => {
      draft.loxPrefix = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    });
    const verRow = fieldInput("meta.json schemaVersion", String(draft.metaVersion), true, (v) => {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1) draft.metaVersion = Math.floor(n);
    });
    body.append(idRow, nameRow, prefixRow, verRow);
    body.append(
      hint(
        "Das Lox-Prefix gehört zu diesem Schema: neue Datensätze mit Standard-Schema erhalten IDs wie RUD-XXXX-XXXX.",
      ),
    );
  }

  function renderFields() {
    body.replaceChildren();
    const table = document.createElement("table");
    table.className = "schema-mini-table";
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>Key</th><th>Label</th><th>Typ</th><th>Pflicht</th><th></th></tr>`;
    const tbody = document.createElement("tbody");
    for (const field of draft.fields) {
      const tr = document.createElement("tr");
      const keyTd = document.createElement("td");
      keyTd.textContent = field.key;
      const labelTd = document.createElement("td");
      const labelIn = document.createElement("input");
      labelIn.className = "field";
      labelIn.value = field.label;
      labelIn.addEventListener("change", () => {
        field.label = labelIn.value;
      });
      labelTd.append(labelIn);
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
      req.disabled = field.system && field.key === "locId";
      req.addEventListener("change", () => {
        field.constraints = { ...field.constraints, required: req.checked };
      });
      reqTd.append(req);
      const actTd = document.createElement("td");
      if (!field.system) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn";
        del.textContent = "×";
        del.addEventListener("click", () => {
          draft.fields = draft.fields.filter((f) => f.key !== field.key);
          purgeFieldFromLayout(draft, field.key);
          purgeFieldFromTable(draft, field.key);
          render();
        });
        actTd.append(del);
      }
      tr.append(keyTd, labelTd, typeTd, reqTd, actTd);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    body.append(table);

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
        status.textContent = "Ungültiger oder doppelter Key.";
        return;
      }
      draft.fields.push({
        key,
        label: labelIn.value.trim() || key,
        dataType: "string",
      });
      keyIn.value = "";
      labelIn.value = "";
      status.textContent = "";
      render();
    });
    addRow.append(keyIn, labelIn, addBtn);
    body.append(addRow);
  }

  function renderTable() {
    body.replaceChildren();
    const list = document.createElement("div");
    list.className = "schema-col-list";
    draft.tableColumns.forEach((col, idx) => {
      const row = document.createElement("div");
      row.className = "schema-col-row";
      const labelIn = document.createElement("input");
      labelIn.className = "field";
      labelIn.value = col.label;
      labelIn.addEventListener("change", () => {
        col.label = labelIn.value;
      });
      const keySel = document.createElement("select");
      keySel.className = "field";
      for (const opt of columnKeyOptions(draft)) {
        const o = document.createElement("option");
        o.value = opt.key;
        o.textContent = `${opt.key} (${opt.source})`;
        keySel.append(o);
      }
      keySel.value = col.fieldKey;
      keySel.addEventListener("change", () => {
        const pick = columnKeyOptions(draft).find((o) => o.key === keySel.value);
        col.fieldKey = keySel.value;
        col.source = pick?.source ?? "meta";
      });
      const up = mkBtn("↑", idx === 0, () => moveTableCol(draft, idx, -1));
      const down = mkBtn("↓", idx === draft.tableColumns.length - 1, () => moveTableCol(draft, idx, 1));
      const del = mkBtn("×", false, () => {
        draft.tableColumns.splice(idx, 1);
        render();
      });
      row.append(keySel, labelIn, up, down, del);
      list.append(row);
    });
    body.append(list);
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn";
    addBtn.textContent = "Spalte hinzufügen";
    addBtn.addEventListener("click", () => {
      draft.tableColumns.push({ fieldKey: "bezeichnung", label: "Neu", source: "meta" });
      render();
    });
    body.append(addBtn);
  }

  function renderLayout() {
    body.replaceChildren();
    const poolKeys = unassignedFieldKeys(draft);
    const pool = document.createElement("div");
    pool.className = "layout-pool";
    const poolTitle = document.createElement("strong");
    poolTitle.textContent = "Nicht platziert";
    pool.append(poolTitle);
    const poolZone = document.createElement("div");
    poolZone.className = "layout-dropzone";
    poolZone.dataset.containerId = "__pool__";
    for (const key of poolKeys) {
      poolZone.append(fieldChip(key, draft));
    }
    enableDrop(poolZone, draft, () => render());
    pool.append(poolZone);

    const canvas = document.createElement("div");
    canvas.className = "layout-canvas";
    for (const row of draft.layout) {
      const rowEl = document.createElement("div");
      rowEl.className = "layout-row";
      const rowHead = document.createElement("div");
      rowHead.className = "layout-row-head";
      rowHead.textContent = `Zeile ${row.id}`;
      const addCont = document.createElement("button");
      addCont.type = "button";
      addCont.className = "btn";
      addCont.textContent = "+ Container";
      addCont.addEventListener("click", () => {
        row.containers.push({
          id: `container-${Date.now()}`,
          title: "Container",
          colSpan: 12,
          fieldKeys: [],
        });
        render();
      });
      rowHead.append(addCont);
      rowEl.append(rowHead);

      const rowGrid = document.createElement("div");
      rowGrid.className = "layout-row-grid";
      for (const container of row.containers) {
        rowGrid.append(renderContainer(container, draft, () => render()));
      }
      rowEl.append(rowGrid);
      canvas.append(rowEl);
    }

    const addRowBtn = document.createElement("button");
    addRowBtn.type = "button";
    addRowBtn.className = "btn";
    addRowBtn.textContent = "+ Zeile";
    addRowBtn.addEventListener("click", () => {
      draft.layout.push({
        id: `row-${Date.now()}`,
        containers: [{ id: `container-${Date.now()}`, title: "Neu", colSpan: 12, fieldKeys: [] }],
      });
      render();
    });

    const split = document.createElement("div");
    split.className = "layout-split";
    split.append(pool, canvas);
    body.append(hint("Felder per Drag & Drop in Container ziehen. Reihenfolge = Anordnung im Detailformular."));
    body.append(split, addRowBtn);
  }

  function toggleDraftDetailDefaultHidden(fieldKey: string, hidden: boolean): void {
    const set = new Set(draft.defaultHiddenDetailFieldKeys ?? []);
    if (hidden) set.add(fieldKey);
    else set.delete(fieldKey);
    if (set.size) draft.defaultHiddenDetailFieldKeys = [...set];
    else delete draft.defaultHiddenDetailFieldKeys;
  }

  function toggleDraftTableColumnHidden(columnId: string, hidden: boolean): void {
    draft = applyTableColumnHidden(draft, columnId, hidden);
  }

  function renderVisibility() {
    body.replaceChildren();
    body.append(
      hint(
        "Projektweite Vorgaben: ausgeblendete Spalten/Felder gelten für neue Imports und können pro Datensatz überschrieben werden.",
      ),
    );

    if (options?.datasetContext) {
      const ctx = options.datasetContext;
      const hiddenDetail = getHiddenFieldKeySet(ctx.meta, draft);
      const dsTitle = document.createElement("h3");
      dsTitle.textContent = "Dieser Datensatz";
      body.append(dsTitle);
      const dsHint = document.createElement("p");
      dsHint.className = "muted layout-modal-hint";
      dsHint.textContent = "Überschreibt die Schema-Vorgabe nur für diesen Datensatz.";
      body.append(dsHint);
      const dsList = document.createElement("ul");
      dsList.className = "hidden-field-reveal-list layout-modal-list";
      for (const key of orderedSchemaFieldKeys(draft)) {
        const def = fieldDefByKey(draft.fields, key);
        if (!def || !isOptionalSchemaField(def)) continue;
        const li = document.createElement("li");
        li.className = "hidden-field-reveal-item";
        const label = document.createElement("span");
        label.className = "hidden-field-reveal-label";
        label.textContent = def.label;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-mini schema-field-visibility-btn";
        const isHidden = hiddenDetail.has(def.key);
        btn.textContent = isHidden ? "Einblenden" : "Ausblenden";
        btn.addEventListener("click", () => {
          void ctx.onSetFieldHidden(def.key, !isHidden).then(() => {
            ctx.onRerender();
          });
        });
        li.append(label, btn);
        dsList.append(li);
      }
      body.append(dsList);
    }

    const tableTitle = document.createElement("h3");
    tableTitle.textContent = "Tabelle (Schema)";
    body.append(tableTitle);
    const { configured, available } = listTableColumnLayout(draft);
    const tableList = document.createElement("ul");
    tableList.className = "hidden-field-reveal-list layout-modal-list";
    for (const row of configured) {
      const li = document.createElement("li");
      li.className = "hidden-field-reveal-item";
      const label = document.createElement("span");
      label.className = "hidden-field-reveal-label";
      label.textContent = row.col.label;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-mini schema-field-visibility-btn";
      btn.textContent = row.hidden ? "Einblenden" : "Ausblenden";
      btn.addEventListener("click", () => {
        toggleDraftTableColumnHidden(row.id, !row.hidden);
        render();
      });
      li.append(label, btn);
      tableList.append(li);
    }
    body.append(tableList);

    if (available.length) {
      const availTitle = document.createElement("h4");
      availTitle.className = "layout-modal-sub";
      availTitle.textContent = "Noch nicht in der Tabelle";
      body.append(availTitle);
      const availList = document.createElement("ul");
      availList.className = "hidden-field-reveal-list layout-modal-list";
      for (const cand of available) {
        const li = document.createElement("li");
        li.className = "hidden-field-reveal-item";
        const label = document.createElement("span");
        label.className = "hidden-field-reveal-label";
        label.textContent = `${cand.label}${cand.source === "index" ? " (Index)" : ""}`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-mini";
        btn.textContent = "Spalte hinzufügen";
        btn.addEventListener("click", () => {
          draft = addTableColumnToSchema(draft, cand as TableColumnCandidate);
          render();
        });
        li.append(label, btn);
        availList.append(li);
      }
      body.append(availList);
    }

    const detailTitle = document.createElement("h3");
    detailTitle.textContent = "Detail-Maske (Schema-Standard)";
    body.append(detailTitle);
    const hiddenDefaults = new Set(draft.defaultHiddenDetailFieldKeys ?? []);
    const detailList = document.createElement("ul");
    detailList.className = "hidden-field-reveal-list layout-modal-list";
    for (const key of orderedSchemaFieldKeys(draft)) {
      const def = fieldDefByKey(draft.fields, key);
      if (!def) continue;
      const li = document.createElement("li");
      li.className = "hidden-field-reveal-item";
      const label = document.createElement("span");
      label.className = "hidden-field-reveal-label";
      label.textContent = def.label;
      if (!isOptionalSchemaField(def)) {
        const tag = document.createElement("span");
        tag.className = "muted layout-always-tag";
        tag.textContent = "immer";
        li.append(label, tag);
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-mini schema-field-visibility-btn";
        const isHidden = hiddenDefaults.has(def.key);
        btn.textContent = isHidden ? "Einblenden" : "Ausblenden";
        btn.addEventListener("click", () => {
          toggleDraftDetailDefaultHidden(def.key, !isHidden);
          render();
        });
        li.append(label, btn);
      }
      detailList.append(li);
    }
    body.append(detailList);
  }

  function render() {
    renderTabs();
    if (tab === "general") renderGeneral();
    else if (tab === "fields") renderFields();
    else if (tab === "table") renderTable();
    else if (tab === "layout") renderLayout();
    else renderVisibility();
  }

  dialog.innerHTML = `<h2>Schema bearbeiten</h2>`;
  dialog.append(tabBar, body);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn-primary";
  saveBtn.textContent = "Speichern";
  saveBtn.addEventListener("click", () => {
    const err = validateDraft(draft);
    if (err) {
      status.textContent = err;
      return;
    }
    upsertSchemaDefinition(draft);
    status.textContent = "Gespeichert.";
    onSaved();
    backdrop.remove();
  });
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn";
  closeBtn.textContent = "Abbrechen";
  closeBtn.addEventListener("click", () => backdrop.remove());
  actions.append(saveBtn, closeBtn);
  dialog.append(actions, status);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  render();
  backdrop.append(dialog);
  document.body.append(backdrop);
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
  head.className = "layout-container-head";
  const titleIn = document.createElement("input");
  titleIn.className = "field";
  titleIn.placeholder = "Container-Titel";
  titleIn.value = container.title ?? "";
  titleIn.addEventListener("change", () => {
    container.title = titleIn.value;
  });
  const spanIn = document.createElement("input");
  spanIn.className = "field layout-span";
  spanIn.type = "number";
  spanIn.min = "1";
  spanIn.max = "12";
  spanIn.value = String(container.colSpan ?? 12);
  spanIn.title = "Spalten (1–12)";
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

function fieldChip(key: string, draft: DatasetSchemaDefinition): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "layout-chip";
  chip.draggable = true;
  chip.dataset.fieldKey = key;
  const def = draft.fields.find((f) => f.key === key);
  chip.textContent = def ? `${def.label} (${key})` : key;
  chip.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData("text/field-key", key);
    e.dataTransfer!.effectAllowed = "move";
  });
  return chip;
}

function enableDrop(zone: HTMLElement, draft: DatasetSchemaDefinition, rerender: () => void): void {
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-over");
    const key = e.dataTransfer?.getData("text/field-key");
    if (!key) return;
    removeFieldFromAllContainers(draft, key);
    const targetId = zone.dataset.containerId;
    if (targetId === "__pool__") {
      rerender();
      return;
    }
    const container = findContainer(draft, targetId ?? "");
    if (!container) return;
    if (!container.fieldKeys.includes(key)) container.fieldKeys.push(key);
    rerender();
  });
}

function findContainer(draft: DatasetSchemaDefinition, id: string): LayoutContainer | undefined {
  for (const row of draft.layout) {
    for (const c of row.containers) {
      if (c.id === id) return c;
    }
  }
  return undefined;
}

function removeFieldFromAllContainers(draft: DatasetSchemaDefinition, key: string): void {
  for (const row of draft.layout) {
    for (const c of row.containers) {
      c.fieldKeys = c.fieldKeys.filter((k) => k !== key);
    }
  }
}

function unassignedFieldKeys(draft: DatasetSchemaDefinition): string[] {
  const placed = new Set<string>();
  for (const row of draft.layout) {
    for (const c of row.containers) {
      for (const k of c.fieldKeys) placed.add(k);
    }
  }
  return draft.fields.map((f) => f.key).filter((k) => !placed.has(k));
}

function fieldTypes(): FieldDataType[] {
  return ["string", "text", "number", "date", "boolean", "select", "tags"];
}

function columnKeyOptions(draft: DatasetSchemaDefinition): { key: string; source: "meta" | "index" }[] {
  const index: { key: string; source: "index" }[] = [
    { key: "fileCount", source: "index" },
    { key: "syncStatus", source: "index" },
    { key: "lastModified", source: "index" },
  ];
  const meta = draft.fields.map((f) => ({ key: f.key, source: "meta" as const }));
  return [...meta, ...index];
}

function moveTableCol(draft: DatasetSchemaDefinition, idx: number, delta: number): void {
  const next = idx + delta;
  if (next < 0 || next >= draft.tableColumns.length) return;
  const cols = draft.tableColumns;
  const tmp = cols[idx]!;
  cols[idx] = cols[next]!;
  cols[next] = tmp;
}

function purgeFieldFromLayout(draft: DatasetSchemaDefinition, key: string): void {
  removeFieldFromAllContainers(draft, key);
}

function purgeFieldFromTable(draft: DatasetSchemaDefinition, key: string): void {
  draft.tableColumns = draft.tableColumns.filter((c) => c.fieldKey !== key);
}

function slugId(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function slugFieldKey(v: string): string {
  const s = v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s || ["locId", "files", "sync", "schemaVersion", "lastModified"].includes(s)) return "";
  return s;
}

function fieldInput(
  label: string,
  value: string,
  editable: boolean,
  onChange: (v: string) => void,
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.textContent = label;
  const input = document.createElement("input");
  input.className = "field";
  input.value = value;
  input.readOnly = !editable;
  input.addEventListener("change", () => onChange(input.value));
  wrap.append(input);
  return wrap;
}

function hint(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  return p;
}

function mkBtn(text: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn";
  b.textContent = text;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

function validateDraft(draft: DatasetSchemaDefinition): string | null {
  if (!draft.id.trim()) return "ID fehlt.";
  if (!draft.name.trim()) return "Name fehlt.";
  if (!/^[A-Z0-9]{2,8}$/.test(draft.loxPrefix)) return "Prefix ungültig (2–8 Zeichen, A-Z/0-9).";
  if (!draft.fields.some((f) => f.key === "locId")) return "Feld locId ist erforderlich.";
  const keys = new Set<string>();
  for (const f of draft.fields) {
    if (keys.has(f.key)) return `Doppelter Feld-Key: ${f.key}`;
    keys.add(f.key);
  }
  if (!draft.tableColumns.length) return "Mindestens eine Tabellenspalte.";
  if (!draft.layout.length) return "Mindestens eine Layout-Zeile.";
  return null;
}