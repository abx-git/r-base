import type { IndexRecord } from "./db-index";
import type { DatasetMeta } from "./meta-schema";
import type { TableColumnDef } from "./dataset-schema-types";
import { displayLocId } from "./meta-schema";
import { getMetaFieldValue } from "./meta-field-access";

export function formatTableCell(
  col: TableColumnDef,
  record: IndexRecord,
  meta?: DatasetMeta,
): string {
  if (col.source === "index") {
    switch (col.fieldKey) {
      case "fileCount":
        return String(record.fileCount);
      case "syncStatus":
        return record.syncStatus;
      case "lastModified":
        return record.lastModified ? new Date(record.lastModified).toLocaleString("de-DE") : "—";
      default:
        return "—";
    }
  }
  if (!meta) return "—";
  const v = getMetaFieldValue(meta, col.fieldKey);
  if (col.fieldKey === "locId") return displayLocId(String(v ?? meta.locId));
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  return String(v);
}