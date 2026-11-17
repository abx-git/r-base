import { flushAllPendingMetaSaves, getDraftFieldValue } from "../lib/meta-auto-save";
import { appState, dismissBanners, getSelectedScan, patchState, subscribe, subscribePersistIndicator } from "../state";
import type { IndexRecord } from "../lib/db-index";
import { normalizeDatasetTags } from "../lib/dataset-tags";
import { filterRecordsAdvanced, hasActiveRecordFilter, type RecordFilterState } from "../lib/record-filter";
import { renderDatasetTagsField, renderSidebarTagFilter } from "./tag-cloud";
import {
  DEFAULT_BEZEICHNUNG_HINT,
  displayLocId,
  type DatasetMeta,
  type FileUserMeta,
  type MetaFileEntry,
} from "../lib/meta-schema";
import { isImagePath } from "../lib/fs-local";
import {
  resolveSchemaForDataset,
  getDefaultSchema,
  getDefaultSchemaId,
  getSchemaById,
} from "../lib/dataset-schema-store";
import type { DatasetSchemaDefinition, SchemaFieldDef } from "../lib/dataset-schema-types";
import {
  fieldDefByKey,
  formatFieldForInput,
  getMetaFieldValue,
  serializeFieldInput,
} from "../lib/meta-field-access";
import { formatTableCell, nextTableSort, sortIndexRecords, tableTagsForRow } from "../lib/table-schema";
import { formatObsoleteValue, listObsoleteFields } from "../lib/meta-obsolete-fields";
import { resolveDetailHiddenKeys } from "../lib/meta-hidden-fields";
import { isFilesLayoutContainer } from "../lib/detail-layout";
import { visibleTableColumns } from "../lib/table-layout";
import {
  buildMetaByLocId,
  findScanByLocId,
  locIdsReferToSameRecord,
  metaForLocId,
} from "../lib/dataset-scan-match";

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

type DetailFocus = { fieldKey: string; start: number | null; end: number | null };

function captureDetailFocus(): DetailFocus | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
  if (!el.closest(".main-pane")) return null;
  const fieldKey = el.getAttribute("data-field-key");
  if (!fieldKey) return null;
  return { fieldKey, start: el.selectionStart, end: el.selectionEnd };
}

function restoreDetailFocus(root: HTMLElement, saved: DetailFocus | null): void {
  if (!saved) return;
  const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `.main-pane [data-field-key="${CSS.escape(saved.fieldKey)}"]`,
  );
  if (!el) return;
  el.focus();
  try {
    if (saved.start !== null && saved.end !== null) {
      el.setSelectionRange(saved.start, saved.end);
    }
  } catch {
    /* ignore */
  }
}

/** Platzhalter beim Fokus ausblenden, beim Blur zurück (wenn leer). */
function displayBezeichnungValue(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s === DEFAULT_BEZEICHNUNG_HINT) return "";
  return s;
}

function wireBezeichnungField(field: HTMLInputElement | HTMLTextAreaElement, handlers: ShellHandlers): void {
  field.setAttribute("data-field-key", "bezeichnung");
  field.placeholder = DEFAULT_BEZEICHNUNG_HINT;
  wirePlaceholderFocus(field);
  field.addEventListener("focus", () => {
    if (field.value === DEFAULT_BEZEICHNUNG_HINT) field.value = "";
  });
  const readDraft = () => field.value;
  const readCommit = () => field.value.trim();
  field.addEventListener("input", () => handlers.onMetaFieldDraft("bezeichnung", readDraft()));
  field.addEventListener("change", () => {
    const v = readCommit();
    handlers.onMetaFieldCommit("bezeichnung", v);
    if (!v) {
      field.value = "";
      field.placeholder = DEFAULT_BEZEICHNUNG_HINT;
    }
  });
}

function wireMetaDraftCommit(
  field: HTMLInputElement | HTMLTextAreaElement,
  fieldKey: string,
  dataType: SchemaFieldDef["dataType"],
  handlers: ShellHandlers,
): void {
  const read = () => serializeFieldInput(dataType, field.value);
  field.addEventListener("input", () => handlers.onMetaFieldDraft(fieldKey, read()));
  field.addEventListener("change", () => handlers.onMetaFieldCommit(fieldKey, read()));
}

function buildPersistIndicator(): HTMLElement | null {
  if (!appState.ready || appState.persistStatus === "idle") return null;
  const ind = el("span", `chrome-persist chrome-persist--${appState.persistStatus}`);
  ind.setAttribute("aria-live", "polite");
  switch (appState.persistStatus) {
    case "dirty":
      ind.textContent = "●";
      ind.title = "Ungespeicherte Änderungen (werden automatisch gespeichert)";
      break;
    case "saving":
      ind.textContent = "◌";
      ind.title = "Speichert…";
      break;
    case "saved":
      ind.textContent = "✓";
      ind.title = "Lokal gespeichert";
      break;
    default:
      return null;
  }
  return ind;
}

function syncChromePersistIndicator(): void {
  const actions = document.querySelector<HTMLElement>(".chrome-actions");
  if (!actions) return;
  actions.querySelector(".chrome-persist")?.remove();
  const indicator = buildPersistIndicator();
  if (!indicator) return;
  const menu = actions.querySelector(".chrome-menu");
  if (menu) actions.insertBefore(indicator, menu);
  else actions.append(indicator);
}

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

  const csvImport = el("button", "btn");
  csvImport.type = "button";
  csvImport.textContent = "CSV import";
  csvImport.disabled = !appState.ready;
  csvImport.title = "Rudisten-Jura-CSV: neue Datensätze + Feldschema";
  csvImport.addEventListener("click", () => handlers.onCsvImport());

  const settingsBtn = el("button", "btn");
  settingsBtn.type = "button";
  settingsBtn.textContent = "Einstellungen";
  settingsBtn.addEventListener("click", () => handlers.onOpenSettings());

  const menu = el("div", "chrome-menu");
  const menuToggle = el("button", "btn chrome-menu-toggle");
  menuToggle.type = "button";
  menuToggle.textContent = "Menü";
  menuToggle.setAttribute("aria-haspopup", "menu");
  menuToggle.setAttribute("aria-expanded", "false");

  const panel = el("div", "chrome-menu-panel");
  panel.setAttribute("role", "menu");
  panel.tabIndex = -1;

  panel.append(folderBtn, syncBtn, excelExport, excelImport, csvImport, settingsBtn);

  for (const btn of [folderBtn, syncBtn, excelExport, excelImport, csvImport, settingsBtn]) {
    btn.classList.add("chrome-menu-item");
    btn.setAttribute("role", "menuitem");
  }

  const closeMenu = () => {
    menu.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    menu.classList.add("is-open");
    menuToggle.setAttribute("aria-expanded", "true");
    const onDoc = (ev: Event) => {
      if (!menu.contains(ev.target as Node)) {
        closeMenu();
        document.removeEventListener("click", onDoc);
        document.removeEventListener("keydown", onKey);
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        closeMenu();
        document.removeEventListener("click", onDoc);
        document.removeEventListener("keydown", onKey);
        menuToggle.focus();
      }
    };
    window.setTimeout(() => {
      document.addEventListener("click", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
  };

  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.classList.contains("is-open")) closeMenu();
    else openMenu();
  });

  panel.addEventListener("click", (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && t.closest("button:not(:disabled)")) closeMenu();
  });

  menu.append(menuToggle, panel);
  const persistInd = buildPersistIndicator();
  if (persistInd) actions.append(persistInd);
  actions.append(menu);
  header.append(title, actions);

  if (appState.rootLabel) {
    const sub = el("div", "chrome-sub");
    sub.textContent = `Stamm: ${appState.rootLabel}`;
    header.append(sub);
  }

  root.append(header);
}

function currentRecordFilter(): RecordFilterState {
  return {
    query: appState.filterQuery,
    tagRules: appState.filterTagRules,
  };
}

function renderSidebar(root: HTMLElement, handlers: ShellHandlers): void {
  const aside = el("aside", "sidebar");
  const search = el("input", "field");
  search.type = "search";
  search.name = "filterQuery";
  search.autocomplete = "off";
  search.placeholder = "Volltext *…* oder spalte:*…* (z. B. bezeichnung:*Jura*)";
  search.title =
    "Ohne Spaltenname: alle Felder (ohne Tags), * als Platzhalter. Mit feld:muster nur diese Spalte (Key oder Label, z. B. kategorie:*Muster*).";
  search.value = appState.filterQuery;
  wirePlaceholderFocus(search);
  search.addEventListener("input", () => {
    patchState({ filterQuery: search.value });
  });

  const hasFilter = hasActiveRecordFilter(currentRecordFilter());
  const resetBtn = el("button", "btn");
  resetBtn.type = "button";
  resetBtn.textContent = "Filter zurücksetzen";
  resetBtn.disabled = !hasFilter;
  resetBtn.addEventListener("click", () => {
    patchState({
      filterQuery: "",
      filterTagRules: [],
      tableSelection: [],
    });
  });

  const newBtn = el("button", "btn btn-primary");
  newBtn.type = "button";
  newBtn.textContent = "+ Neuer Datensatz";
  newBtn.disabled = !appState.ready;
  newBtn.addEventListener("click", () => void handlers.onNewDataset());

  aside.append(search);
  renderSidebarTagFilter(aside);
  aside.append(resetBtn, newBtn);
  root.append(aside);
}

function selectedTableIds(): Set<string> {
  return new Set(appState.tableSelection);
}

function toggleTableRowSelection(locId: string): void {
  const sel = selectedTableIds();
  if (sel.has(locId)) sel.delete(locId);
  else sel.add(locId);
  patchState({ tableSelection: [...sel] });
}

function setTableSelectionForVisible(locIds: string[], selected: boolean): void {
  const sel = selectedTableIds();
  for (const id of locIds) {
    if (selected) sel.add(id);
    else sel.delete(id);
  }
  patchState({ tableSelection: [...sel] });
}

function renderTableTagsCell(td: HTMLElement, tags: string[], maxVisible = 4): void {
  td.className = "table-cell-tags";
  if (!tags.length) {
    td.textContent = "—";
    td.classList.add("table-cell-empty");
    return;
  }
  const wrap = el("span", "table-tags-inline");
  const visible = tags.slice(0, maxVisible);
  for (const t of visible) {
    const chip = el("span", "table-tag-chip");
    chip.textContent = t;
    chip.title = t;
    wrap.append(chip);
  }
  if (tags.length > maxVisible) {
    const more = el("span", "table-tag-more");
    more.textContent = `+${tags.length - maxVisible}`;
    more.title = tags.slice(maxVisible).join(", ");
    wrap.append(more);
  }
  td.title = tags.join(", ");
  td.append(wrap);
}

function tableListSchema(): DatasetSchemaDefinition {
  const preferred = appState.listViewSchemaId;
  const base = preferred ? getSchemaById(preferred) ?? getDefaultSchema() : getDefaultSchema();
  if (visibleTableColumns(base).length >= 2) return base;
  return getDefaultSchema();
}

function renderTable(main: HTMLElement, handlers: ShellHandlers): void {
  if (appState.records.length > 0 && appState.scans.length === 0) {
    const warn = el("div", "banner banner-error");
    warn.textContent =
      "Es gibt Einträge im lokalen Index, aber keine geladenen Datensatz-Ordner — bitte den Stammordner erneut verbinden.";
    main.append(warn);
  }
  const listSchema = tableListSchema();
  const columns = visibleTableColumns(listSchema);
  const metaById = buildMetaByLocId(appState.scans);
  const sort = appState.tableSort;

  const filtered = filterRecordsAdvanced(appState.records, currentRecordFilter(), appState.scans);
  const rows = sortIndexRecords(filtered, sort, metaById);
  const visibleLocIds = rows.map((r) => r.locId);
  const selection = selectedTableIds();
  const selectedVisible = visibleLocIds.filter((id) => selection.has(id));
  const allVisibleSelected = visibleLocIds.length > 0 && selectedVisible.length === visibleLocIds.length;

  let bulkBar: HTMLElement | null = null;
  if (selectedVisible.length > 0) {
    bulkBar = el("div", "table-bulk-bar");
    const bulkCount = el("span", "table-bulk-count");
    bulkCount.textContent = `${selectedVisible.length} ausgewählt`;
    const bulkDelete = el("button", "btn btn-danger");
    bulkDelete.type = "button";
    bulkDelete.textContent = "Löschen…";
    bulkDelete.disabled = !appState.ready;
    bulkDelete.title = "Ausgewählte nach deleted/ verschieben (Strg+Z je Datensatz)";
    bulkDelete.addEventListener("click", () => {
      if (
        !window.confirm(
          `${selectedVisible.length} Datensätze nach „deleted“ verschieben?\n\nStrg+Z / ⌘Z holt jeweils den zuletzt gelöschten zurück.`,
        )
      ) {
        return;
      }
      void handlers.onBulkSoftDelete(selectedVisible).then(() => handlers.onRerender());
    });
    const bulkTag = el("button", "btn");
    bulkTag.type = "button";
    bulkTag.textContent = "Tag zuweisen…";
    bulkTag.disabled = !appState.ready;
    bulkTag.addEventListener("click", () => {
      const raw = window.prompt(`Tag für ${selectedVisible.length} Datensätze:`, "");
      if (raw === null) return;
      const tag = raw.trim();
      if (!tag) return;
      void handlers.onBulkAssignTag(selectedVisible, tag).then(() => handlers.onRerender());
    });
    const bulkClear = el("button", "btn");
    bulkClear.type = "button";
    bulkClear.textContent = "Auswahl aufheben";
    bulkClear.addEventListener("click", () => {
      patchState({ tableSelection: [] });
      handlers.onRerender();
    });
    bulkBar.append(bulkCount, bulkDelete, bulkTag, bulkClear);
  }

  const tableWrap = el("div", "table-wrap");
  const table = el("table", "data-table data-table--compact");
  const thead = el("thead");
  const headRow = el("tr");
  const thSel = el("th", "data-table-th-select");
  const headCheck = el("input");
  headCheck.type = "checkbox";
  headCheck.className = "table-row-check";
  headCheck.checked = allVisibleSelected;
  headCheck.indeterminate = selectedVisible.length > 0 && !allVisibleSelected;
  headCheck.title = "Alle sichtbaren Zeilen auswählen";
  headCheck.addEventListener("click", (e) => e.stopPropagation());
  headCheck.addEventListener("change", () => {
    setTableSelectionForVisible(visibleLocIds, headCheck.checked);
    handlers.onRerender();
  });
  thSel.append(headCheck);
  headRow.append(thSel);
  for (const col of columns) {
    const th = el("th", "data-table-th");
    const label = el("span", "data-table-th-label");
    label.textContent = col.label;
    th.append(label);
    const isSorted = sort?.fieldKey === col.fieldKey && sort?.source === col.source;
    if (isSorted) {
      th.classList.add("is-sorted");
      const mark = el("span", "data-table-sort");
      mark.textContent = sort!.dir === "asc" ? "▲" : "▼";
      mark.setAttribute("aria-hidden", "true");
      th.append(mark);
    }
    th.title = "Sortierung: Klick für aufsteigend/absteigend";
    if (col.width) th.style.width = col.width;
    th.addEventListener("click", (e) => {
      e.stopPropagation();
      patchState({ tableSort: nextTableSort(appState.tableSort, col) });
      handlers.onRerender();
    });
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = el("tbody");
  for (const row of rows) {
    const isSelected = selection.has(row.locId);
    const tr = el("tr", isSelected ? "data-row data-row--selected" : "data-row");
    tr.addEventListener("click", () => {
      void (async () => {
        try {
          await flushAllPendingMetaSaves();
        } catch {
          /* */
        }
        const scan = findScanByLocId(appState.scans, row.locId);
        patchState({ selectedLocId: scan?.meta.locId ?? row.locId, view: "detail" });
        handlers.onRerender();
      })();
    });
    const tdSel = el("td", "table-cell-select");
    const rowCheck = el("input");
    rowCheck.type = "checkbox";
    rowCheck.className = "table-row-check";
    rowCheck.checked = isSelected;
    rowCheck.title = "Zeile auswählen";
    rowCheck.addEventListener("click", (e) => e.stopPropagation());
    rowCheck.addEventListener("change", (e) => {
      e.stopPropagation();
      toggleTableRowSelection(row.locId);
      handlers.onRerender();
    });
    tdSel.append(rowCheck);
    tr.append(tdSel);
    const meta = metaForLocId(row.locId, appState.scans, metaById);
    for (const col of columns) {
      const td = el("td");
      if (col.fieldKey === "tags" && col.source === "meta") {
        renderTableTagsCell(td, tableTagsForRow(col, row, meta));
      } else {
        let text = formatTableCell(col, row, meta);
        if (col.fieldKey === "syncStatus" && col.source === "index") {
          text = statusLabel(row.syncStatus);
        }
        td.textContent = text;
        if (col.fieldKey === "locId") td.className = "table-cell-id";
        if (col.fieldKey === "fileCount" && col.source === "index") td.className = "table-cell-num";
        if (text === "—") td.classList.add("table-cell-empty");
      }
      if (col.fieldKey === "bezeichnung") td.className = (td.className ? `${td.className} ` : "") + "table-cell-title";
      tr.append(td);
    }
    tbody.append(tr);
  }

  table.append(thead, tbody);
  tableWrap.append(table);

  const backHint = el("p", "muted table-list-hint");
  const sortHint = sort
    ? ` · Sortierung: ${columns.find((c) => c.fieldKey === sort.fieldKey && c.source === sort.source)?.label ?? sort.fieldKey} (${sort.dir === "asc" ? "aufsteigend" : "absteigend"})`
    : "";
  backHint.textContent = rows.length
    ? `${rows.length} Datensätze${sortHint}`
    : "Keine Datensätze — neu anlegen oder Ordner wählen.";
  main.append(backHint);
  if (bulkBar) main.append(bulkBar);
  main.append(tableWrap);
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
  options?: { omitLabel?: boolean },
): void {
  if (def.dataType === "locId") {
    renderIdField(parent, scan, handlers);
    return;
  }
  const wrap = el("label");
  if (!options?.omitLabel) wrap.textContent = def.label;
  const draftValue = getDraftFieldValue(def.key, scan.meta.locId);
  const value = draftValue !== undefined ? draftValue : getMetaFieldValue(scan.meta, def.key);
  if (def.dataType === "text") {
    const area = el("textarea", "field area");
    area.setAttribute("data-field-key", def.key);
    area.value = formatFieldForInput(def.dataType, value);
    wireMetaDraftCommit(area, def.key, def.dataType, handlers);
    wrap.append(area);
  } else if (def.dataType === "boolean") {
    const row = el("div", "check-row");
    const check = el("input");
    check.type = "checkbox";
    check.setAttribute("data-field-key", def.key);
    check.checked = Boolean(value);
    check.addEventListener("change", () =>
      handlers.onMetaFieldCommit(def.key, serializeFieldInput(def.dataType, "", check.checked)),
    );
    row.append(check);
    wrap.append(row);
  } else if (def.dataType === "select") {
    const sel = el("select", "field");
    sel.setAttribute("data-field-key", def.key);
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
      handlers.onMetaFieldCommit(def.key, serializeFieldInput(def.dataType, sel.value)),
    );
    wrap.append(sel);
  } else if (def.dataType === "tags") {
    const tags = normalizeDatasetTags(
      getDraftFieldValue(def.key, scan.meta.locId) ?? getMetaFieldValue(scan.meta, def.key),
    );
    renderDatasetTagsField(parent, tags, (next) => {
      void handlers.onMetaFieldChange(def.key, next);
    });
    return;
  } else {
    const input = el("input", "field");
    input.setAttribute("data-field-key", def.key);
    if (def.dataType === "number") input.type = "number";
    else if (def.dataType === "date") input.type = "date";
    else input.type = "text";
    if (def.key === "bezeichnung") {
      input.value = displayBezeichnungValue(value);
      wireBezeichnungField(input, handlers);
    } else {
      input.value = formatFieldForInput(def.dataType, value);
      wireMetaDraftCommit(input, def.key, def.dataType, handlers);
    }
    if (def.constraints?.required) input.required = true;
    if (def.constraints?.maxLength) input.maxLength = def.constraints.maxLength;
    wrap.append(input);
  }
  parent.append(wrap);
}

type SchemaDetailFormOptions = {
  renderFiles?: (
    parent: HTMLElement,
    scan: NonNullable<ReturnType<typeof getSelectedScan>>,
  ) => void;
  hiddenFieldKeys?: Set<string>;
};

function appendSchemaFormChunk(main: HTMLElement): HTMLDivElement {
  const form = el("div", "detail-form schema-layout detail-form--compact");
  main.append(form);
  return form;
}

const DETAIL_FALLBACK_FIELD_KEYS = ["locId", "bezeichnung", "kategorie", "notes", "tags"] as const;

function renderSchemaDetailForm(
  main: HTMLElement,
  scan: { meta: import("../lib/meta-schema").DatasetMeta },
  schema: DatasetSchemaDefinition,
  handlers: ShellHandlers,
  options?: SchemaDetailFormOptions,
): void {
  const layout = schema.layout.length ? schema.layout : getDefaultSchema().layout;
  const form = appendSchemaFormChunk(main);
  const hiddenKeys = options?.hiddenFieldKeys ?? new Set<string>();
  const renderedOnce = new Set<string>();
  let renderedFieldCount = 0;
  let filesRendered = false;

  for (const row of layout) {
    const rowEl = el("div", "schema-form-row");
    for (const container of row.containers ?? []) {
      const colSpan = container.colSpan ?? 12;
      if (isFilesLayoutContainer(container)) {
        const box = el("section", "schema-form-container schema-form-container--files");
        box.style.gridColumn = `span ${colSpan}`;
        if (container.title?.trim()) {
          const title = el("h3", "schema-container-title");
          title.textContent = container.title;
          box.append(title);
        }
        if (options?.renderFiles) {
          options.renderFiles(box, scan as NonNullable<ReturnType<typeof getSelectedScan>>);
          filesRendered = true;
        }
        rowEl.append(box);
        continue;
      }

      const box = el("section", "schema-form-container");
      box.style.gridColumn = `span ${colSpan}`;
      if (container.title?.trim()) {
        const title = el("h3", "schema-container-title");
        title.textContent = container.title;
        box.append(title);
      }
      const keys = container.fieldKeys ?? [];
      if (!keys.length) continue;
      let visibleInBox = 0;
      for (const key of keys) {
        if (renderedOnce.has(key)) continue;
        const def = fieldDefByKey(schema.fields, key);
        if (!def) continue;
        if (hiddenKeys.has(key)) continue;
        renderSchemaFieldInput(box, def, scan, handlers);
        renderedOnce.add(key);
        renderedFieldCount++;
        visibleInBox++;
      }
      if (visibleInBox === 0) continue;
      rowEl.append(box);
    }
    if (rowEl.childNodes.length) form.append(rowEl);
  }

  if (options?.renderFiles && !filesRendered) {
    const rowEl = el("div", "schema-form-row");
    const box = el("section", "schema-form-container schema-form-container--files");
    box.style.gridColumn = "span 12";
    options.renderFiles(box, scan as NonNullable<ReturnType<typeof getSelectedScan>>);
    rowEl.append(box);
    form.append(rowEl);
  }

  if (renderedFieldCount === 0) {
    const box = el("section", "schema-form-container");
    const title = el("h3", "schema-container-title");
    title.textContent = "Metadaten";
    box.append(title);
    for (const key of DETAIL_FALLBACK_FIELD_KEYS) {
      if (hiddenKeys.has(key)) continue;
      const def = fieldDefByKey(schema.fields, key);
      if (!def) continue;
      renderSchemaFieldInput(box, def, scan, handlers);
      renderedFieldCount++;
    }
    if (renderedFieldCount > 0) {
      const rowEl = el("div", "schema-form-row");
      rowEl.append(box);
      form.append(rowEl);
    }
  }
}

function parseObsoleteFieldInput(raw: string): unknown {
  const t = raw.trim();
  if (!t) return "";
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function renderObsoleteFieldsSection(
  parent: HTMLElement,
  scan: { meta: import("../lib/meta-schema").DatasetMeta },
  schema: DatasetSchemaDefinition,
  handlers: ShellHandlers,
): void {
  const entries = listObsoleteFields(scan.meta, schema);
  if (!entries.length) return;

  const details = el("details", "obsolete-fields");
  const summary = el("summary");
  summary.textContent = `Nicht im Schema enthaltene Felder (${entries.length})`;
  const body = el("div", "obsolete-fields-body");
  const hint = el("p", "muted obsolete-hint");
  hint.textContent =
    "Diese Werte bleiben in meta.json erhalten. Schema-Änderungen (Umbenennung, Entfernen) löschen sie nicht.";
  body.append(hint);

  for (const entry of entries) {
    const row = el("label");
    row.className = "obsolete-field-row";
    const keyLabel = el("span", "obsolete-field-key");
    keyLabel.textContent = entry.key;
    row.append(keyLabel);
    const text = formatObsoleteValue(entry.value);
    if (text.length > 80 || text.includes("\n")) {
      const area = el("textarea", "field area obsolete-field-value");
      area.setAttribute("data-field-key", entry.key);
      const draftObs = getDraftFieldValue(entry.key, scan.meta.locId);
      area.value =
        draftObs !== undefined ? String(draftObs) : text === "—" ? "" : text;
      const readArea = () => parseObsoleteFieldInput(area.value);
      area.addEventListener("input", () => handlers.onMetaFieldDraft(entry.key, readArea()));
      area.addEventListener("change", () => handlers.onMetaFieldCommit(entry.key, readArea()));
      row.append(area);
    } else {
      const input = el("input", "field obsolete-field-value");
      input.type = "text";
      input.setAttribute("data-field-key", entry.key);
      const draftObs = getDraftFieldValue(entry.key, scan.meta.locId);
      input.value =
        draftObs !== undefined ? String(draftObs) : text === "—" ? "" : text;
      const readIn = () => parseObsoleteFieldInput(input.value);
      input.addEventListener("input", () => handlers.onMetaFieldDraft(entry.key, readIn()));
      input.addEventListener("change", () => handlers.onMetaFieldCommit(entry.key, readIn()));
      row.append(input);
    }
    body.append(row);
  }

  details.append(summary, body);
  parent.append(details);
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

function filteredDetailRows(): IndexRecord[] {
  return filterRecordsAdvanced(appState.records, currentRecordFilter(), appState.scans);
}

async function navigateFilteredDetail(delta: number): Promise<void> {
  try {
    await flushAllPendingMetaSaves();
  } catch {
    /* Fehler über persistStatus / Banner */
  }
  const rows = filteredDetailRows();
  if (!rows.length) return;
  const selected = appState.selectedLocId;
  let index = selected ? rows.findIndex((r) => locIdsReferToSameRecord(r.locId, selected)) : -1;
  if (index < 0) {
    index = delta > 0 ? -1 : rows.length;
  }
  const nextIndex = (index + delta + rows.length) % rows.length;
  const next = rows[nextIndex];
  if (!next || (selected && locIdsReferToSameRecord(next.locId, selected))) return;
  const scan = findScanByLocId(appState.scans, next.locId);
  patchState({ selectedLocId: scan?.meta.locId ?? next.locId, view: "detail" });
}

function renderDatasetFilesSection(
  parent: HTMLElement,
  scan: NonNullable<ReturnType<typeof getSelectedScan>>,
  handlers: ShellHandlers,
): void {
  const section = el("div", "dataset-files-section dataset-files-section--in-grid");

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

  section.append(drop, uploadBtn, fileInput);

  const images = scan.meta.files.filter((f) => isImagePath(f.path));
  const others = scan.meta.files.filter((f) => !isImagePath(f.path));

  if (images.length) {
    const h = el("h3", "files-heading");
    h.textContent = "Bilder";
    section.append(h);
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
    section.append(grid);
  }

  if (others.length) {
    const h2 = el("h3", "files-heading");
    h2.textContent = "Weitere Dateien";
    section.append(h2);
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
    section.append(list);
  }

  parent.append(section);
}

function renderDetail(main: HTMLElement, handlers: ShellHandlers): void {
  const scan = getSelectedScan();
  if (!scan) {
    const miss = el("div", "detail-missing");
    const p = el("p", "muted");
    p.textContent =
      appState.scans.length === 0
        ? "Kein Stammordner geladen — bitte oben „Ordner wählen“ und den Datenordner verbinden."
        : "Datensatz nicht gefunden oder nicht geladen.";
    const back = el("button", "btn");
    back.type = "button";
    back.textContent = "← Zurück zur Tabelle";
    back.addEventListener("click", () => patchState({ view: "table", selectedLocId: null }));
    miss.append(p);
    if (appState.selectedLocId) {
      const idHint = el("p", "muted");
      idHint.textContent = `Gesuchte ID: ${displayLocId(appState.selectedLocId)}`;
      miss.append(idHint);
    }
    miss.append(back);
    main.append(miss);
    return;
  }

  clearPreview();

  const rows = filteredDetailRows();
  const index = rows.findIndex((r) => locIdsReferToSameRecord(r.locId, scan.meta.locId));
  const hasFilter = hasActiveRecordFilter(currentRecordFilter());

  const toolbar = el("div", "detail-toolbar");
  const back = el("button", "btn");
  back.type = "button";
  back.textContent = "← Tabelle";
  back.addEventListener("click", () => {
    patchState({ view: "table" });
  });

  const prev = el("button", "btn");
  prev.type = "button";
  prev.textContent = "◀ Vorheriger";
  prev.disabled = rows.length <= 1;
  prev.title = hasFilter ? "Vorheriger Datensatz (aktuelle Suche/Filter)" : "Vorheriger Datensatz";
  prev.addEventListener("click", () => navigateFilteredDetail(-1));

  const next = el("button", "btn");
  next.type = "button";
  next.textContent = "Nächster ▶";
  next.disabled = rows.length <= 1;
  next.title = hasFilter ? "Nächster Datensatz (aktuelle Suche/Filter)" : "Nächster Datensatz";
  next.addEventListener("click", () => navigateFilteredDetail(1));

  const status = el("span", "detail-nav-status muted");
  if (!rows.length) {
    status.textContent = "Keine Treffer für aktuelle Filter";
  } else if (index >= 0) {
    status.textContent = `${index + 1} / ${rows.length}${hasFilter ? " (Filter)" : ""}`;
  } else {
    status.textContent = `Nicht in der Liste (${rows.length} Treffer${hasFilter ? ", Filter aktiv" : ""})`;
  }

  const delDs = el("button", "btn btn-danger detail-delete");
  delDs.type = "button";
  delDs.textContent = "Datensatz löschen…";
  delDs.title = "Verschiebt den Ordner nach deleted/ (Strg+Z zum Zurückholen)";
  delDs.disabled = !appState.ready;
  delDs.addEventListener("click", () => {
    const label = displayLocId(scan.meta.locId);
    const bez = scan.meta.bezeichnung.trim();
    const hint = bez ? `„${bez}“ (${label})` : label;
    if (
      !window.confirm(
        `${hint} in den Ordner „deleted“ verschieben?\n\nStrg+Z / ⌘Z holt den Datensatz zurück.`,
      )
    ) {
      return;
    }
    void handlers.onSoftDeleteDataset();
  });

  toolbar.append(back, prev, status, next, delDs);
  main.append(toolbar);

  const schema = resolveSchemaForDataset(scan.meta);
  const hiddenKeys = resolveDetailHiddenKeys(scan.meta, schema);
  renderSchemaDetailForm(main, scan, schema, handlers, {
    renderFiles: (parent, s) => renderDatasetFilesSection(parent, s, handlers),
    hiddenFieldKeys: hiddenKeys,
  });
  renderObsoleteFieldsSection(main, scan, schema, handlers);

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

function renderBanner(root: HTMLElement, text: string, variant: "error" | "ok"): void {
  const banner = el("div", `banner banner-${variant} banner-toast`);
  banner.setAttribute("role", "status");
  const label = el("span", "banner-text");
  label.textContent = text;
  const close = el("button", "banner-dismiss");
  close.type = "button";
  close.setAttribute("aria-label", "Meldung schließen");
  close.textContent = "×";
  close.addEventListener("click", () => dismissBanners());
  banner.append(label, close);
  root.append(banner);
}

function renderMessages(root: HTMLElement): void {
  if (appState.error) renderBanner(root, appState.error, "error");
  if (appState.message) renderBanner(root, appState.message, "ok");
}

export type ShellHandlers = {
  onPickFolder: () => Promise<void>;
  onSync: () => Promise<void>;
  canSync: () => boolean;
  onExcelExport: () => void;
  onExcelImport: () => void;
  onCsvImport: () => void;
  onOpenSettings: () => void;
  onNewDataset: () => Promise<void>;
  onMetaChange: (partial: { bezeichnung?: string; kategorie?: string; notes?: string }) => Promise<void>;
  onMetaFieldDraft: (fieldKey: string, value: unknown) => void;
  onMetaFieldCommit: (fieldKey: string, value: unknown) => void;
  onMetaFieldChange: (fieldKey: string, value: unknown) => Promise<void>;
  onAddFiles: (files: File[]) => Promise<void>;
  onPreviewFile: (relativePath: string) => Promise<void>;
  onDeleteFile: (relativePath: string) => Promise<void>;
  onFileMetaChange: (relativePath: string, patch: Partial<FileUserMeta>) => Promise<void>;
  onChangeDatasetId: (rawNewId: string) => Promise<void>;
  onSoftDeleteDataset: () => Promise<void>;
  onBulkSoftDelete: (locIds: string[]) => Promise<void>;
  onBulkAssignTag: (locIds: string[], tag: string) => Promise<void>;
  onSetFieldHidden: (
    fieldKey: string,
    hidden: boolean,
    schema?: DatasetSchemaDefinition,
  ) => Promise<void>;
  onUndo: () => Promise<void>;
  getFileObjectUrl: (relativePath: string) => Promise<string>;
  onRerender: () => void;
};

function installDetailKeyboardNav(): void {
  const onKey = (e: KeyboardEvent) => {
    const t = e.target;
    const typing =
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      (t instanceof HTMLElement && t.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      if (typing) return;
      e.preventDefault();
      void handlersRef?.onUndo();
      return;
    }
    if (appState.view !== "detail") return;
    if (typing) return;
    if (e.key === "ArrowLeft" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      navigateFilteredDetail(-1);
    } else if (e.key === "ArrowRight" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      navigateFilteredDetail(1);
    }
  };
  document.addEventListener("keydown", onKey);
}

let handlersRef: ShellHandlers | null = null;

export function mountShell(container: HTMLElement, handlers: ShellHandlers): void {
  handlersRef = handlers;
  installDetailKeyboardNav();
  subscribePersistIndicator(syncChromePersistIndicator);

  const render = () => {
    const sidebarFocus = captureSidebarFocus();
    const detailFocus = captureDetailFocus();
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
    restoreDetailFocus(container, detailFocus);
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