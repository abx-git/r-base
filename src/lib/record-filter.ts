import type { IndexRecord } from "./db-index";
import type { DatasetScan } from "./fs-local";
import { matchesTagRules, type TagFilterRule } from "./dataset-tags";
import { metaByLocId } from "./dataset-search";
import { resolveSchemaForDataset } from "./dataset-schema-store";
import { matchesRecordSearchQuery } from "./record-search";
import {
  hasActiveColumnFilters,
  matchesTableColumnFilters,
  type TableColumnFiltersState,
} from "./table-column-filter";

export type RecordFilterState = {
  query: string;
  tagRules: TagFilterRule[];
  columnFilters: TableColumnFiltersState;
  /** Nur Datensätze dieses Schemas (Kopfzeilen-Auswahl). */
  listSchemaId?: string;
};

export function buildRecordFilter(parts: {
  query: string;
  tagRules: TagFilterRule[];
  columnFilters?: TableColumnFiltersState;
  listSchemaId?: string;
}): RecordFilterState {
  return {
    query: parts.query,
    tagRules: parts.tagRules,
    columnFilters: parts.columnFilters ?? {},
    listSchemaId: parts.listSchemaId,
  };
}

export function filterRecordsAdvanced(
  records: IndexRecord[],
  filter: RecordFilterState,
  scans?: DatasetScan[],
): IndexRecord[] {
  const q = filter.query.trim();
  const metaMap = scans?.length ? metaByLocId(scans) : null;

  return records.filter((r) => {
    if (!matchesTagRules(r.tags, filter.tagRules)) return false;

    const meta = metaMap?.get(r.locId);
    if (filter.listSchemaId) {
      if (!meta) return false;
      if (resolveSchemaForDataset(meta).id !== filter.listSchemaId) return false;
    }
    const schema = meta ? resolveSchemaForDataset(meta) : undefined;

    if (!matchesTableColumnFilters(r, meta, filter.columnFilters)) return false;

    if (!q) return true;
    return matchesRecordSearchQuery(q, r, meta, schema);
  });
}

export function hasActiveRecordFilter(filter: RecordFilterState): boolean {
  return Boolean(filter.query.trim() || filter.tagRules.length || hasActiveColumnFilters(filter.columnFilters));
}

/** Scans, deren Index-Zeile den aktuellen Listenfilter erfüllt. */
export function filterScansByRecordFilter(
  scans: DatasetScan[],
  records: IndexRecord[],
  filter: RecordFilterState,
): DatasetScan[] {
  const visible = new Set(filterRecordsAdvanced(records, filter, scans).map((r) => r.locId));
  return scans.filter((s) => visible.has(s.meta.locId));
}