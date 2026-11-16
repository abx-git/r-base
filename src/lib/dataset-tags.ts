import type { DatasetMeta } from "./meta-schema";
import type { DatasetScan } from "./fs-local";

export function normalizeDatasetTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function collectKnownDatasetTags(scans: DatasetScan[]): string[] {
  const seen = new Map<string, string>();
  for (const scan of scans) {
    for (const t of scan.meta.tags ?? []) {
      const key = t.toLowerCase();
      if (!seen.has(key)) seen.set(key, t);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "de"));
}

export function parseFilterTags(raw: string): string[] {
  return normalizeDatasetTags(raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean));
}

export type TagFilterMode = "off" | "include" | "exclude";

export function matchesTagFilter(tags: string[] | undefined, mode: TagFilterMode, filterTags: string[]): boolean {
  if (mode === "off" || !filterTags.length) return true;
  const norm = (s: string) => s.trim().toLowerCase();
  const set = new Set((tags ?? []).map(norm).filter(Boolean));
  const wanted = filterTags.map(norm).filter(Boolean);
  if (!wanted.length) return true;
  if (mode === "include") {
    return wanted.some((t) => set.has(t));
  }
  return wanted.every((t) => !set.has(t));
}

export function metaTagsText(meta: DatasetMeta): string {
  return (meta.tags ?? []).join(" ");
}