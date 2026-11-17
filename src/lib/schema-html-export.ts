import type { DatasetScan } from "./fs-local";
import { isImagePath, readFileAtPath } from "./fs-local";
import type { DatasetSchemaDefinition } from "./dataset-schema-types";
import { exportBlocksForSchema } from "./export-placement-editor";
import { fieldDefByKey } from "./meta-field-access";
import { displayLocId } from "./meta-schema";
import { formatObsoleteValue, listObsoleteFields } from "./meta-obsolete-fields";
import {
  escapeHtml,
  filterExportFieldKeys,
  formatExportFieldValue,
  isEmptyExportValue,
  scansForSchemaExport,
  slugForExportPath,
  type SchemaExportRenderOptions,
} from "./schema-export-shared";
import { getDirectoryAtPath, writeFileInFolder, writeTextInFolder } from "./workspace";

export type SchemaHtmlExportOptions = SchemaExportRenderOptions & {
  includeCover?: boolean;
};

const SITE_CSS = `/* R-Base static export */
:root {
  color-scheme: light dark;
  --bg: #f4f4f5;
  --surface: #ffffff;
  --ink: #18181b;
  --muted: #71717a;
  --line: #e4e4e7;
  --accent: #3f3f46;
  --link: #2563eb;
  --radius: 12px;
  --shadow: 0 1px 2px rgba(24, 24, 27, 0.06), 0 8px 24px rgba(24, 24, 27, 0.06);
  --font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #09090b;
    --surface: #18181b;
    --ink: #fafafa;
    --muted: #a1a1aa;
    --line: #27272a;
    --accent: #e4e4e7;
    --link: #60a5fa;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 12px 32px rgba(0, 0, 0, 0.35);
  }
}
* { box-sizing: border-box; }
html { font-size: 16px; scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--font);
  background: var(--bg);
  color: var(--ink);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 52rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
.site-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--line);
}
.site-header .brand {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.site-header .back { font-size: 0.9rem; }
.hero { margin-bottom: 2.5rem; }
.hero-bar {
  width: 3.5rem;
  height: 3px;
  background: var(--accent);
  border-radius: 2px;
  margin-bottom: 1.25rem;
}
.hero h1 {
  font-size: clamp(1.75rem, 4vw, 2.35rem);
  font-weight: 650;
  letter-spacing: -0.03em;
  margin: 0 0 0.5rem;
  line-height: 1.15;
}
.hero .meta { color: var(--muted); font-size: 0.95rem; }
.hero .id { font-family: var(--mono); font-size: 0.85rem; }
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.25rem 1.35rem;
  margin-bottom: 1.25rem;
}
.card h2 {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 1rem;
}
.field-grid { display: grid; gap: 0; }
.field-row {
  display: grid;
  grid-template-columns: minmax(7rem, 9.5rem) 1fr;
  gap: 0.75rem 1.25rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--line);
  font-size: 0.95rem;
}
.field-row:last-child { border-bottom: none; }
.field-row dt {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.field-row dd { margin: 0; word-break: break-word; }
.field-row dd.mono { font-family: var(--mono); font-size: 0.88rem; }
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
}
.gallery figure { margin: 0; }
.gallery img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--bg);
}
.gallery figcaption {
  font-size: 0.68rem;
  color: var(--muted);
  margin-top: 0.35rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toc-list { list-style: none; margin: 0; padding: 0; }
.toc-list li {
  border-bottom: 1px solid var(--line);
  padding: 0.55rem 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  align-items: baseline;
}
.toc-list li:last-child { border-bottom: none; }
.toc-list .loc { font-family: var(--mono); font-size: 0.82rem; color: var(--muted); }
.toc-list .bez { flex: 1; min-width: 10rem; }
.site-footer {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
  font-size: 0.75rem;
  color: var(--muted);
  text-align: center;
}
@media (max-width: 520px) {
  .field-row { grid-template-columns: 1fr; gap: 0.25rem; }
}
`;

function pageShell(
  title: string,
  body: string,
  opts: { depth: number; backHref?: string; schemaName: string },
): string {
  const prefix = "../".repeat(opts.depth);
  const css = `${prefix}assets/site.css`;
  const back =
    opts.backHref != null
      ? `<a class="back" href="${escapeHtml(opts.backHref)}">← Übersicht</a>`
      : "";
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · ${escapeHtml(opts.schemaName)}</title>
  <link rel="stylesheet" href="${css}" />
</head>
<body>
  <div class="wrap">
    <header class="site-header">
      <span class="brand">R-Base Export</span>
      ${back}
    </header>
    ${body}
    <footer class="site-footer">Statischer Export · Layout aus Exportformular</footer>
  </div>
</body>
</html>`;
}

async function copyImageAsset(
  scan: DatasetScan,
  filePath: string,
  assetsDir: FileSystemDirectoryHandle,
  pageSlug: string,
): Promise<string | null> {
  const file = await readFileAtPath(scan.handle, filePath);
  if (!file) return null;
  const mime = (file.type || "").toLowerCase();
  if (!mime.startsWith("image/") && !isImagePath(filePath)) return null;
  const base = filePath.split("/").pop() ?? "image";
  const safeBase = slugForExportPath(base.replace(/\.[^.]+$/, "")) + (base.includes(".") ? base.slice(base.lastIndexOf(".")) : ".jpg");
  const pageDir = await getDirectoryAtPath(assetsDir, pageSlug, { create: true });
  await writeFileInFolder(pageDir, safeBase, file);
  return `../assets/images/${pageSlug}/${safeBase}`;
}

export function schemaHtmlExportDirName(schema: DatasetSchemaDefinition): string {
  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toISOString().slice(11, 16).replace(":", "");
  const slug = schema.id.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32);
  return `_exports/html/${slug}-${date}-${time}`;
}

export type SchemaHtmlExportResult = {
  relativeDir: string;
  datasetCount: number;
};

export async function writeSchemaHtmlExportToRoot(
  root: FileSystemDirectoryHandle,
  schema: DatasetSchemaDefinition,
  scans: DatasetScan[],
  options: SchemaHtmlExportOptions = {},
): Promise<SchemaHtmlExportResult> {
  const omitEmpty = options.omitEmptyOptional !== false;
  const includeCover = options.includeCover !== false;
  const datasets = scansForSchemaExport(scans, schema);
  const exportStamp = new Date().toLocaleString("de-DE");
  const relativeDir = schemaHtmlExportDirName(schema);
  const exportRoot = await getDirectoryAtPath(root, relativeDir, { create: true });
  const assetsDir = await getDirectoryAtPath(exportRoot, "assets", { create: true });
  const imagesDir = await getDirectoryAtPath(assetsDir, "images", { create: true });
  const pagesDir = await getDirectoryAtPath(exportRoot, "datasets", { create: true });

  await writeTextInFolder(assetsDir, "site.css", SITE_CSS);

  const blocks = exportBlocksForSchema(schema);
  const entries: { href: string; loc: string; bez: string }[] = [];

  for (const scan of datasets) {
    const meta = scan.meta;
    const pageSlug = slugForExportPath(meta.locId);
    const fileName = `${pageSlug}.html`;
    const title = meta.bezeichnung.trim() || "Ohne Bezeichnung";
    const locLabel = displayLocId(meta.locId);
    entries.push({ href: `datasets/${fileName}`, loc: locLabel, bez: title });

    let body = `<div class="hero">
      <div class="hero-bar"></div>
      <p class="meta">${escapeHtml(schema.name)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="id">${escapeHtml(locLabel)}</p>
    </div>`;

    for (const block of blocks) {
      if (block.kind === "fields") {
        const keys = filterExportFieldKeys(schema, meta, block.fieldKeys, omitEmpty);
        if (!keys.length) continue;
        const rows = keys
          .filter((key) => key !== "bezeichnung")
          .map((key) => {
            const def = fieldDefByKey(schema.fields, key);
            const val = formatExportFieldValue(def, meta, key);
            const mono = key === "locId" ? " mono" : "";
            return `<div class="field-row"><dt>${escapeHtml(def?.label ?? key)}</dt><dd${mono ? ` class="mono"` : ""}>${escapeHtml(val)}</dd></div>`;
          })
          .join("");
        const sectionTitle = block.title?.trim()
          ? `<h2>${escapeHtml(block.title.trim())}</h2>`
          : "";
        body += `<section class="card">${sectionTitle}<dl class="field-grid">${rows}</dl></section>`;
      } else if (block.kind === "unplaced") {
        const keys = filterExportFieldKeys(schema, meta, block.fieldKeys, omitEmpty);
        if (!keys.length) continue;
        const rows = keys
          .map((key) => {
            const def = fieldDefByKey(schema.fields, key);
            const val = formatExportFieldValue(def, meta, key);
            return `<div class="field-row"><dt>${escapeHtml(def?.label ?? key)}</dt><dd>${escapeHtml(val)}</dd></div>`;
          })
          .join("");
        body += `<section class="card"><h2>Nicht platziert</h2><dl class="field-grid">${rows}</dl></section>`;
      } else if (block.kind === "files") {
        const images = meta.files.filter((f) => isImagePath(f.path));
        if (!images.length) continue;
        const sectionTitle = block.title?.trim() || "Bilder";
        const figures: string[] = [];
        for (const ref of images) {
          const src = await copyImageAsset(scan, ref.path, imagesDir, pageSlug);
          if (!src) continue;
          const caption = ref.path.split("/").pop() ?? ref.path;
          figures.push(
            `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}" loading="lazy" /><figcaption>${escapeHtml(caption)}</figcaption></figure>`,
          );
        }
        if (!figures.length) continue;
        body += `<section class="card"><h2>${escapeHtml(sectionTitle)}</h2><div class="gallery">${figures.join("")}</div></section>`;
      } else if (block.kind === "obsolete") {
        const obsolete = listObsoleteFields(meta, schema).filter(
          (e) => !isEmptyExportValue(formatObsoleteValue(e.value)),
        );
        if (!obsolete.length) continue;
        const sectionTitle = block.title?.trim() || "Felder außerhalb des Schemas";
        const rows = obsolete
          .map(
            (entry) =>
              `<div class="field-row"><dt>${escapeHtml(entry.key)}</dt><dd>${escapeHtml(formatObsoleteValue(entry.value))}</dd></div>`,
          )
          .join("");
        body += `<section class="card"><h2>${escapeHtml(sectionTitle)}</h2><dl class="field-grid">${rows}</dl></section>`;
      }
    }

    const html = pageShell(title, body, {
      depth: 1,
      backHref: "../index.html",
      schemaName: schema.name,
    });
    await writeTextInFolder(pagesDir, fileName, html);
  }

  if (includeCover) {
    const toc =
      entries.length === 0
        ? "<p class=\"meta\">Keine Datensätze für dieses Schema.</p>"
        : `<ul class="toc-list">${entries
            .map(
              (e) =>
                `<li><span class="loc">${escapeHtml(e.loc)}</span><a class="bez" href="${escapeHtml(e.href)}">${escapeHtml(e.bez)}</a></li>`,
            )
            .join("")}</ul>`;

    const coverBody = `<div class="hero">
      <div class="hero-bar"></div>
      <p class="meta">R-Base · HTML-Export</p>
      <h1>${escapeHtml(schema.name)}</h1>
      <p class="meta">Schema ${escapeHtml(schema.id)} · Prefix ${escapeHtml(schema.loxPrefix)}</p>
      <p class="meta">${datasets.length} Datensätze · ${escapeHtml(exportStamp)}</p>
    </div>
    <section class="card"><h2>Inhalt</h2>${toc}</section>`;

    const indexHtml = pageShell(schema.name, coverBody, { depth: 0, schemaName: schema.name });
    await writeTextInFolder(exportRoot, "index.html", indexHtml);
  } else if (datasets.length === 1 && entries[0]) {
    const only = entries[0]!;
    const redirect = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /><meta http-equiv="refresh" content="0;url=${escapeHtml(only.href)}" />
<title>${escapeHtml(schema.name)}</title></head><body><p><a href="${escapeHtml(only.href)}">Weiter</a></p></body></html>`;
    await writeTextInFolder(exportRoot, "index.html", redirect);
  } else if (datasets.length > 0) {
    const toc = `<ul class="toc-list">${entries
      .map(
        (e) =>
          `<li><span class="loc">${escapeHtml(e.loc)}</span><a class="bez" href="${escapeHtml(e.href)}">${escapeHtml(e.bez)}</a></li>`,
      )
      .join("")}</ul>`;
    const listBody = `<div class="hero"><h1>${escapeHtml(schema.name)}</h1><p class="meta">${datasets.length} Datensätze</p></div><section class="card"><h2>Datensätze</h2>${toc}</section>`;
    await writeTextInFolder(
      exportRoot,
      "index.html",
      pageShell(schema.name, listBody, { depth: 0, schemaName: schema.name }),
    );
  } else if (!datasets.length) {
    const empty = pageShell(
      schema.name,
      `<div class="hero"><h1>${escapeHtml(schema.name)}</h1><p class="meta">Keine Datensätze.</p></div>`,
      { depth: 0, schemaName: schema.name },
    );
    await writeTextInFolder(exportRoot, "index.html", empty);
  }

  return { relativeDir, datasetCount: datasets.length };
}