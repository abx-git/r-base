import type { IndexRecord } from "./db-index";
import type { DatasetScan } from "./fs-local";
import { matchesTagRules, type TagFilterRule } from "./dataset-tags";
import { datasetSearchHaystack, metaByLocId } from "./dataset-search";
import { resolveSchemaForDataset } from "./dataset-schema-store";

export type RecordFilterState = {
  query: string;
  kategorie: string;
  tagRules: TagFilterRule[];
};

export function filterRecordsAdvanced(
  records: IndexRecord[],
  filter: RecordFilterState,
  scans?: DatasetScan[],
): IndexRecord[] {
  const q = filter.query.trim().toLowerCase();
  const k = filter.kategorie.trim().toLowerCase();
  const metaMap = scans?.length ? metaByLocId(scans) : null;

  return records.filter((r) => {
    if (k && r.kategorie.toLowerCase() !== k) return false;
    if (!matchesTagRules(r.tags, filter.tagRules)) return false;
    if (!q) return true;

    if (metaMap) {
      const meta = metaMap.get(r.locId);
      if (meta) {
        const schema = resolveSchemaForDataset(meta);
        if (datasetSearchHaystack(meta, schema).includes(q)) return true;
      }
    }

    return (
      r.locId.toLowerCase().includes(q) ||
      r.bezeichnung.toLowerCase().includes(q) ||
      r.kategorie.toLowerCase().includes(q)
    );
  });
}

export function hasActiveRecordFilter(filter: RecordFilterState): boolean {
  return Boolean(filter.query.trim() || filter.kategorie.trim() || filter.tagRules.length);
}