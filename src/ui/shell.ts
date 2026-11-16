import { appState, getSelectedScan, patchState, subscribe } from "../state";
import { filterRecords } from "../lib/db-index";
import { displayLocId, type FileUserMeta, type MetaFileEntry } from "../lib/meta-schema";
import { isImagePath } from "../lib/fs-local";
import { resolveSchemaForDataset, getDefaultSchema } from "../lib/dataset-schema-store";
import type { DatasetSchemaDefinition, SchemaFieldDef } from "../lib/dataset-schema-types";
import {
  fieldDefByKey,
  formatFieldForInput,
  getMetaFieldValue,
  serializeFieldInput,
} from "../lib/meta-field-access";
import { formatTableCell } from "../lib/table-schema";

let previewUrl: string | null = null;
const thumbUrls = new Map<string, string>();

type SidebarFocus = { name: string; start: number | null; end: number | null };

function captureSidebarFocus(): SidebarFocus | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement) || !el.closest(".sidebar") || !el.name) return null;
  return { name: el.name, start: el.selectionStart, end: el.selectionEnd };
}

function restoreSidebarFocus(root: HTMLElement, saved: SidebarFocus | null): void {
  if (!saved) return;
  const input = root.querySelector<HTMLInputElement>(`.sidebar input[name="${saved.name}"]`);
  if (!input) return;
  input.focus();
  try {
    input.setSelectionRange(saved.start, saved.end);
  } catch {
    /* ignore */
  }
}

/** Platzhalter beim Fokus ausblenden, beim Blur zurück (wenn leer). */
function wirePlaceholderFocus(field: HTMLInputElement | HTMLTextAreaElement): void {
  const initial = field.placeholder;
  if (!initial) return;
  field.addEventListener("focus", () => {
    field.placeholder = "";
  });
  field.addEventListener("blur", () => {
    if (!field.value) field.placeholder = initial;
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function clearPreview(): void {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  for (const url of thumbUrls.values()) URL.revokeObjectURL(url);
  thumbUrls.clear();
}

function statusLabel(status: string): string {
  switch (status) {
    case "synced":
      return "Synchron";
    case "local-changes":
      return "Lokal geändert";
    case "remote-only":
      return "Nur remote";
    case "blocked":
      return "Blockiert";
    default:
      return "Unbekannt";
  }
}

function renderTopBar(root: HTMLElement, handlers: ShellHandlers): void {
  const header = el("header", "chrome-header");
  const title = el("span", "chrome-title");
  title.textContent = "R-Base";
  const actions = el("div", "chrome-actions");

  const folderBtn = el("button", "btn");
  folderBtn.type = "button";
  folderBtn.textContent = appState.rootHandle ? "Ordner wechseln" : "Ordner wählen";
  folderBtn.addEventListener("click", () => void handlers.onPickFolder());

  const syncBtn = el("button", "btn btn-primary");
  syncBtn.type = "button";
  syncBtn.textContent = appState.syncBusy ? "Sync läuft…" : "Mit NAS abgleichen";
  syncBtn.disabled = !appState.ready || appState.syncBusy || !handlers.canSync();
  syncBtn.addEventListener("click", () => void handlers.onSync());

  const badge = el("span", `badge ${appState.globalSync.lastOk ? "badge-ok" : "badge-warn"}`);
  if (appState.globalSync.lastRunAt) {
    badge.textContent = `Letzter Sync: ${new Date(appState.globalSync.lastRunAt).toLocaleString("de-DE")}`;
  } else {
    badge.textContent = "Noch nicht synchronisiert";
  }

  const excelExport = el("button", "btn");
  excelExport.type = "button";
  excelExport.textContent = "Excel export";
  excelExport.disabled = !appState.ready;
  excelExport.addEventListener("click", () => handlers.onExcelExport());

  const excelImport = el("button", "btn");
  excelImport.type = "button";
  excelImport.textContent = "Excel import";
  excelImport.disabled = !appState.ready;
  excelImport.addEventListener("click", () => handlers.onExcelImport());

  const settingsBtn = el("button", "btn");
  settingsBtn.type = "button";
  settingsBtn.textContent = "Einstellungen";
  settingsBtn.addEventListener("click", () => handlers.onOpenSettings());

  actions.append(folderBtn, syncBtn, badge, excelExport, excelImport, settingsBtn);
  header.append(title, actions);

  if (appState.rootLabel) {
    const sub = el("div", "chrome-sub");
    sub.textContent = `Stamm: ${appState.rootLabel}`;
    header.append(sub);
  }

  root.append(header);
}

function renderSidebar(root: HTMLElement, handlers: ShellHandlers): void {
  const aside = el("aside", "sidebar");
  const search = el("input", "field");
  search.type = "search";
  search.name = "filterQuery";
  search.autocomplete = "off";
  search.placeholder = "Suche (ID, Bezeichnung, Kategorie)";
  search.value = appState.filterQuery;
  wirePlaceholderFocus(search);
  search.addEventListener("input", () => {
    patchState({ filterQuery: search.value });
  });

  const cat = el("input", "field");
  cat.name = "filterKategorie";
  cat.autocomplete = "off";
  cat.placeholder = "Kategorie-Filter";
  cat.value = appState.filterKategorie;
  wirePlaceholderFocus(cat);
  cat.addEventListener("input", () => {
    patchState({ filterKategorie: cat.value });
  });

  const newBtn = el("button", "btn btn-primary");
  newBtn.type = "button";
  newBtn.textContent = "+ Neuer Datensatz";
  newBtn.disabled = !appState.ready;
  newBtn.addEventListener("click", () => void handlers.onNewDataset());

  aside.append(search, cat, newBtn);
  root.append(aside);
}

function renderTable(main: HTMLElement, handlers: ShellHandlers): void {
  const listSchema = getDefaultSchema();
  const columns = listSchema.tableColumns.length ? listSchema.tableColumns : getDefaultSchema().tableColumns;
  const metaById = new Map(appState.scans.map((s) => [s.meta.locId, s.meta]));

  const tableWrap = el("div", "table-wrap");
  const table = el("table", "data-table");
  const thead = el("thead");
  const headRow = el("tr");
  for (const col of columns) {
    const th = el("th");
    th.textContent = col.label;
    if (col.width) th.style.width = col.width;
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = el("tbody");
  const rows = filterRecords(appState.records, appState.filterQuery, appState.filterKategorie);
  for (const row of rows) {
    const tr = el("tr", "data-row");
    tr.addEventListener("click", () => {
      patchState({ selectedLocId: row.locId, view: "detail" });
      handlers.onRerender();
    });
    const meta = metaById.get(row.locId);
    for (const col of columns) {
      const td = el("td");
      let text = formatTableCell(col, row, meta);
      if (col.fieldKey === "syncStatus" && col.source === "index") {
        text = statusLabel(row.syncStatus);
      }
      td.textContent = text;
      tr.append(td);
    }
    tbody.append(tr);
  }

  table.append(thead, tbody);
  tableWrap.append(table);

  const backHint = el("p", "muted");
  backHint.textContent = rows.length ? `${rows.length} Datensätze` : "Keine Datensätze — neu anlegen oder Ordner wählen.";
  main.append(backHint, tableWrap);
}

function beginIdChange(scan: { meta: { locId: string } }, handlers: ShellHandlers): void {
  const current = displayLocId(scan.meta.locId);
  const ok = window.confirm(
    "ID wirklich ändern? Der Datensatz-Ordner wird umbenannt. Ungültige IDs werden abgelehnt.",
  );
  if (!ok) return;
  const next = window.prompt("Neue ID:", current);
  if (!next || next.trim() === current) return;
  void (async () => {
    try {
      await handlers.onChangeDatasetId(next.trim());
    } catch (e) {
      patchState({ error: e instanceof Error ? e.message : String(e) });
    }
  })();
}

function renderIdField(parent: HTMLElement, scan: { meta: { locId: string } }, handlers: ShellHandlers): void {
  const locField = el("label");
  locField.textContent = "ID";

  const display = el("div", "id-display");
  display.textContent = displayLocId(scan.meta.locId);
  display.title = "Rechtsklick: ID ändern…";
  display.tabIndex = 0;
  display.setAttribute("role", "textbox");
  display.setAttribute("aria-readonly", "true");
  display.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    beginIdChange(scan, handlers);
  });

  locField.append(display);
  parent.append(locField);
}

function renderSchemaFieldInput(
  parent: HTMLElement,
  def: SchemaFieldDef,
  scan: { meta: import("../lib/meta-schema").DatasetMeta },
  handlers: ShellHandlers,
): void {
  if (def.dataType === "locId") {
    renderIdField(parent, scan, handlers);
    return;
  }
  const wrap = el("label");
  wrap.textContent = def.label;
  const value = getMetaFieldValue(scan.meta, def.key);
  if (def.dataType === "text") {
    const area = el("textarea", "field area");
    area.value = formatFieldForInput(def.dataType, value);
    area.addEventListener("change", () =>
      void handlers.onMetaFieldChange(def.key, serializeFieldInput(def.dataType, area.value)),
    );
    wrap.append(area);
  } else if (def.dataType === "boolean") {
    const row = el("div", "check-row");
    const check = el("input");
    check.type = "checkbox";
    check.checked = Boolean(value);
    check.addEventListener("change", () =>
      void handlers.onMetaFieldChange(def.key, serializeFieldInput(def.dataType, "", check.checked)),
    );
    row.append(check);
    wrap.append(row);
  } else if (def.dataType === "select") {
    const sel = el("select", "field");
    const opts = def.options?.length ? def.options : [];
    const empty = el("option");
    empty.value = "";
    empty.textContent = "—";
    sel.append(empty);
    for (const o of opts) {
      const opt = el("option");
      opt.value = o;
      opt.textContent = o;
      sel.append(opt);
    }
    sel.value = formatFieldForInput(def.dataType, value);
    sel.addEventListener("change", () =>
      void handlers.onMetaFieldChange(def.key, serializeFieldInput(def.dataType, sel.value)),
    );
    wrap.append(sel);
  } else {
    const input = el("input", "field");
    if (def.dataType === "number") input.type = "number";
    else if (def.dataType === "date") input.type = "date";
    else input.type = "text";
    input.value = formatFieldForInput(def.dataType, value);
    if (def.constraints?.required) input.required = true;
    if (def.constraints?.maxLength) input.maxLength = def.constraints.maxLength;
    input.addEventListener("change", () =>
      void handlers.onMetaFieldChange(def.key, serializeFieldInput(def.dataType, input.value)),
    );
    wrap.append(input);
  }
  parent.append(wrap);
}

function renderSchemaDetailForm(
  main: HTMLElement,
  scan: { meta: import("../lib/meta-schema").DatasetMeta },
  schema: DatasetSchemaDefinition,
  handlers: ShellHandlers,
): void {
  const form = el("div", "detail-form schema-layout");
  const layout = schema.layout.length ? schema.layout : getDefaultSchema().layout;
  for (const row of layout) {
    const rowEl = el("div", "schema-form-row");
    for (const container of row.containers) {
      const box = el("section", "schema-form-container");
      box.style.gridColumn = `span ${container.colSpan ?? 12}`;
      if (container.title?.trim()) {
        const title = el("h3", "schema-container-title");
        title.textContent = container.title;
        box.append(title);
      }
      const keys = container.fieldKeys.length
        ? container.fieldKeys
        : schema.fields.filter((f) => f.key !== "locId").map((f) => f.key);
      for (const key of keys) {
        const def = fieldDefByKey(schema.fields, key);
        if (!def) continue;
        renderSchemaFieldInput(box, def, scan, handlers);
      }
      rowEl.append(box);
    }
    form.append(rowEl);
  }
  main.append(form);
}

function dateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function renderFileMetaEditor(container: HTMLElement, file: MetaFileEntry, handlers: ShellHandlers): void {
  const details = el("details", "file-meta");
  const hasMeta = Boolean(
    file.meta?.title?.trim() || file.meta?.description?.trim() || file.meta?.capturedAt || file.meta?.tags?.length,
  );
  if (hasMeta) details.open = true;
  const summary = el("summary");
  summary.textContent = "Metadaten";
  const fields = el("div", "file-meta-fields");

  const titleWrap = el("label");
  titleWrap.textContent = "Titel";
  const titleInput = el("input", "field");
  titleInput.value = file.meta?.title ?? "";
  if (!titleInput.value) {
    titleInput.placeholder = "Titel";
    wirePlaceholderFocus(titleInput);
  }
  titleInput.addEventListener("change", () =>
    void handlers.onFileMetaChange(file.path, { title: titleInput.value }),
  );
  titleWrap.append(titleInput);

  const descWrap = el("label");
  descWrap.textContent = "Beschreibung";
  const descInput = el("textarea", "field file-meta-area");
  descInput.value = file.meta?.description ?? "";
  if (!descInput.value) {
    descInput.placeholder = "Beschreibung";
    wirePlaceholderFocus(descInput);
  }
  descInput.addEventListener("change", () =>
    void handlers.onFileMetaChange(file.path, { description: descInput.value }),
  );
  descWrap.append(descInput);

  const dateWrap = el("label");
  dateWrap.textContent = "Datum";
  const dateInput = el("input", "field");
  dateInput.type = "date";
  dateInput.value = dateInputValue(file.meta?.capturedAt ?? undefined);
  dateInput.addEventListener("change", () => {
    const v = dateInput.value;
    void handlers.onFileMetaChange(file.path, {
      capturedAt: v ? `${v}T12:00:00.000Z` : null,
    });
  });
  dateWrap.append(dateInput);

  const tagsWrap = el("label");
  tagsWrap.textContent = "Tags (kommagetrennt)";
  const tagsInput = el("input", "field");
  tagsInput.value = (file.meta?.tags ?? []).join(", ");
  if (!tagsInput.value) {
    tagsInput.placeholder = "Tags, kommagetrennt";
    wirePlaceholderFocus(tagsInput);
  }
  tagsInput.addEventListener("change", () => {
    const tags = tagsInput.value
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    void handlers.onFileMetaChange(file.path, { tags });
  });
  tagsWrap.append(tagsInput);

  fields.append(titleWrap, descWrap, dateWrap, tagsWrap);
  details.append(summary, fields);
  container.append(details);
}

function attachThumb(tile: HTMLElement, img: HTMLImageElement, path: string, handlers: ShellHandlers): void {
  const hover = el("div", "thumb-hover");
  const hoverImg = el("img", "thumb-hover-img");
  hover.append(hoverImg);
  tile.append(hover);

  void handlers.getFileObjectUrl(path).then((url) => {
    img.src = url;
    hoverImg.src = url;
    thumbUrls.set(path, url);
  });

  tile.addEventListener("mouseenter", () => hover.classList.add("is-visible"));
  tile.addEventListener("mouseleave", () => hover.classList.remove("is-visible"));
}

function renderDetail(main: HTMLElement, handlers: ShellHandlers): void {
  const scan = getSelectedScan();
  if (!scan) {
    patchState({ view: "table" });
    return;
  }

  clearPreview();

  const toolbar = el("div", "detail-toolbar");
  const back = el("button", "btn");
  back.type = "button";
  back.textContent = "← Tabelle";
  back.addEventListener("click", () => {
    patchState({ view: "table" });
    handlers.onRerender();
  });
  toolbar.append(back);
  main.append(toolbar);

  const schema = resolveSchemaForDataset(scan.meta);
  renderSchemaDetailForm(main, scan, schema, handlers);

  const drop = el("div", "dropzone");
  drop.textContent = "PDF/Bilder hier ablegen";
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("is-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-over");
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) void handlers.onAddFiles(files);
  });

  const fileInput = el("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.addEventListener("change", () => {
    const files = [...(fileInput.files ?? [])];
    if (files.length) void handlers.onAddFiles(files);
    fileInput.value = "";
  });
  const uploadBtn = el("button", "btn");
  uploadBtn.type = "button";
  uploadBtn.textContent = "Dateien hinzufügen";
  uploadBtn.addEventListener("click", () => fileInput.click());

  main.append(drop, uploadBtn, fileInput);

  const images = scan.meta.files.filter((f) => isImagePath(f.path));
  const others = scan.meta.files.filter((f) => !isImagePath(f.path));

  if (images.length) {
    const h = el("h3", "files-heading");
    h.textContent = "Bilder";
    main.append(h);
    const grid = el("div", "thumb-grid");
    for (const file of images) {
      const tile = el("div", "thumb-tile");
      const img = el("img", "thumb-img");
      img.alt = file.path;
      const cap = el("span", "thumb-caption");
      cap.textContent = file.meta?.title?.trim() || (file.path.split("/").pop() ?? file.path);
      const del = el("button", "btn thumb-del");
      del.type = "button";
      del.textContent = "Löschen";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!window.confirm(`„${file.path}“ unwiderruflich löschen?`)) return;
        void handlers.onDeleteFile(file.path);
      });
      tile.append(img, cap, del);
      renderFileMetaEditor(tile, file, handlers);
      attachThumb(tile, img, file.path, handlers);
      grid.append(tile);
    }
    main.append(grid);
  }

  if (others.length) {
    const h2 = el("h3", "files-heading");
    h2.textContent = "Weitere Dateien";
    main.append(h2);
    const list = el("ul", "file-list");
    for (const file of others) {
      const li = el("li", "file-item file-item-row");
      const btn = el("button", "link-btn");
      btn.type = "button";
      btn.textContent = `${file.path} (${Math.round(file.size / 1024)} KB)`;
      btn.addEventListener("click", () => void handlers.onPreviewFile(file.path));
      const del = el("button", "btn");
      del.type = "button";
      del.textContent = "Löschen";
      del.addEventListener("click", () => {
        if (!window.confirm(`„${file.path}“ löschen?`)) return;
        void handlers.onDeleteFile(file.path);
      });
      const metaBox = el("div", "file-meta-wrap");
      renderFileMetaEditor(metaBox, file, handlers);
      li.append(btn, del, metaBox);
      list.append(li);
    }
    main.append(list);
  }

  const preview = el("div", "preview-pane");
  preview.id = "preview-pane";
  main.append(preview);
}

function renderSyncLog(root: HTMLElement): void {
  if (!appState.syncLogs.length && !appState.syncProgress) return;
  const panel = el("div", "sync-log");
  const title = el("strong");
  title.textContent = "Sync";
  panel.append(title);
  if (appState.syncProgress) {
    const p = el("div");
    p.textContent = `${appState.syncProgress.phase} ${appState.syncProgress.current}/${appState.syncProgress.total}: ${appState.syncProgress.fileName}`;
    panel.append(p);
  }
  for (const line of appState.syncLogs.slice(-8)) {
    const row = el("div", `log-${line.level}`);
    row.textContent = line.message;
    panel.append(row);
  }
  root.append(panel);
}

function renderMessages(root: HTMLElement): void {
  if (appState.error) {
    const err = el("div", "banner banner-error");
    err.textContent = appState.error;
    root.append(err);
  }
  if (appState.message) {
    const msg = el("div", "banner banner-ok");
    msg.textContent = appState.message;
    root.append(msg);
  }
}

export type ShellHandlers = {
  onPickFolder: () => Promise<void>;
  onSync: () => Promise<void>;
  canSync: () => boolean;
  onExcelExport: () => void;
  onExcelImport: () => void;
  onOpenSettings: () => void;
  onNewDataset: () => Promise<void>;
  onMetaChange: (partial: { bezeichnung?: string; kategorie?: string; notes?: string }) => Promise<void>;
  onMetaFieldChange: (fieldKey: string, value: unknown) => Promise<void>;
  onAddFiles: (files: File[]) => Promise<void>;
  onPreviewFile: (relativePath: string) => Promise<void>;
  onDeleteFile: (relativePath: string) => Promise<void>;
  onFileMetaChange: (relativePath: string, patch: Partial<FileUserMeta>) => Promise<void>;
  onChangeDatasetId: (rawNewId: string) => Promise<void>;
  getFileObjectUrl: (relativePath: string) => Promise<string>;
  onRerender: () => void;
};

export function mountShell(container: HTMLElement, handlers: ShellHandlers): void {
  const render = () => {
    const sidebarFocus = captureSidebarFocus();
    container.replaceChildren();
    clearPreview();
    renderMessages(container);
    renderTopBar(container, handlers);
    const body = el("div", "layout-body");
    renderSidebar(body, handlers);
    const main = el("main", "main-pane");
    if (appState.view === "detail") renderDetail(main, handlers);
    else renderTable(main, handlers);
    body.append(main);
    container.append(body);
    renderSyncLog(container);
    restoreSidebarFocus(container, sidebarFocus);
  };

  subscribe(render);
  render();
}

export function setPreviewContent(kind: "pdf" | "image" | "none", url: string | null): void {
  clearPreview();
  const pane = document.getElementById("preview-pane");
  if (!pane) return;
  pane.replaceChildren();
  if (!url || kind === "none") return;
  previewUrl = url;
  if (kind === "pdf") {
    const frame = el("iframe", "preview-frame");
    frame.src = url;
    pane.append(frame);
  } else {
    const img = el("img", "preview-img");
    img.src = url;
    img.alt = "Vorschau";
    pane.append(img);
  }
}