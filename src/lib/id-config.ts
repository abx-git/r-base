import { loxPrefixFromDefaultSchema, resolveSchemaForDataset } from "./dataset-schema-store";

/** Lox-Prefix des Standard-Schemas (neue Datensätze). Konfiguration: Systemkonfiguration → Schema. */
export function getLoxIdPrefix(): string {
  return loxPrefixFromDefaultSchema();
}

/** Prefix laut dem Datensatz-Schema (ID-Änderung, Validierung). */
export function getLoxIdPrefixForMeta(meta: { schemaKey?: string; locId: string }): string {
  return resolveSchemaForDataset(meta).loxPrefix;
}