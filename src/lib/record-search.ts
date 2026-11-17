import type { IndexRecord } from "./db-index";
import type { DatasetScan } from "./fs-local";
import type { DatasetMeta } from "./meta-schema";
import type { DatasetSchemaDefinition } from "./dataset-schema-types";
import { formatTableCell } from "./table-schema";
import { datasetSearchHaystack } from "./dataset-search";
import { INDEX_TABLE_FIELDS } from "./table-layout";

export type ColumnSearchClause = {
  fieldKey: string;
  source: "meta" | "index";
  pattern: string;
};

export type ParsedRecordSearchQuery =
  | { kind: "empty" }
  | { kind: "global"; pattern: string }
  | { kind: "columns"; clauses: ColumnSearchClause[] }
  | { kind: "mixed"; globalPattern: string; clauses: ColumnSearchClause[] };

const INDEX_FIELD_KEYS = new Set(INDEX_TABLE_FIELDS.map((f) => f.fieldKey));

const FIELD_ALIASES: Record<string, string> = {
  id: "locId",
  loxid: "locId",
  uuid: "locId",
  titel: "bezeichnung",
  name: "bezeichnung",
  kat: "kategorie",
  dateien: "fileCount",
  sync: "syncStatus",
  geaendert: "lastModified",
  geändert: "lastModified",
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Teilstring oder Wildcard (* = beliebige Zeichen), case-insensitive. */
export function wildcardMatch(pattern: string, text: string): boolean {
  const p = pattern.trim();
  if (!p) return true;
  if (!p.includes("*")) return text.toLowerCase().includes(p.toLowerCase());
  const reSrc = `^${p.split("*").map(escapeRegExp).join(".*")}$`;
  try {
    return new RegExp(reSrc, "i").test(text);
  } catch {
    return text.toLowerCase().includes(p.replace(/\*/g, "").toLowerCase());
  }
}

function resolveFieldKey(token: string, schema?: DatasetSchemaDefinition): string {
  const lower = token.trim().toLowerCase();
  if (FIELD_ALIASES[lower]) return FIELD_ALIASES[lower]!;
  if (schema) {
    const exact = schema.fields.find((f) => f.key.toLowerCase() === lower);
    if (exact) return exact.key;
    const byLabel = schema.fields.find((f) => f.label.trim().toLowerCase() === lower);
    if (byLabel) return byLabel.key;
  }
  const known = [
    "locId",
    "bezeichnung",
    "kategorie",
    "notes",
    "tags",
    ...INDEX_FIELD_KEYS,
  ];
  const hit = known.find((k) => k.toLowerCase() === lower);
  return hit ?? token.trim();
}

function columnRef(token: string, schema?: DatasetSchemaDefinition): {
  fieldKey: string;
  source: "meta" | "index";
} {
  const fieldKey = resolveFieldKey(token, schema);
  return {
    fieldKey,
    source: INDEX_FIELD_KEYS.has(fieldKey) ? "index" : "meta",
  };
}

const COLUMN_TOKEN = /^([^:\s]+):(.+)$/;

/**
 * `bezeichnung:*Jura*`, mehrere Spalten mit Leerzeichen (UND),
 * ohne Präfix: Volltext in allen Feldern (ohne Tags) mit Wildcard *.
 */
export function parseRecordSearchQuery(raw: string, schema?: DatasetSchemaDefinition): ParsedRecordSearchQuery {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const clauses: ColumnSearchClause[] = [];
  const globalParts: string[] = [];

  for (const token of tokens) {
    const m = token.match(COLUMN_TOKEN);
    if (m) {
      const ref = columnRef(m[1]!, schema);
      clauses.push({ ...ref, pattern: m[2]!.trim() });
    } else {
      globalParts.push(token);
    }
  }

  if (clauses.length && !globalParts.length) return { kind: "columns", clauses };
  if (!clauses.length) return { kind: "global", pattern: trimmed };
  return { kind: "mixed", globalPattern: globalParts.join(" "), clauses };
}

function columnSearchText(
  clause: ColumnSearchClause,
  record: IndexRecord,
  meta: DatasetMeta | undefined,
): string {
  const col = {
    fieldKey: clause.fieldKey,
    label: clause.fieldKey,
    source: clause.source,
  };
  return formatTableCell(col, record, meta);
}

function matchesGlobalPattern(
  pattern: string,
  record: IndexRecord,
  meta: DatasetMeta | undefined,
  schema: DatasetSchemaDefinition | undefined,
): boolean {
  if (meta && schema) {
    if (wildcardMatch(pattern, datasetSearchHaystack(meta, schema))) return true;
  }
  const fallback = [record.locId, record.bezeichnung, record.kategorie].join("\n");
  return wildcardMatch(pattern, fallback);
}

export function matchesRecordSearchQuery(
  rawQuery: string,
  record: IndexRecord,
  meta: DatasetMeta | undefined,
  schema: DatasetSchemaDefinition | undefined,
): boolean {
  const parsed = parseRecordSearchQuery(rawQuery, schema);
  if (parsed.kind === "empty") return true;

  if (parsed.kind === "global") {
    return matchesGlobalPattern(parsed.pattern, record, meta, schema);
  }

  for (const clause of parsed.clauses) {
    const text = columnSearchText(clause, record, meta);
    if (!wildcardMatch(clause.pattern, text)) return false;
  }

  if (parsed.kind === "mixed") {
    if (!matchesGlobalPattern(parsed.globalPattern, record, meta, schema)) return false;
  }

  return true;
}

export function metaForRecord(scans: DatasetScan[] | undefined, locId: string): DatasetMeta | undefined {
  if (!scans?.length) return undefined;
  return scans.find((s) => s.meta.locId === locId)?.meta;
}