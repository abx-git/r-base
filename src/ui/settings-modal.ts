import {
  getWebDavPassword,
  getWebDavSettings,
  setWebDavPassword,
  setWebDavSettings,
} from "../lib/credentials";
import { getLoxIdPrefix } from "../lib/id-config";
import { propfind } from "../lib/webdav-client";
import { openSystemConfigModal } from "./system-config-modal";
import { activeListSchemaId, loadSystemSchemaConfig } from "../lib/dataset-schema-store";
import { getProjectUiSettings, persistCurrentProjectConfig, setProjectUiSettings } from "../lib/project-config";
import { openSchemaEditorModal } from "./schema-editor-modal";
import { appState } from "../state";

export type SettingsHandlers = {
  onClose: () => void;
  onSchemaChanged: () => void;
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

  dialog.innerHTML = `
    <h2>Einstellungen</h2>

    <section class="settings-section">
      <h3>Schemata</h3>
      <p class="muted settings-intro">
        Feldkatalog, Tabellen, Formulare und Exporte — Speicherort:
        <code>r-base.project.json</code>
        (Lox-Prefix Standardschema: <code id="schema-prefix-hint"></code>).
      </p>
      <p class="muted settings-intro">
        Aktives Schema (Tabelle, neue Datensätze): Auswahl in der Kopfzeile neben „Stamm:“.
      </p>
      <div class="settings-btn-row">
        <button type="button" class="btn" data-action="system-config">Schemata verwalten…</button>
      </div>

      <h4 class="settings-subhead">Schema bearbeiten</h4>
      <p class="muted settings-intro">Öffnet den Editor — Tab entspricht dem Bereich.</p>
      <div class="settings-btn-grid">
        <button type="button" class="btn" data-action="edit-liste">Tabelle</button>
        <button type="button" class="btn" data-action="edit-detail">Detail</button>
        <button type="button" class="btn" data-action="edit-excel">Excel</button>
        <button type="button" class="btn" data-action="edit-export">PDF &amp; HTML</button>
      </div>
    </section>

    <section class="settings-section">
      <h3>Oberfläche</h3>
      <label class="settings-row settings-check-row">
        <input type="checkbox" data-show-obsolete />
        <span>Zusatzfelder unter dem Formular anzeigen („Felder außerhalb des Schemas“)</span>
      </label>
    </section>

    <section class="settings-section">
      <h3>Synchronisation (WebDAV)</h3>
      <label>Basis-URL <input class="field" name="baseUrl" type="url" placeholder="https://nas.example/webdav/r-base" /></label>
      <label>Benutzer <input class="field" name="username" autocomplete="username" /></label>
      <label>Passwort <input class="field" name="password" type="password" autocomplete="current-password" /></label>
      <p class="muted settings-intro">
        URL und Benutzer werden in der Projektdatei gespeichert. Das Passwort gilt nur für diese Sitzung.
      </p>
      <button type="button" class="btn" data-action="test">Verbindung testen</button>
    </section>

    <div class="modal-actions settings-modal-actions">
      <button type="button" class="btn btn-primary" data-action="save">Speichern</button>
      <button type="button" class="btn" data-action="close">Schließen</button>
    </div>
    <p class="modal-status muted" data-status></p>
  `;

  const prefixHint = dialog.querySelector<HTMLElement>("#schema-prefix-hint");
  if (prefixHint) prefixHint.textContent = `${getLoxIdPrefix()}-XXXX-XXXX`;

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

  const schemaIdFromListSelect = () => activeListSchemaId(appState.listViewSchemaId);

  const openEditor = (initialTab: "liste" | "excel" | "detail" | "export") => {
    backdrop.remove();
    handlers.onClose();
    openSchemaEditorModal(schemaIdFromListSelect(), handlers.onRerender, { initialTab });
  };

  const showObsoleteCb = dialog.querySelector<HTMLInputElement>("[data-show-obsolete]")!;
  showObsoleteCb.checked = getProjectUiSettings().showObsoleteFieldsInDetail;

  dialog.querySelector('[data-action="system-config"]')?.addEventListener("click", () => {
    backdrop.remove();
    handlers.onClose();
    openSystemConfigModal(() => handlers.onSchemaChanged());
  });

  dialog.querySelector('[data-action="edit-liste"]')?.addEventListener("click", () => {
    openEditor("liste");
  });

  dialog.querySelector('[data-action="edit-detail"]')?.addEventListener("click", () => {
    openEditor("detail");
  });

  dialog.querySelector('[data-action="edit-excel"]')?.addEventListener("click", () => {
    openEditor("excel");
  });

  dialog.querySelector('[data-action="edit-export"]')?.addEventListener("click", () => {
    openEditor("export");
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