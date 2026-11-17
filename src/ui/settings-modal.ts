import {
  getWebDavPassword,
  getWebDavSettings,
  setWebDavPassword,
  setWebDavSettings,
} from "../lib/credentials";
import { getLoxIdPrefix } from "../lib/id-config";
import { propfind } from "../lib/webdav-client";
import { openSystemConfigModal } from "./system-config-modal";
import {
  getDefaultSchemaId,
  loadSystemSchemaConfig,
  resolveSchemaForDataset,
} from "../lib/dataset-schema-store";
import { getProjectUiSettings, persistCurrentProjectConfig, setProjectUiSettings } from "../lib/project-config";
import { openSchemaEditorModal } from "./schema-editor-modal";
import { appState, patchState } from "../state";
import type { DatasetSchemaDefinition } from "../lib/dataset-schema-types";

export type SettingsHandlers = {
  onClose: () => void;
  onSchemaChanged: () => void;
  onSetFieldHidden: (
    fieldKey: string,
    hidden: boolean,
    schema?: DatasetSchemaDefinition,
  ) => Promise<void>;
  onRerender: () => void;
};

export function openSettingsModal(handlers: SettingsHandlers): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "modal modal-wide settings-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Einstellungen");

  const s = getWebDavSettings();
  const selectedScan = appState.selectedLocId
    ? appState.scans.find(
        (sc) => sc.meta.locId === appState.selectedLocId || sc.locId === appState.selectedLocId,
      )
    : undefined;

  dialog.innerHTML = `
    <h2>Einstellungen</h2>

    <section class="settings-section">
      <h3>Schemata &amp; Sichtbarkeit</h3>
      <p class="muted settings-intro">
        Felder, Tabellenspalten, Detail-Layout und Ein-/Ausblenden — gespeichert in
        <code>r-base.project.json</code> (Lox-Prefix am Standard-Schema:
        <code id="schema-prefix-hint"></code>).
      </p>
      <label class="settings-row">
        <span>Schema für Tabellenansicht</span>
        <select class="field" data-list-schema></select>
      </label>
      <div class="settings-btn-row">
        <button type="button" class="btn" data-action="system-config">Schemata verwalten…</button>
        <button type="button" class="btn" data-action="edit-liste">Listenansicht…</button>
        <button type="button" class="btn" data-action="edit-detail">Detailformular…</button>
        <button type="button" class="btn" data-action="edit-excel">Excel-Export…</button>
        <button type="button" class="btn" data-action="edit-export">Exportformular…</button>
      </div>
      <div class="settings-btn-row" data-dataset-row hidden>
        <button type="button" class="btn" data-action="edit-dataset">Aktueller Datensatz: Sichtbarkeit…</button>
      </div>
      <p class="muted settings-hint" data-dataset-hint hidden></p>
      <label class="settings-row settings-check-row">
        <input type="checkbox" data-show-obsolete />
        <span>Zusatzfelder in der Detailansicht („Felder außerhalb des Schemas“)</span>
      </label>
      <p class="muted settings-intro">
        Wenn aktiv: ausklappbarer Bereich unter dem Schema-Formular. Liegt in
        <code>r-base.project.json</code> unter <code>settings.ui</code>.
      </p>
    </section>

    <section class="settings-section">
      <h3>WebDAV (Synology)</h3>
      <label>Basis-URL <input class="field" name="baseUrl" type="url" placeholder="https://nas.example/webdav/r-base" /></label>
      <label>Benutzer <input class="field" name="username" autocomplete="username" /></label>
      <label>Passwort <input class="field" name="password" type="password" autocomplete="current-password" /></label>
      <p class="muted">URL und Benutzer werden in der Projektdatei gespeichert. Das Passwort bleibt nur in dieser Sitzung (RAM).</p>
    </section>

    <div class="modal-actions">
      <button type="button" class="btn" data-action="test">Verbindung testen</button>
      <button type="button" class="btn btn-primary" data-action="save">Speichern</button>
      <button type="button" class="btn" data-action="close">Schließen</button>
    </div>
    <p class="modal-status muted" data-status></p>
  `;

  const prefixHint = dialog.querySelector<HTMLElement>("#schema-prefix-hint");
  if (prefixHint) prefixHint.textContent = `${getLoxIdPrefix()}-XXXX-XXXX`;

  const listSchemaSelect = dialog.querySelector<HTMLSelectElement>("[data-list-schema]")!;
  const activeListId = appState.listViewSchemaId ?? getDefaultSchemaId();
  const cfg = loadSystemSchemaConfig();
  for (const schema of cfg.schemas) {
    const opt = document.createElement("option");
    opt.value = schema.id;
    opt.textContent = schema.name;
    if (schema.id === activeListId) opt.selected = true;
    listSchemaSelect.append(opt);
  }
  listSchemaSelect.disabled = !appState.ready;

  const datasetRow = dialog.querySelector<HTMLElement>("[data-dataset-row]")!;
  const datasetHint = dialog.querySelector<HTMLElement>("[data-dataset-hint]")!;
  if (selectedScan && appState.ready) {
    datasetRow.hidden = false;
    const bez = selectedScan.meta.bezeichnung.trim() || selectedScan.meta.locId;
    datasetHint.hidden = false;
    datasetHint.textContent = `Gilt für „${bez}“ (Detailansicht geöffnet oder ausgewählt).`;
  }

  const baseUrl = dialog.querySelector<HTMLInputElement>('input[name="baseUrl"]')!;
  const username = dialog.querySelector<HTMLInputElement>('input[name="username"]')!;
  const password = dialog.querySelector<HTMLInputElement>('input[name="password"]')!;
  const status = dialog.querySelector<HTMLParagraphElement>("[data-status]")!;

  baseUrl.value = s.baseUrl;
  username.value = s.username;
  password.value = getWebDavPassword();

  const close = () => {
    backdrop.remove();
    handlers.onClose();
  };

  const schemaIdFromListSelect = () => listSchemaSelect.value || getDefaultSchemaId();

  const openEditor = (initialTab: "liste" | "excel" | "detail" | "export", withDataset: boolean) => {
    const schemaId = withDataset && selectedScan
      ? resolveSchemaForDataset(selectedScan.meta).id
      : schemaIdFromListSelect();
    backdrop.remove();
    handlers.onClose();
    openSchemaEditorModal(schemaId, handlers.onRerender, {
      initialTab: withDataset ? "detail" : initialTab,
      datasetContext:
        withDataset && selectedScan
          ? {
              locId: selectedScan.meta.locId,
              getMeta: () =>
                appState.scans.find((sc) => sc.meta.locId === selectedScan.meta.locId)?.meta,
              onSetFieldHidden: (fieldKey, hidden, schema) =>
                handlers.onSetFieldHidden(fieldKey, hidden, schema),
              onRerender: handlers.onRerender,
            }
          : undefined,
    });
  };

  const showObsoleteCb = dialog.querySelector<HTMLInputElement>("[data-show-obsolete]")!;
  showObsoleteCb.checked = getProjectUiSettings().showObsoleteFieldsInDetail;

  listSchemaSelect.addEventListener("change", () => {
    const id = listSchemaSelect.value.trim();
    patchState({ listViewSchemaId: id === getDefaultSchemaId() ? null : id });
    handlers.onRerender();
    status.textContent = "Tabellen-Schema übernommen.";
  });

  dialog.querySelector('[data-action="system-config"]')?.addEventListener("click", () => {
    backdrop.remove();
    handlers.onClose();
    openSystemConfigModal(() => handlers.onSchemaChanged());
  });

  dialog.querySelector('[data-action="edit-liste"]')?.addEventListener("click", () => {
    openEditor("liste", false);
  });

  dialog.querySelector('[data-action="edit-detail"]')?.addEventListener("click", () => {
    openEditor("detail", false);
  });

  dialog.querySelector('[data-action="edit-excel"]')?.addEventListener("click", () => {
    openEditor("excel", false);
  });

  dialog.querySelector('[data-action="edit-export"]')?.addEventListener("click", () => {
    openEditor("export", false);
  });

  dialog.querySelector('[data-action="edit-dataset"]')?.addEventListener("click", () => {
    if (!selectedScan) return;
    openEditor("detail", true);
  });

  dialog.querySelector('[data-action="close"]')?.addEventListener("click", () => close());

  dialog.querySelector('[data-action="save"]')?.addEventListener("click", () => {
    void (async () => {
      setWebDavSettings({ baseUrl: baseUrl.value, username: username.value });
      setWebDavPassword(password.value);
      const ui = { showObsoleteFieldsInDetail: showObsoleteCb.checked };
      setProjectUiSettings(ui);
      try {
        await persistCurrentProjectConfig(loadSystemSchemaConfig(), getWebDavSettings(), ui);
        handlers.onRerender();
        status.textContent = "Gespeichert (inkl. r-base.project.json im Stammordner).";
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : String(e);
        return;
      }
      close();
    })();
  });

  dialog.querySelector('[data-action="test"]')?.addEventListener("click", async () => {
    setWebDavSettings({ baseUrl: baseUrl.value, username: username.value });
    setWebDavPassword(password.value);
    status.textContent = "Teste…";
    try {
      await propfind("", "0");
      status.textContent = "PROPFIND erfolgreich.";
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : String(e);
    }
  });

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  backdrop.append(dialog);
  document.body.append(backdrop);
}