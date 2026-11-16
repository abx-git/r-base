import { SCHEMA_EDITOR_TABS, type SchemaEditorTabId } from "./schema-editor-shared";

export type SchemaEditorShell = {
  backdrop: HTMLDivElement;
  dialog: HTMLDivElement;
  scrollBody: HTMLDivElement;
  statusEl: HTMLParagraphElement;
  titleEl: HTMLHeadingElement;
  subtitleEl: HTMLParagraphElement;
  navEl: HTMLDivElement;
  setStatus: (msg: string) => void;
  updateHeader: (title: string, subtitle: string) => void;
  renderNav: (active: SchemaEditorTabId, onSelect: (id: SchemaEditorTabId) => void) => void;
  close: () => void;
  tryClose: (dirty: boolean) => void;
  bindSave: (handler: () => void) => void;
  bindCancel: (handler: () => void) => void;
  focusDialog: () => void;
};

export function createSchemaEditorShell(): SchemaEditorShell {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "modal schema-editor-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.tabIndex = -1;

  const header = document.createElement("header");
  header.className = "schema-editor-header";
  const titleWrap = document.createElement("div");
  titleWrap.className = "schema-editor-title-wrap";
  const titleEl = document.createElement("h2");
  titleEl.className = "schema-editor-title";
  titleEl.textContent = "Schema bearbeiten";
  const subtitleEl = document.createElement("p");
  subtitleEl.className = "schema-editor-subtitle";
  subtitleEl.textContent = "";
  titleWrap.append(titleEl, subtitleEl);

  const closeTop = document.createElement("button");
  closeTop.type = "button";
  closeTop.className = "btn schema-editor-close";
  closeTop.textContent = "×";
  closeTop.title = "Schließen";
  closeTop.setAttribute("aria-label", "Schließen");
  header.append(titleWrap, closeTop);

  const main = document.createElement("div");
  main.className = "schema-editor-main";
  const navEl = document.createElement("nav");
  navEl.className = "schema-editor-nav";
  navEl.setAttribute("aria-label", "Schema-Bereiche");
  const scrollBody = document.createElement("div");
  scrollBody.className = "schema-editor-body-scroll";

  main.append(navEl, scrollBody);

  const footer = document.createElement("footer");
  footer.className = "schema-editor-footer";
  const statusEl = document.createElement("p");
  statusEl.className = "schema-editor-footer-status muted";
  const footerActions = document.createElement("div");
  footerActions.className = "schema-editor-footer-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn";
  cancelBtn.textContent = "Abbrechen";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn-primary";
  saveBtn.textContent = "Speichern";
  footerActions.append(cancelBtn, saveBtn);
  footer.append(statusEl, footerActions);

  dialog.append(header, main, footer);

  let onCancel: () => void = () => {};
  let onSave: () => void = () => {};
  let dirtyCheck: () => boolean = () => false;

  const tryClose = (dirty: boolean) => {
    if (dirty && !window.confirm("Änderungen verwerfen?")) return;
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  };

  const close = () => tryClose(dirtyCheck());

  closeTop.addEventListener("click", () => close());
  cancelBtn.addEventListener("click", () => onCancel());
  saveBtn.addEventListener("click", () => onSave());

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener("keydown", onKey);

  const shell: SchemaEditorShell = {
    backdrop,
    dialog,
    scrollBody,
    statusEl,
    titleEl,
    subtitleEl,
    navEl,
    setStatus: (msg) => {
      statusEl.textContent = msg;
    },
    updateHeader: (title, subtitle) => {
      titleEl.textContent = title;
      subtitleEl.textContent = subtitle;
    },
    renderNav: (active, onSelect) => {
      navEl.replaceChildren();
      for (const t of SCHEMA_EDITOR_TABS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `schema-editor-nav-btn${active === t.id ? " is-active" : ""}`;
        btn.setAttribute("aria-current", active === t.id ? "true" : "false");
        const label = document.createElement("span");
        label.className = "schema-editor-nav-label";
        label.textContent = t.label;
        const desc = document.createElement("span");
        desc.className = "schema-editor-nav-desc";
        desc.textContent = t.description;
        btn.append(label, desc);
        btn.addEventListener("click", () => onSelect(t.id));
        navEl.append(btn);
      }
    },
    close: () => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
    },
    tryClose,
    bindSave: (handler) => {
      onSave = handler;
    },
    bindCancel: (handler) => {
      onCancel = handler;
    },
    focusDialog: () => {
      dialog.focus();
    },
  };

  (shell as SchemaEditorShell & { _setDirtyCheck?: (fn: () => boolean) => void })._setDirtyCheck = (
    fn: () => boolean,
  ) => {
    dirtyCheck = fn;
  };

  return shell;
}

export function attachDirtyCheck(shell: SchemaEditorShell, isDirty: () => boolean): void {
  const extended = shell as SchemaEditorShell & { _setDirtyCheck?: (fn: () => boolean) => void };
  extended._setDirtyCheck?.(isDirty);
}