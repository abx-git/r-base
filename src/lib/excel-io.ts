import * as XLSX from "xlsx";
import type { IndexRecord } from "./db-index";
import type { DatasetSchemaDefinition } from "./dataset-schema-types";
import type { DatasetMeta } from "./meta-schema";
import type { DatasetScan } from "./fs-local";
import { writeMetaToFolder } from "./fs-local";
import { visibleExcelColumns } from "./excel-layout";
import { displayLocId } from "./meta-schema";
import { parseLocIdToken } from "./loc-id";
import { formatTableCell } from "./table-schema";

export type ExcelRow = {
  locId: string;
  bezeichnung: string;
  kategorie: string;
  tags: string;
  dateianzahl: number;
  lastModified: string;
};

export function excelExportFilename(schema: DatasetSchemaDefinition): string {
  const slug = (schema.id || "schema").replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "");
  return `r-base-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function exportSchemaMetadataXlsx(
  scans: DatasetScan[],
  schema: DatasetSchemaDefinition,
  records: IndexRecord[],
): Blob {
  const cols = visibleExcelColumns(schema);
  const byLoc = new Map(records.map((r) => [r.locId, r]));
  const headers = cols.map((c) => c.label || c.fieldKey);
  const sheetRows: Record<string, string>[] = [];
  for (const scan of scans) {
    const record = byLoc.get(scan.meta.locId);
    if (!record) continue;
    const row: Record<string, string> = {};
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]!;
      const header = headers[i]!;
      row[header] = formatTableCell(col, record, scan.meta);
    }
    sheetRows.push(row);
  }
  const sheet = XLSX.utils.json_to_sheet(sheetRows, { header: headers });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Metadaten");
  const buf = XLSX.write(book, { type: "array", bookType: "xlsx" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Legacy-Export ohne Schema-Konfiguration (festes Spaltenset). */
export function exportMetadataXlsx(scans: DatasetScan[]): Blob {
  const rows: ExcelRow[] = scans.map((s) => ({
    locId: displayLocId(s.meta.locId),
    bezeichnung: s.meta.bezeichnung,
    kategorie: s.meta.kategorie,
    tags: (s.meta.tags ?? []).join(", "),
    dateianzahl: s.meta.files.length,
    lastModified: s.meta.lastModified,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Metadaten");
  const buf = XLSX.write(book, { type: "array", bookType: "xlsx" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export type ExcelImportResult = {
  updated: number;
  skipped: number;
  errors: string[];
};

export async function importMetadataXlsx(
  file: File,
  scans: DatasetScan[],
): Promise<ExcelImportResult> {
  const data = await file.arrayBuffer();
  const book = XLSX.read(data, { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0] ?? ""];
  if (!sheet) return { updated: 0, skipped: 0, errors: ["Keine Tabelle gefunden."] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const byLoc = new Map(scans.map((s) => [s.meta.locId, s]));
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const locId = parseLocIdToken(String(row.locId ?? ""));
    if (!locId) {
      skipped += 1;
      continue;
    }
    const scan = byLoc.get(locId);
    if (!scan) {
      errors.push(`Unbekannte ID: ${locId}`);
      skipped += 1;
      continue;
    }
    const meta: DatasetMeta = { ...scan.meta };
    if (typeof row.bezeichnung === "string") meta.bezeichnung = row.bezeichnung.trim() || meta.bezeichnung;
    if (typeof row.kategorie === "string") meta.kategorie = row.kategorie.trim();
    await writeMetaToFolder(scan.handle, meta);
    scan.meta = meta;
    updated += 1;
  }

  return { updated, skipped, errors };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}