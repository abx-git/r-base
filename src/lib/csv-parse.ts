/** Einfacher RFC-4180-ähnlicher CSV-Parser (Anführungszeichen, Komma). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseJuraCsvText(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/);
  let headerLineIdx = lines.findIndex((l) => /Eigene\s*Nr/i.test(l));
  if (headerLineIdx < 0) {
    headerLineIdx = lines.findIndex((l) => l.trim().length > 0);
  }
  if (headerLineIdx < 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[headerLineIdx]!);
  const rows: string[][] = [];
  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim() || /^,+$/.test(line.trim())) continue;
    const cells = parseCsvLine(line);
    if (!cells[0]?.trim()) continue;
    rows.push(cells);
  }
  return { headers, rows };
}