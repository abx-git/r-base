import {
  getWebDavPassword,
  getWebDavSettings,
  setWebDavPassword,
  setWebDavSettings,
} from "../lib/credentials";
import { getLoxIdPrefix } from "../lib/id-config";
import { propfind } from "../lib/webdav-client";
import { openSystemConfigModal } from "./system-config-modal";

export function openSettingsModal(onClose: () => void, onSchemaChanged?: () => void): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Einstellungen");

  const s = getWebDavSettings();

  dialog.innerHTML = `
    <h2>Einstellungen</h2>
    <h3>System</h3>
    <p class="muted">Schemata inkl. <strong>Lox-Prefix</strong> (<code id="schema-prefix-hint"></code> beim Standard-Schema), Felder, Layout und Tabellenspalten.</p>
    <button type="button" class="btn" data-action="system-config">Systemkonfiguration…</button>
    <h3>WebDAV (Synology)</h3>
    <label>Basis-URL <input class="field" name="baseUrl" type="url" placeholder="https://nas.example/webdav/r-base" /></label>
    <label>Benutzer <input class="field" name="username" autocomplete="username" /></label>
    <label>Passwort <input class="field" name="password" type="password" autocomplete="current-password" /></label>
    <p class="muted">Passwort wird nicht im Repository gespeichert — nur in dieser Sitzung (RAM).</p>
    <div class="modal-actions">
      <button type="button" class="btn" data-action="test">Verbindung testen</button>
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

  dialog.querySelector('[data-action="system-config"]')?.addEventListener("click", () => {
    backdrop.remove();
    openSystemConfigModal(() => onSchemaChanged?.());
  });

  dialog.querySelector('[data-action="close"]')?.addEventListener("click", () => {
    backdrop.remove();
    onClose();
  });

  dialog.querySelector('[data-action="save"]')?.addEventListener("click", () => {
    setWebDavSettings({ baseUrl: baseUrl.value, username: username.value });
    setWebDavPassword(password.value);
    status.textContent = "Gespeichert.";
    backdrop.remove();
    onClose();
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
    if (e.target === backdrop) {
      backdrop.remove();
      onClose();
    }
  });

  backdrop.append(dialog);
  document.body.append(backdrop);
}