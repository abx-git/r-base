import { describeExportScope, type PreparedExport } from "../lib/export-scans";
import { getSchemaById, loadSystemSchemaConfig, resolveSchemaForDataset } from "../lib/dataset-schema-store";
import { buildSchemaPdf, schemaPdfFilename } from "../lib/schema-pdf-export";
import { downloadBlob } from "../lib/excel-io";

export function openSchemaPdfExportModal(
  prepared: PreparedExport,
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
  dialog.setAttribute("aria-label", "Schema als PDF exportieren");

  const title = document.createElement("h2");
  title.textContent = "Schema-PDF exportieren";

  const intro = document.createElement("p");
  intro.className = "muted";
  intro.textContent =
    "Datensätze und Reihenfolge wie in der Tabelle (Filter/Sortierung; mit Zeilen-Auswahl nur markierte). Layout laut „Exportformular“.";

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

  const optEmpty = document.createElement("label");
  optEmpty.className = "schema-export-check";
  const emptyCb = document.createElement("input");
  emptyCb.type = "checkbox";
  emptyCb.checked = true;
  optEmpty.append(emptyCb, document.createTextNode(" Leere optionale Felder ausblenden"));

  const optCover = document.createElement("label");
  optCover.className = "schema-export-check";
  const coverCb = document.createElement("input");
  coverCb.type = "checkbox";
  coverCb.checked = true;
  optCover.append(coverCb, document.createTextNode(" Deckblatt mit Übersicht"));

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn";
  cancelBtn.textContent = "Abbrechen";
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn btn-primary";
  exportBtn.textContent = "PDF erstellen";

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
    exportBtn.disabled = true;
    exportBtn.textContent = "Erstelle PDF…";
    void buildSchemaPdf(schema, scans, {
      omitEmptyOptional: emptyCb.checked,
      includeCover: coverCb.checked,
    })
      .then((blob) => {
        const filename = schemaPdfFilename(schema);
        const count = scans.filter((sc) => resolveSchemaForDataset(sc.meta).id === schema.id).length;
        downloadBlob(blob, filename);
        onStatus(`PDF erstellt: ${count} Datenblätter → ${filename}`);
        close();
      })
      .catch((e: unknown) => {
        onStatus(e instanceof Error ? e.message : String(e), true);
        exportBtn.disabled = false;
        exportBtn.textContent = "PDF erstellen";
      });
  });

  actions.append(cancelBtn, exportBtn);
  dialog.append(title, intro, schemaLabel, filterNote);
  dialog.append(optEmpty, optCover, actions);
  backdrop.append(dialog);
  document.body.append(backdrop);
  schemaSelect.focus();
}