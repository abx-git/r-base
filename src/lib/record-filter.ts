import type { IndexRecord } from "./db-index";
import { matchesTagRules, type TagFilterRule } from "./dataset-tags";

export type RecordFilterState = {
  query: string;
  kategorie: string;
  tagRules: TagFilterRule[];
};

export function filterRecordsAdvanced(records: IndexRecord[], filter: RecordFilterState): IndexRecord[] {
  const q = filter.query.trim().toLowerCase();
  const k = filter.kategorie.trim().toLowerCase();
  return records.filter((r) => {
    if (k && r.kategorie.toLowerCase() !== k) return false;
    if (!matchesTagRules(r.tags, filter.tagRules)) return false;
    if (!q) return true;
    const tagLine = (r.tags ?? []).join(" ").toLowerCase();
    return (
      r.locId.toLowerCase().includes(q) ||
      r.bezeichnung.toLowerCase().includes(q) ||
      r.kategorie.toLowerCase().includes(q) ||
      tagLine.includes(q)
    );
  });
}

export function hasActiveRecordFilter(filter: RecordFilterState): boolean {
  return Boolean(filter.query.trim() || filter.kategorie.trim() || filter.tagRules.length);
}