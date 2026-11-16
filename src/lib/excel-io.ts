import * as XLSX from "xlsx";
import type { DatasetMeta } from "./meta-schema";
import type { DatasetScan } from "./fs-local";
import { writeMetaToFolder } from "./fs-local";
import { displayLocId } from "./meta-schema";
import { parseLocIdToken } from "./loc-id";

export type ExcelRow = {
  locId: string;
  bezeichnung: string;
  kategorie: string;
  tags: string;
  dateianzahl: number;
  lastModified: string;
};

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