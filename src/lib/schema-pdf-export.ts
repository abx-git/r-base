import type { DatasetScan } from "./fs-local";
import type { DatasetSchemaDefinition, SchemaFieldDef } from "./dataset-schema-types";
import { resolveSchemaForDataset } from "./dataset-schema-store";
import { getDetailFieldOrder } from "./field-placement-editor";
import { fieldDefByKey, formatFieldForInput, getMetaFieldValue } from "./meta-field-access";
import { displayLocId } from "./meta-schema";
import { resolveDetailHiddenKeys } from "./meta-hidden-fields";
import { formatObsoleteValue, listObsoleteFields } from "./meta-obsolete-fields";

export type SchemaPdfExportOptions = {
  /** Leere optionale Felder weglassen (Standard: an). */
  omitEmptyOptional?: boolean;
  /** Deckblatt mit Schema-Übersicht (Standard: an). */
  includeCover?: boolean;
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 17;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 11;
const BODY_BOTTOM = FOOTER_Y - 6;

type PdfTheme = {
  ink: [number, number, number];
  muted: [number, number, number];
  line: [number, number, number];
  accent: [number, number, number];
};

const THEME: PdfTheme = {
  ink: [24, 24, 27],
  muted: [113, 113, 122],
  line: [228, 228, 231],
  accent: [39, 39, 42],
};

function scansForSchema(scans: DatasetScan[], schema: DatasetSchemaDefinition): DatasetScan[] {
  return scans
    .filter((s) => resolveSchemaForDataset(s.meta).id === schema.id)
    .sort((a, b) => a.meta.locId.localeCompare(b.meta.locId, "de", { numeric: true }));
}

function formatFieldValue(def: SchemaFieldDef | undefined, meta: DatasetScan["meta"], key: string): string {
  if (!def) {
    const raw = getMetaFieldValue(meta, key);
    return raw === null || raw === undefined || raw === "" ? "—" : String(raw);
  }
  const v = getMetaFieldValue(meta, def.key);
  if (def.key === "locId") return displayLocId(String(v ?? meta.locId));
  if (v === null || v === undefined || v === "") return "—";
  if (def.dataType === "boolean") return v ? "Ja" : "Nein";
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (def.dataType === "date" && typeof v === "string") {
    const d = v.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      try {
        return new Date(`${d}T12:00:00`).toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      } catch {
        return d;
      }
    }
  }
  return formatFieldForInput(def.dataType, v) || "—";
}

function isEmptyValue(text: string): boolean {
  const t = text.trim();
  return !t || t === "—";
}

function fieldKeysForExport(
  schema: DatasetSchemaDefinition,
  meta: DatasetScan["meta"],
  omitEmptyOptional: boolean,
): string[] {
  const hidden = resolveDetailHiddenKeys(meta, schema);
  const order = getDetailFieldOrder(schema);
  const keys = order.filter((k) => !hidden.has(k));
  if (!omitEmptyOptional) return keys;
  return keys.filter((key) => {
    const def = fieldDefByKey(schema.fields, key);
    const text = formatFieldValue(def, meta, key);
    if (!def) return !isEmptyValue(text);
    if (def.constraints?.required || def.key === "locId" || def.key === "bezeichnung") return true;
    return !isEmptyValue(text);
  });
}

export async function buildSchemaPdf(
  schema: DatasetSchemaDefinition,
  scans: DatasetScan[],
  options: SchemaPdfExportOptions = {},
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const omitEmpty = options.omitEmptyOptional !== false;
  const includeCover = options.includeCover !== false;
  const datasets = scansForSchema(scans, schema);
  const exportStamp = new Date().toLocaleString("de-DE");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  let pageNum = 0;

  const setInk = () => doc.setTextColor(...THEME.ink);
  const setMuted = () => doc.setTextColor(...THEME.muted);
  const setAccent = () => doc.setTextColor(...THEME.accent);

  const drawFooter = (context: string) => {
    doc.setDrawColor(...THEME.line);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, FOOTER_Y - 3, PAGE_W - MARGIN, FOOTER_Y - 3);
    setMuted();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(context, MARGIN, FOOTER_Y);
    doc.text(String(pageNum), PAGE_W / 2, FOOTER_Y, { align: "center" });
    doc.text(exportStamp.slice(0, 10), PAGE_W - MARGIN, FOOTER_Y, { align: "right" });
    setInk();
  };

  const newPage = (footerContext: string) => {
    if (pageNum > 0) doc.addPage();
    pageNum += 1;
    drawFooter(footerContext);
    return MARGIN;
  };

  let y = MARGIN;
  let sheetFooter = schema.name;

  if (includeCover) {
    y = newPage(schema.name);
    doc.setDrawColor(...THEME.accent);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, MARGIN + 4, MARGIN + 28, MARGIN + 4);

    setMuted();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("R-Base · Datenblätter", MARGIN, MARGIN + 11);

    setInk();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.text(schema.name, MARGIN, MARGIN + 28);

    setAccent();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Schema ${schema.id} · Prefix ${schema.loxPrefix}`, MARGIN, MARGIN + 38);

    setMuted();
    doc.setFontSize(10);
    doc.text(`${datasets.length} Datensätze`, MARGIN, MARGIN + 48);
    doc.text(`Export: ${exportStamp}`, MARGIN, MARGIN + 56);

    if (datasets.length) {
      y = MARGIN + 72;
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      setAccent();
      doc.text("Inhalt", MARGIN, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      setMuted();
      const preview = datasets.slice(0, 12);
      for (const s of preview) {
        const line = `${displayLocId(s.meta.locId)}  ·  ${s.meta.bezeichnung.trim() || "—"}`;
        const parts = doc.splitTextToSize(line, CONTENT_W);
        doc.text(parts, MARGIN, y);
        y += parts.length * 3.6 + 1.5;
        if (y > BODY_BOTTOM - 20) break;
      }
      if (datasets.length > preview.length) {
        doc.text(`… und ${datasets.length - preview.length} weitere`, MARGIN, y + 2);
      }
    }

  }

  const ensureSpace = (need: number): void => {
    if (y + need <= BODY_BOTTOM) return;
    y = newPage(sheetFooter);
  };

  const drawFieldRow = (label: string, value: string, mono = false) => {
    const valueLines = doc.splitTextToSize(value, CONTENT_W - 48);
    const rowH = Math.max(7, valueLines.length * 4.2 + 3);
    ensureSpace(rowH + 2);

    setMuted();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), MARGIN, y + 3);

    setInk();
    doc.setFont(mono ? "courier" : "helvetica", "normal");
    doc.setFontSize(10);
    doc.text(valueLines, MARGIN + 48, y + 3.5);

    doc.setDrawColor(...THEME.line);
    doc.setLineWidth(0.12);
    doc.line(MARGIN, y + rowH, PAGE_W - MARGIN, y + rowH);
    y += rowH + 1.5;
  };

  if (!datasets.length) {
    if (!includeCover) y = newPage(schema.name);
    setMuted();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Keine Datensätze für dieses Schema im Stammordner.", MARGIN, MARGIN + 12);
    return doc.output("blob");
  }

  for (const scan of datasets) {
    const meta = scan.meta;
    const title = meta.bezeichnung.trim() || "Ohne Bezeichnung";
    const locLabel = displayLocId(meta.locId);
    sheetFooter = locLabel;
    y = newPage(locLabel);

    const subtitleParts = [
      meta.kategorie.trim() || null,
      meta.files.length ? `${meta.files.length} Datei${meta.files.length === 1 ? "" : "en"}` : null,
      meta.lastModified
        ? `Stand ${new Date(meta.lastModified).toLocaleDateString("de-DE")}`
        : null,
    ].filter(Boolean) as string[];

    setMuted();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(schema.name, MARGIN, y);
    doc.text(locLabel, PAGE_W - MARGIN, y, { align: "right" });
    y += 4;

    doc.setDrawColor(...THEME.accent);
    doc.setLineWidth(0.35);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 8;

    setInk();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    const titleLines = doc.splitTextToSize(title, CONTENT_W);
    doc.text(titleLines, MARGIN, y);
    y += titleLines.length * 7.2 + 2;

    if (subtitleParts.length) {
      setMuted();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(subtitleParts.join("  ·  "), MARGIN, y);
      y += 8;
    }

    y += 2;

    for (const key of fieldKeysForExport(schema, meta, omitEmpty)) {
      const def = fieldDefByKey(schema.fields, key);
      const label = def?.label ?? key;
      const value = formatFieldValue(def, meta, key);
      drawFieldRow(label, value, key === "locId");
    }

    const obsolete = listObsoleteFields(meta, schema).filter((e) => !isEmptyValue(formatObsoleteValue(e.value)));
    if (obsolete.length) {
      ensureSpace(14);
      y += 4;
      setAccent();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("Außerhalb des Schemas", MARGIN, y);
      y += 6;
      for (const entry of obsolete) {
        drawFieldRow(entry.key, formatObsoleteValue(entry.value));
      }
    }

    y += 6;
  }

  return doc.output("blob");
}

export function schemaPdfFilename(schema: DatasetSchemaDefinition): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = schema.id.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32);
  return `r-base-${slug}-datenblaetter-${date}.pdf`;
}