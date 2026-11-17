import type { DatasetScan } from "../lib/fs-local";
import type { RecordFilterState } from "../lib/record-filter";
import { hasActiveRecordFilter } from "../lib/record-filter";
import { getSchemaById, loadSystemSchemaConfig, resolveSchemaForDataset } from "../lib/dataset-schema-store";
import { writeSchemaHtmlExportToRoot } from "../lib/schema-html-export";

export function openSchemaHtmlExportModal(
  root: FileSystemDirectoryHandle,
  scans: DatasetScan[],
  filter: RecordFilterState,
  onStatus: (msg: string, isError?: boolean) => void,
): void {
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
  dialog.setAttribute("aria-label", "HTML-Website exportieren");

  const title = document.createElement("h2");
  title.textContent = "HTML-Export";

  const intro = document.createElement("p");
  intro.className = "muted";
  const filterActive = hasActiveRecordFilter(filter);
  intro.textContent = filterActive
    ? "Es wird ein Ordner im Stammverzeichnis angelegt (nur gefilterte Datensätze). Layout und Bilder laut „Exportformular“."
    : "Es wird ein Ordner unter _exports/html/ im Stammordner erzeugt — Startseite plus eine Unterseite pro Datensatz.";

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
    if (s.id === cfg.defaultSchemaId) opt.selected = true;
    schemaSelect.append(opt);
  }
  schemaLabel.append(schemaSpan, schemaSelect);

  let filterNote: HTMLElement | null = null;
  if (filterActive) {
    filterNote = document.createElement("p");
    filterNote.className = "muted schema-export-filter-note";
    const q = filter.query.trim();
    const parts: string[] = [];
    if (q) parts.push(`Suche: „${q}"`);
    if (filter.tagRules.length) parts.push(`${filter.tagRules.length} Tag-Regel(n)`);
    filterNote.textContent = `Filter aktiv (${parts.join(" · ")}). Es werden ${scans.length} Datensätze berücksichtigt.`;
  }

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
  optCover.append(coverCb, document.createTextNode(" Startseite mit Inhaltsverzeichnis"));

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn";
  cancelBtn.textContent = "Abbrechen";
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn btn-primary";
  exportBtn.textContent = "HTML erstellen";

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
    exportBtn.textContent = "Erstelle Seiten…";
    void writeSchemaHtmlExportToRoot(root, schema, scans, {
      omitEmptyOptional: emptyCb.checked,
      includeCover: coverCb.checked,
    })
      .then((result) => {
        onStatus(
          `HTML-Export: ${result.datasetCount} Unterseiten → Ordner „${result.relativeDir}“ (index.html öffnen).`,
        );
        close();
      })
      .catch((e: unknown) => {
        onStatus(e instanceof Error ? e.message : String(e), true);
        exportBtn.disabled = false;
        exportBtn.textContent = "HTML erstellen";
      });
  });

  actions.append(cancelBtn, exportBtn);
  dialog.append(title, intro, schemaLabel);
  if (filterNote) dialog.append(filterNote);
  dialog.append(optEmpty, optCover, actions);
  backdrop.append(dialog);
  document.body.append(backdrop);
  schemaSelect.focus();
}