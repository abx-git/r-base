import type { DatasetScan } from "./fs-local";
import { isImagePath, readFileAtPath } from "./fs-local";
import type { DatasetSchemaDefinition, SchemaFieldDef } from "./dataset-schema-types";
import { resolveSchemaForDataset } from "./dataset-schema-store";
import { exportBlocksForSchema } from "./export-placement-editor";
import { isExportFieldVisibleInSchema } from "./export-field-visibility";
import { fieldDefByKey, formatFieldForInput, getMetaFieldValue } from "./meta-field-access";
import { displayLocId } from "./meta-schema";
import { formatObsoleteValue, listObsoleteFields } from "./meta-obsolete-fields";

export type SchemaPdfExportOptions = {
  omitEmptyOptional?: boolean;
  includeCover?: boolean;
  /** Felder außerhalb des Schemas ans Ende (Standard: an). */
  includeObsolete?: boolean;
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

function filterExportKeys(
  schema: DatasetSchemaDefinition,
  meta: DatasetScan["meta"],
  keys: string[],
  omitEmpty: boolean,
): string[] {
  return keys.filter((key) => {
    if (!isExportFieldVisibleInSchema(schema, key)) return false;
    if (!omitEmpty) return true;
    const def = fieldDefByKey(schema.fields, key);
    const text = formatFieldValue(def, meta, key);
    if (!def) return !isEmptyValue(text);
    if (def.constraints?.required || def.key === "locId" || def.key === "bezeichnung") return true;
    return !isEmptyValue(text);
  });
}

type ImagePayload = { dataUrl: string; format: "JPEG" | "PNG"; w: number; h: number };

async function loadImagePayload(scan: DatasetScan, path: string): Promise<ImagePayload | null> {
  const file = await readFileAtPath(scan.handle, path);
  if (!file) return null;
  const mime = (file.type || "").toLowerCase();
  if (!mime.startsWith("image/") && !isImagePath(path)) return null;
  const format: "JPEG" | "PNG" = mime.includes("png") || path.toLowerCase().endsWith(".png") ? "PNG" : "JPEG";
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  let bin = "";
  for (const b of u8) bin += String.fromCharCode(b);
  const dataUrl = `data:${mime || "image/jpeg"};base64,${btoa(bin)}`;
  const dims = await measureImage(dataUrl);
  return { dataUrl, format, w: dims.w, h: dims.h };
}

function measureImage(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Bild konnte nicht gelesen werden"));
    img.src = dataUrl;
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
  const includeObsolete = options.includeObsolete !== false;
  const datasets = scansForSchema(scans, schema);
  const exportStamp = new Date().toLocaleString("de-DE");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  let pageNum = 0;
  let y = MARGIN;
  let sheetFooter = schema.name;

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
    sheetFooter = footerContext;
    drawFooter(footerContext);
    return MARGIN;
  };

  const ensureSpace = (need: number) => {
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

  const drawSectionTitle = (title: string) => {
    ensureSpace(10);
    setAccent();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(title, MARGIN, y);
    y += 6;
    setInk();
  };

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
    doc.text("Layout: Exportformular", MARGIN, MARGIN + 64);

    if (datasets.length) {
      y = MARGIN + 76;
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      setAccent();
      doc.text("Inhalt", MARGIN, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      setMuted();
      for (const s of datasets.slice(0, 12)) {
        const line = `${displayLocId(s.meta.locId)}  ·  ${s.meta.bezeichnung.trim() || "—"}`;
        const parts = doc.splitTextToSize(line, CONTENT_W);
        doc.text(parts, MARGIN, y);
        y += parts.length * 3.6 + 1.5;
        if (y > BODY_BOTTOM - 20) break;
      }
    }
  }

  if (!datasets.length) {
    if (!includeCover) y = newPage(schema.name);
    setMuted();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Keine Datensätze für dieses Schema im Stammordner.", MARGIN, MARGIN + 12);
    return doc.output("blob");
  }

  const blocks = exportBlocksForSchema(schema);

  for (const scan of datasets) {
    const meta = scan.meta;
    const title = meta.bezeichnung.trim() || "Ohne Bezeichnung";
    const locLabel = displayLocId(meta.locId);
    sheetFooter = locLabel;
    y = newPage(locLabel);

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
    y += titleLines.length * 7.2 + 4;

    for (const block of blocks) {
      if (block.kind === "fields") {
        const keys = filterExportKeys(schema, meta, block.fieldKeys, omitEmpty);
        if (!keys.length) continue;
        if (block.title?.trim()) drawSectionTitle(block.title.trim());
        for (const key of keys) {
          if (key === "bezeichnung") continue;
          const def = fieldDefByKey(schema.fields, key);
          drawFieldRow(def?.label ?? key, formatFieldValue(def, meta, key), key === "locId");
        }
      } else if (block.kind === "unplaced") {
        const keys = filterExportKeys(schema, meta, block.fieldKeys, omitEmpty);
        if (!keys.length) continue;
        drawSectionTitle("Nicht platziert");
        for (const key of keys) {
          const def = fieldDefByKey(schema.fields, key);
          drawFieldRow(def?.label ?? key, formatFieldValue(def, meta, key), key === "locId");
        }
      } else if (block.kind === "files") {
        const images = meta.files.filter((f) => isImagePath(f.path));
        if (!images.length) continue;
        if (block.title?.trim()) drawSectionTitle(block.title.trim());
        else drawSectionTitle("Bilder");

        const cols = (block.colSpan ?? 12) >= 8 ? 3 : 2;
        const gap = 3;
        const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
        const maxCellH = 52;
        let col = 0;
        let rowY = y;
        let rowMaxH = 0;

        for (const ref of images) {
          let payload: ImagePayload | null = null;
          try {
            payload = await loadImagePayload(scan, ref.path);
          } catch {
            payload = null;
          }
          if (!payload) continue;

          const scale = Math.min(cellW / payload.w, maxCellH / payload.h, 1);
          const drawW = payload.w * scale;
          const drawH = payload.h * scale;
          if (col === 0) {
            ensureSpace(maxCellH + 14);
            rowY = y;
            rowMaxH = 0;
          }

          const x = MARGIN + col * (cellW + gap) + (cellW - drawW) / 2;
          const imgY = rowY + 2;
          doc.addImage(payload.dataUrl, payload.format, x, imgY, drawW, drawH);

          setMuted();
          doc.setFontSize(6.5);
          const caption = ref.path.split("/").pop() ?? ref.path;
          doc.text(caption.slice(0, 28), MARGIN + col * (cellW + gap), rowY + drawH + 6, {
            maxWidth: cellW,
          });
          setInk();

          rowMaxH = Math.max(rowMaxH, drawH + 8);
          col += 1;
          if (col >= cols) {
            y = rowY + rowMaxH + 4;
            col = 0;
            rowMaxH = 0;
          }
        }
        if (col > 0) y = rowY + rowMaxH + 4;
        y += 2;
      }
    }

    if (includeObsolete) {
      const obsolete = listObsoleteFields(meta, schema).filter((e) => !isEmptyValue(formatObsoleteValue(e.value)));
      if (obsolete.length) {
        ensureSpace(14);
        drawSectionTitle("Außerhalb des Schemas");
        for (const entry of obsolete) {
          drawFieldRow(entry.key, formatObsoleteValue(entry.value));
        }
      }
    }

    y += 4;
  }

  return doc.output("blob");
}

export function schemaPdfFilename(schema: DatasetSchemaDefinition): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = schema.id.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32);
  return `r-base-${slug}-datenblaetter-${date}.pdf`;
}