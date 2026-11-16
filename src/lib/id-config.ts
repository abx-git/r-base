import { loxPrefixFromDefaultSchema } from "./dataset-schema-store";

const SESSION_KEY = "r-base.id-prefix";

/** Lox-ID-Prefix für neue Datensätze (später Schema-Zuordnung). */
export function getLoxIdPrefix(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)?.trim().toUpperCase();
    if (raw && /^[A-Z0-9]{2,8}$/.test(raw)) return raw;
  } catch {
    /* ignore */
  }
  return loxPrefixFromDefaultSchema();
}

export function setLoxIdPrefix(prefix: string): void {
  const p = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!p) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  sessionStorage.setItem(SESSION_KEY, p.slice(0, 8));
}