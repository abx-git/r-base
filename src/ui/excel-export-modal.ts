import type { IndexRecord } from "../lib/db-index";
import { describeExportScope, type PreparedExport } from "../lib/export-scans";
import { getSchemaById, loadSystemSchemaConfig, resolveSchemaForDataset } from "../lib/dataset-schema-store";
import { downloadBlob, exportSchemaMetadataXlsx, excelExportFilename } from "../lib/excel-io";

export function openSchemaExcelExportModal(
  prepared: PreparedExport,
  records: IndexRecord[],
  onStatus: (msg: string, isError?: boolean) => void,
): void {
  const { scans, filter, sort, selectionOnly } = prepared;
  const cfg = loadSystemSchemaConfig();
  if (!cfg.schemas.length) {
    onStatus("Kein Schema konfiguriert.", true);
    return;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "modal schema-export-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Metadaten als Excel exportieren");

  const title = document.createElement("h2");
  title.textContent = "Excel exportieren";

  const intro = document.createElement("p");
  intro.className = "muted";
  intro.textContent =
    "Zeilen und Reihenfolge wie in der Tabelle (aktives Schema, Suche, Tags, Spaltenfilter, Sortierung; mit gesetzter Zeilen-Auswahl nur diese).";

  const schemaLabel = document.createElement("label");
  schemaLabel.className = "schema-export-row";
  const schemaSpan = document.createElement("span");
  schemaSpan.textContent = "Schema";
  const schemaSelect = document.createElement("select");
  schemaSelect.className = "field";
  for (const s of cfg.schemas) {
    const opt = document.createElement("option");
    opt.value = s.id;
    const count = scans.filter((sc) => resolveSchemaForDataset(sc.meta).id === s.id).length;
    opt.textContent = `${s.name} (${count} Datensätze)`;
    if (filter.listSchemaId ? s.id === filter.listSchemaId : s.id === cfg.defaultSchemaId) opt.selected = true;
    schemaSelect.append(opt);
  }
  schemaLabel.append(schemaSpan, schemaSelect);

  const filterNote = document.createElement("p");
  filterNote.className = "muted schema-export-filter-note";
  filterNote.textContent = describeExportScope(filter, scans.length, sort, selectionOnly);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn";
  cancelBtn.textContent = "Abbrechen";
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn btn-primary";
  exportBtn.textContent = "Excel erstellen";

  const close = () => {
    backdrop.remove();
  };

  cancelBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  exportBtn.addEventListener("click", () => {
    const schema = getSchemaById(schemaSelect.value);
    if (!schema) {
      onStatus("Schema nicht gefunden.", true);
      return;
    }
    const schemaScans = scans.filter((sc) => resolveSchemaForDataset(sc.meta).id === schema.id);
    const byLoc = new Map(records.map((r) => [r.locId, r]));
    const schemaRecords = schemaScans
      .map((s) => byLoc.get(s.meta.locId))
      .filter((r): r is IndexRecord => Boolean(r));
    exportBtn.disabled = true;
    exportBtn.textContent = "Erstelle Excel…";
    try {
      const blob = exportSchemaMetadataXlsx(schemaScans, schema, schemaRecords);
      const filename = excelExportFilename(schema);
      downloadBlob(blob, filename);
      onStatus(`Excel erstellt: ${schemaScans.length} Zeilen → ${filename}`);
      close();
    } catch (e: unknown) {
      onStatus(e instanceof Error ? e.message : String(e), true);
      exportBtn.disabled = false;
      exportBtn.textContent = "Excel erstellen";
    }
  });

  dialog.append(title, intro, schemaLabel, filterNote);
  dialog.append(actions);
  actions.append(cancelBtn, exportBtn);
  backdrop.append(dialog);
  document.body.append(backdrop);
  exportBtn.focus();
}