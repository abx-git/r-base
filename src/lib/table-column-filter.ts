import type { IndexRecord } from "./db-index";
import type { DatasetMeta } from "./meta-schema";
import type { TableColumnDef } from "./dataset-schema-types";
import { wildcardMatch } from "./record-search";
import { columnCellHasValue, formatTableCell, tableTagsForRow } from "./table-schema";

export type TableColumnFilterPresence = "any" | "filled" | "empty";

export type TableColumnFilter = {
  text: string;
  presence: TableColumnFilterPresence;
};

export type TableColumnFiltersState = Record<string, TableColumnFilter>;

export function columnFilterKey(col: Pick<TableColumnDef, "fieldKey" | "source">): string {
  return `${col.source ?? "meta"}:${col.fieldKey}`;
}

export function parseColumnFilterKey(key: string): { fieldKey: string; source: "meta" | "index" } {
  const idx = key.indexOf(":");
  if (idx <= 0) return { fieldKey: key, source: "meta" };
  const source = key.slice(0, idx);
  const fieldKey = key.slice(idx + 1);
  if (source === "index" || source === "meta") return { fieldKey, source };
  return { fieldKey: key, source: "meta" };
}

export function emptyColumnFilter(): TableColumnFilter {
  return { text: "", presence: "any" };
}

export function isColumnFilterActive(filter: TableColumnFilter | undefined): boolean {
  if (!filter) return false;
  if (filter.presence !== "any") return true;
  return Boolean(filter.text.trim());
}

export function hasActiveColumnFilters(filters: TableColumnFiltersState): boolean {
  return Object.values(filters).some((f) => isColumnFilterActive(f));
}

export function nextColumnFilterPresence(
  current: TableColumnFilterPresence,
): TableColumnFilterPresence {
  if (current === "any") return "filled";
  if (current === "filled") return "empty";
  return "any";
}

function columnDefFromKey(key: string): TableColumnDef {
  const { fieldKey, source } = parseColumnFilterKey(key);
  return { fieldKey, label: fieldKey, source };
}

export function matchesTableColumnFilters(
  record: IndexRecord,
  meta: DatasetMeta | undefined,
  filters: TableColumnFiltersState,
): boolean {
  for (const [key, filter] of Object.entries(filters)) {
    if (!isColumnFilterActive(filter)) continue;
    const col = columnDefFromKey(key);
    const hasValue = columnCellHasValue(col, record, meta);
    if (filter.presence === "filled" && !hasValue) return false;
    if (filter.presence === "empty" && hasValue) return false;
    const needle = filter.text.trim();
    if (filter.presence === "any" && needle) {
      if (col.fieldKey === "tags" && col.source !== "index") {
        const tags = tableTagsForRow(col, record, meta);
        const hay = tags.join(", ");
        if (!wildcardMatch(needle, hay)) return false;
      } else {
        const text = formatTableCell(col, record, meta);
        if (!wildcardMatch(needle, text)) return false;
      }
    }
  }
  return true;
}