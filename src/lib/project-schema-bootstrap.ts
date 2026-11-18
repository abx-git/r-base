import type { SystemSchemaConfig } from "./dataset-schema-types";
import { createMinimalDatasetSchema } from "./dataset-schema-defaults";

/** Erstes Schema für `r-base.project.json` in einem neuen Stammordner. */
export function createEmptyProjectSchemaConfig(): SystemSchemaConfig {
  const schema = createMinimalDatasetSchema({
    id: "basis-v1",
    name: "Leeres Basisschema",
    loxPrefix: "LOC",
  });
  return { configVersion: 1, defaultSchemaId: schema.id, schemas: [schema] };
}