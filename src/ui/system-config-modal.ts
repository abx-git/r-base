import {
  getDefaultSchemaId,
  loadSystemSchemaConfig,
  removeSchemaDefinition,
  resetSchemasToDefaults,
  setDefaultSchemaId,
  upsertSchemaDefinition,
} from "../lib/dataset-schema-store";
import type { DatasetSchemaDefinition } from "../lib/dataset-schema-types";
import { openSchemaEditorModal } from "./schema-editor-modal";

export function openSystemConfigModal(onChanged: () => void): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "modal modal-wide";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Systemkonfiguration");

  const renderList = () => {
    const cfg = loadSystemSchemaConfig();
    list.replaceChildren();
    for (const schema of cfg.schemas) {
      const row = document.createElement("div");
      row.className = "schema-list-row";
      const title = document.createElement("div");
      title.className = "schema-list-title";
      title.textContent = schema.name;
      const sub = document.createElement("div");
      sub.className = "muted schema-list-sub";
      sub.textContent = `${schema.id} · Prefix ${schema.loxPrefix} · ${schema.fields.length} Felder`;
      title.append(sub);

      const actions = document.createElement("div");
      actions.className = "schema-list-actions";

      const defaultRadio = document.createElement("input");
      defaultRadio.type = "radio";
      defaultRadio.name = "defaultSchema";
      defaultRadio.checked = cfg.defaultSchemaId === schema.id;
      defaultRadio.title = "Standard für neue Datensätze";
      defaultRadio.addEventListener("change", () => {
        setDefaultSchemaId(schema.id);
        onChanged();
        renderList();
      });

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn";
      editBtn.textContent = "Bearbeiten…";
      editBtn.addEventListener("click", () => {
        openSchemaEditorModal(schema.id, () => {
          onChanged();
          renderList();
        });
      });

      const dupBtn = document.createElement("button");
      dupBtn.type = "button";
      dupBtn.className = "btn";
      dupBtn.textContent = "Duplizieren";
      dupBtn.addEventListener("click", () => {
        const copy = duplicateSchema(schema);
        openSchemaEditorModal(copy.id, () => {
          onChanged();
          renderList();
        });
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn";
      delBtn.textContent = "Löschen";
      delBtn.disabled = Boolean(schema.builtin) || cfg.schemas.length <= 1;
      delBtn.addEventListener("click", () => {
        if (!window.confirm(`Schema „${schema.name}“ wirklich entfernen?`)) return;
        removeSchemaDefinition(schema.id);
        onChanged();
        renderList();
      });

      actions.append(defaultRadio, editBtn, dupBtn, delBtn);
      row.append(title, actions);
      list.append(row);
    }
    status.textContent = `Standard: ${getDefaultSchemaId()}`;
  };

  dialog.innerHTML = `
    <h2>Systemkonfiguration</h2>
    <p class="muted">Schemata legen Felder, Validierung, Detail-Layout und Tabellenspalten fest. Gespeichert in <code>r-base.project.json</code> im Stammordner.</p>
    <div class="schema-list" data-list></div>
    <div class="modal-actions">
      <button type="button" class="btn" data-action="reset">Auf Werkszustand</button>
      <button type="button" class="btn btn-primary" data-action="close">Schließen</button>
    </div>
    <p class="modal-status muted" data-status></p>
  `;

  const list = dialog.querySelector<HTMLDivElement>("[data-list]")!;
  const status = dialog.querySelector<HTMLParagraphElement>("[data-status]")!;

  dialog.querySelector('[data-action="close"]')?.addEventListener("click", () => {
    backdrop.remove();
    onChanged();
  });

  dialog.querySelector('[data-action="reset"]')?.addEventListener("click", () => {
    if (!window.confirm("Alle Schema-Anpassungen verwerfen und Standard wiederherstellen?")) return;
    resetSchemasToDefaults();
    onChanged();
    renderList();
  });

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
      onChanged();
    }
  });

  renderList();
  backdrop.append(dialog);
  document.body.append(backdrop);
}

function duplicateSchema(schema: DatasetSchemaDefinition): DatasetSchemaDefinition {
  const base = `${schema.id}-kopie`;
  let id = base;
  const cfg = loadSystemSchemaConfig();
  let n = 1;
  while (cfg.schemas.some((s) => s.id === id)) {
    id = `${base}-${n++}`;
  }
  const copy = structuredClone(schema);
  copy.id = id;
  copy.name = `${schema.name} (Kopie)`;
  delete copy.builtin;
  upsertSchemaDefinition(copy);
  return copy;
}