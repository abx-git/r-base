import type { DatasetSchemaDefinition } from "./dataset-schema-types";

export function validateSchemaDefinition(draft: DatasetSchemaDefinition): string | null {
  if (!draft.id.trim()) return "ID fehlt.";
  if (!draft.name.trim()) return "Name fehlt.";
  if (!/^[A-Z0-9]{2,8}$/.test(draft.loxPrefix)) return "Prefix ungültig (2–8 Zeichen, A–Z/0–9).";
  if (!draft.fields.some((f) => f.key === "locId")) return "Feld locId ist erforderlich.";
  const keys = new Set<string>();
  for (const f of draft.fields) {
    if (keys.has(f.key)) return `Doppelter Feld-Key: ${f.key}`;
    keys.add(f.key);
  }
  if (!draft.tableColumns.length) return "Mindestens eine Tabellenspalte.";
  if (!draft.layout.length) return "Mindestens eine Layout-Zeile.";
  return null;
}