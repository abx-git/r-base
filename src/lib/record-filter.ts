import type { IndexRecord } from "./db-index";
import { matchesTagFilter, parseFilterTags, type TagFilterMode } from "./dataset-tags";

export type RecordFilterState = {
  query: string;
  kategorie: string;
  tagQuery: string;
  tagMode: TagFilterMode;
};

export function filterRecordsAdvanced(records: IndexRecord[], filter: RecordFilterState): IndexRecord[] {
  const q = filter.query.trim().toLowerCase();
  const k = filter.kategorie.trim().toLowerCase();
  const tagList = parseFilterTags(filter.tagQuery);
  return records.filter((r) => {
    if (k && r.kategorie.toLowerCase() !== k) return false;
    if (!matchesTagFilter(r.tags, filter.tagMode, tagList)) return false;
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
  return Boolean(
    filter.query.trim() ||
      filter.kategorie.trim() ||
      (filter.tagMode !== "off" && filter.tagQuery.trim()),
  );
}