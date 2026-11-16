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

export type TagFilterRule = {
  tag: string;
  mode: "include" | "exclude";
};

export function matchesTagRules(tags: string[] | undefined, rules: TagFilterRule[]): boolean {
  if (!rules.length) return true;
  const set = new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean));
  for (const rule of rules) {
    const key = rule.tag.trim().toLowerCase();
    if (!key) continue;
    const has = set.has(key);
    if (rule.mode === "include" && !has) return false;
    if (rule.mode === "exclude" && has) return false;
  }
  return true;
}

export function metaTagsText(meta: DatasetMeta): string {
  return (meta.tags ?? []).join(" ");
}