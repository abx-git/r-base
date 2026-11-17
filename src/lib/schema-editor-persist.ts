import { upsertSchemaDefinition } from "./dataset-schema-store";
import type { DatasetSchemaDefinition } from "./dataset-schema-types";
import { prepareSchemaEditorDraft } from "./field-placement-editor";
import { validateSchemaDefinition } from "./schema-validation";

/** Schreibt r-base.project.json (wenn Projektroot gebunden), sonst nur In-Memory-Store. */
export function persistSchemaDefinition(draft: DatasetSchemaDefinition): string | null {
  prepareSchemaEditorDraft(draft);
  const err = validateSchemaDefinition(draft);
  if (err) return err;
  upsertSchemaDefinition(structuredClone(draft));
  return null;
}