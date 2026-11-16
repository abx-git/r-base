import type { DatasetMeta } from "./meta-schema";
import type { DatasetScan } from "./fs-local";
import { locIdsEqual } from "./loc-id";

export function findScanByLocId(
  scans: DatasetScan[],
  locId: string | null | undefined,
): DatasetScan | null {
  if (!locId) return null;
  return (
    scans.find(
      (s) => s.meta.locId === locId || s.locId === locId || locIdsEqual(s.meta.locId, locId),
    ) ?? null
  );
}

export function metaForLocId(
  locId: string,
  scans: DatasetScan[],
  cache?: Map<string, DatasetMeta>,
): DatasetMeta | undefined {
  const fromMap = cache?.get(locId);
  if (fromMap) return fromMap;
  return findScanByLocId(scans, locId)?.meta;
}

/** Metadaten für Tabellenzeilen — mehrere locId-Schreibweisen → dieselbe meta. */
export function buildMetaByLocId(scans: DatasetScan[]): Map<string, DatasetMeta> {
  const map = new Map<string, DatasetMeta>();
  for (const s of scans) {
    map.set(s.meta.locId, s.meta);
    if (s.locId && s.locId !== s.meta.locId) map.set(s.locId, s.meta);
  }
  return map;
}