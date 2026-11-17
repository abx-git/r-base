import type { IndexRecord } from "./db-index";
import type { DatasetMeta } from "./meta-schema";
import type { TableColumnDef } from "./dataset-schema-types";
import type { TableSortState } from "../state";
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
  if (col.fieldKey === "tags") {
    const tags = record.tags?.length ? record.tags : meta?.tags;
    if (!tags?.length) return "—";
    return tags.join(", ");
  }
  const indexFallbackForMeta = (): string | null => {
    if (col.source !== "meta" && col.source !== undefined) return null;
    switch (col.fieldKey) {
      case "bezeichnung": {
        const t = record.bezeichnung?.trim() || meta?.bezeichnung?.trim();
        return t || null;
      }
      case "kategorie": {
        const t = record.kategorie?.trim() || meta?.kategorie?.trim();
        return t || null;
      }
      case "locId":
        return displayLocId(meta?.locId?.trim() || record.locId);
      default:
        return null;
    }
  };
  if (!meta) {
    const fb = indexFallbackForMeta();
    if (fb) return fb;
    return "—";
  }
  const v = getMetaFieldValue(meta, col.fieldKey);
  if (col.fieldKey === "locId") return displayLocId(String(v ?? meta.locId ?? record.locId));
  if (v === null || v === undefined || v === "") {
    const fb = indexFallbackForMeta();
    return fb ?? "—";
  }
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  return String(v);
}

export function tableTagsForRow(col: TableColumnDef, record: IndexRecord, meta?: DatasetMeta): string[] {
  if (col.fieldKey !== "tags") return [];
  const tags = record.tags?.length ? record.tags : (meta?.tags ?? []);
  return tags.filter(Boolean);
}

/** Ob die Spalte in der Tabelle als belegt gilt (nicht „—“ / leer). */
export function columnCellHasValue(
  col: TableColumnDef,
  record: IndexRecord,
  meta?: DatasetMeta,
): boolean {
  if (col.fieldKey === "tags") return tableTagsForRow(col, record, meta).length > 0;
  const text = formatTableCell(col, record, meta);
  return text !== "—" && text.trim().length > 0;
}

function sortableRawValue(
  sort: TableSortState,
  record: IndexRecord,
  meta: DatasetMeta | undefined,
): string | number {
  if (sort.source === "index") {
    switch (sort.fieldKey) {
      case "fileCount":
        return record.fileCount;
      case "syncStatus":
        return record.syncStatus;
      case "lastModified":
        return record.lastModified || "";
      default:
        return "";
    }
  }
  switch (sort.fieldKey) {
    case "locId":
      return record.locId;
    case "bezeichnung":
      return record.bezeichnung || "";
    case "kategorie":
      return record.kategorie || "";
    case "tags":
      return (record.tags?.length ? record.tags : meta?.tags ?? []).join(", ").toLowerCase();
    default:
      break;
  }
  if (!meta) return "";
  const v = getMetaFieldValue(meta, sort.fieldKey);
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(String).join(", ").toLowerCase();
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return String(v).toLowerCase();
}

function compareSortValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "de", { numeric: true, sensitivity: "base" });
}

export function sortIndexRecords(
  rows: IndexRecord[],
  sort: TableSortState | null,
  metaById: Map<string, DatasetMeta>,
): IndexRecord[] {
  if (!sort) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((ra, rb) => {
    const va = sortableRawValue(sort, ra, metaById.get(ra.locId));
    const vb = sortableRawValue(sort, rb, metaById.get(rb.locId));
    const emptyA = va === "";
    const emptyB = vb === "";
    if (emptyA && !emptyB) return 1;
    if (!emptyA && emptyB) return -1;
    return dir * compareSortValues(va, vb);
  });
}

export function nextTableSort(
  current: TableSortState | null,
  col: TableColumnDef,
): TableSortState | null {
  const matches =
    current?.fieldKey === col.fieldKey && current?.source === col.source;
  if (!matches) return { fieldKey: col.fieldKey, source: col.source, dir: "asc" };
  if (current.dir === "asc") return { ...current, dir: "desc" };
  return null;
}