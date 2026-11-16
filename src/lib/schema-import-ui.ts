import { loadSystemSchemaConfig, getDefaultSchemaId } from "./dataset-schema-store";

export function pickSchemaIdForImport(title = "Ziel-Schema für Import"): string | null {
  const cfg = loadSystemSchemaConfig();
  if (!cfg.schemas.length) return getDefaultSchemaId();
  if (cfg.schemas.length === 1) return cfg.schemas[0]!.id;

  const lines = cfg.schemas.map((s, i) => `${i + 1}. ${s.name} (${s.id})`).join("\n");
  const defaultIdx = cfg.schemas.findIndex((s) => s.id === cfg.defaultSchemaId);
  const defaultHint = defaultIdx >= 0 ? cfg.schemas[defaultIdx]!.name : cfg.schemas[0]!.name;
  const raw = window.prompt(
    `${title}\n\n${lines}\n\nNummer oder Schema-ID eingeben (Standard: ${defaultHint}):`,
    String(defaultIdx >= 0 ? defaultIdx + 1 : 1),
  );
  if (raw === null) return null;
  const t = raw.trim();
  if (!t) return cfg.defaultSchemaId;
  const n = Number(t);
  if (Number.isFinite(n) && n >= 1 && n <= cfg.schemas.length) return cfg.schemas[Math.floor(n) - 1]!.id;
  const byId = cfg.schemas.find((s) => s.id === t || s.name === t);
  return byId?.id ?? cfg.defaultSchemaId;
}