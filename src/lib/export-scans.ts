import type { IndexRecord } from "./db-index";
import type { DatasetScan } from "./fs-local";
import { buildMetaByLocId, locIdsReferToSameRecord } from "./dataset-scan-match";
import { activeListSchemaId } from "./dataset-schema-store";
import {
  buildRecordFilter,
  filterRecordsAdvanced,
  hasActiveRecordFilter,
  type RecordFilterState,
} from "./record-filter";
import { sortIndexRecords } from "./table-schema";
import type { TableSortState } from "../state";
import type { TagFilterRule } from "./dataset-tags";
import type { TableColumnFiltersState } from "./table-column-filter";
import { hasActiveColumnFilters } from "./table-column-filter";

export type ExportScanContext = {
  scans: DatasetScan[];
  records: IndexRecord[];
  filterQuery: string;
  filterTagRules: TagFilterRule[];
  tableColumnFilters: TableColumnFiltersState;
  listViewSchemaId: string | null;
  tableSort: TableSortState | null;
  tableSelection: string[];
};

export type PreparedExport = {
  scans: DatasetScan[];
  filter: RecordFilterState;
  selectionOnly: boolean;
  sort: TableSortState | null;
};

export function prepareExportScans(ctx: ExportScanContext): PreparedExport {
  const filter = buildRecordFilter({
    query: ctx.filterQuery,
    tagRules: ctx.filterTagRules,
    columnFilters: ctx.tableColumnFilters,
    listSchemaId: activeListSchemaId(ctx.listViewSchemaId),
  });

  let records = filterRecordsAdvanced(ctx.records, filter, ctx.scans);

  const selectionOnly = ctx.tableSelection.length > 0;
  if (selectionOnly) {
    records = records.filter((r) =>
      ctx.tableSelection.some((id) => locIdsReferToSameRecord(id, r.locId)),
    );
  }

  const metaById = buildMetaByLocId(ctx.scans);
  records = sortIndexRecords(records, ctx.tableSort, metaById);

  const scanByLoc = new Map(ctx.scans.map((s) => [s.meta.locId, s]));
  const scans = records
    .map((r) => scanByLoc.get(r.locId))
    .filter((s): s is DatasetScan => Boolean(s));

  return { scans, filter, selectionOnly, sort: ctx.tableSort };
}

export function describeExportScope(
  filter: RecordFilterState,
  count: number,
  sort: TableSortState | null,
  selectionOnly: boolean,
): string {
  const parts: string[] = [];
  if (selectionOnly) parts.push("nur markierte Zeilen");
  else if (hasActiveRecordFilter(filter)) parts.push("gefilterte Liste");
  else parts.push("sichtbare Liste");
  if (hasActiveColumnFilters(filter.columnFilters)) parts.push("Spaltenfilter");
  if (filter.query.trim()) parts.push(`Suche „${filter.query.trim()}"`);
  if (filter.tagRules.length) parts.push(`${filter.tagRules.length} Tag-Regel(n)`);
  if (sort) {
    parts.push(
      `Sortierung ${sort.fieldKey} (${sort.dir === "asc" ? "aufsteigend" : "absteigend"})`,
    );
  }
  return `${parts.join(" · ")} — ${count} Datensätze`;
}