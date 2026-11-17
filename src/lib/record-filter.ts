import type { IndexRecord } from "./db-index";
import type { DatasetScan } from "./fs-local";
import { matchesTagRules, type TagFilterRule } from "./dataset-tags";
import { metaByLocId } from "./dataset-search";
import { resolveSchemaForDataset } from "./dataset-schema-store";
import { matchesRecordSearchQuery } from "./record-search";

export type RecordFilterState = {
  query: string;
  tagRules: TagFilterRule[];
};

export function filterRecordsAdvanced(
  records: IndexRecord[],
  filter: RecordFilterState,
  scans?: DatasetScan[],
): IndexRecord[] {
  const q = filter.query.trim();
  const metaMap = scans?.length ? metaByLocId(scans) : null;

  return records.filter((r) => {
    if (!matchesTagRules(r.tags, filter.tagRules)) return false;
    if (!q) return true;

    const meta = metaMap?.get(r.locId);
    const schema = meta ? resolveSchemaForDataset(meta) : undefined;
    return matchesRecordSearchQuery(q, r, meta, schema);
  });
}

export function hasActiveRecordFilter(filter: RecordFilterState): boolean {
  return Boolean(filter.query.trim() || filter.tagRules.length);
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