import { getSchemaById, upsertSchemaDefinition } from "../lib/dataset-schema-store";
import type { DatasetSchemaDefinition } from "../lib/dataset-schema-types";
import type { DatasetMeta } from "../lib/meta-schema";
import { renderDetailformular } from "./schema-editor-detail";
import { renderFeldkatalog } from "./schema-editor-felder";
import { renderListenansicht } from "./schema-editor-liste";
import { attachDirtyCheck, createSchemaEditorShell } from "./schema-editor-shell";
import { renderStammdaten } from "./schema-editor-stammdaten";
import {
  isDraftDirty,
  mapInitialTab,
  type SchemaEditorInitialTab,
  type SchemaEditorTabId,
  validateDraft,
  validationErrorTab,
} from "./schema-editor-shared";

export type SchemaEditorOpenOptions = {
  initialTab?: SchemaEditorInitialTab;
  datasetContext?: {
    meta: DatasetMeta;
    onSetFieldHidden: (fieldKey: string, hidden: boolean) => Promise<void>;
    onRerender: () => void;
  };
};

export function openSchemaEditorModal(
  schemaId: string,
  onSaved: () => void,
  options?: SchemaEditorOpenOptions,
): void {
  const existing = getSchemaById(schemaId);
  if (!existing) return;

  const original = structuredClone(existing);
  let draft = structuredClone(existing);
  let tab: SchemaEditorTabId = mapInitialTab(options?.initialTab, Boolean(options?.datasetContext));

  const shell = createSchemaEditorShell();
  attachDirtyCheck(shell, () => isDraftDirty(original, draft));

  const renderBody = () => {
    shell.updateHeader(draft.name || "Schema bearbeiten", `Schema-ID: ${draft.id}`);
    shell.renderNav(tab, (next) => {
      tab = next;
      shell.setStatus("");
      renderBody();
    });

    const parent = shell.scrollBody;
    switch (tab) {
      case "stammdaten":
        renderStammdaten(parent, draft);
        break;
      case "felder":
        renderFeldkatalog(parent, {
          draft,
          setStatus: shell.setStatus,
          rerender: renderBody,
        });
        break;
      case "liste":
        renderListenansicht(parent, {
          getDraft: () => draft,
          setDraft: (next) => {
            draft = next;
          },
          rerender: renderBody,
        });
        break;
      case "detail":
        renderDetailformular(parent, {
          draft,
          datasetContext: options?.datasetContext,
          rerender: renderBody,
        });
        break;
    }
  };

  shell.bindCancel(() => {
    shell.tryClose(isDraftDirty(original, draft));
  });

  shell.bindSave(() => {
    const err = validateDraft(draft);
    if (err) {
      shell.setStatus(err);
      const jump = validationErrorTab(err);
      if (jump && jump !== tab) {
        tab = jump;
        renderBody();
      }
      return;
    }
    upsertSchemaDefinition(draft);
    onSaved();
    shell.close();
  });

  renderBody();
  shell.focusDialog();
  document.body.append(shell.backdrop);
  shell.backdrop.append(shell.dialog);
}