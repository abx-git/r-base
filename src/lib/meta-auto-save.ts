import { appState, patchPersistStatus } from "../state";

export type MetaSaveFlush = (locId: string, fieldKey: string, value: unknown) => Promise<void>;

const DEBOUNCE_MS = 650;

type PendingEntry = { locId: string; fieldKey: string; value: unknown };

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingValues = new Map<string, PendingEntry>();

let flushImpl: MetaSaveFlush | null = null;

function pendingKey(locId: string, fieldKey: string): string {
  return `${locId}\0${fieldKey}`;
}

export function bindMetaAutoSave(flush: MetaSaveFlush): void {
  flushImpl = flush;
}

export function getDraftFieldValue(fieldKey: string, locId = appState.selectedLocId): unknown | undefined {
  if (!locId) return undefined;
  return pendingValues.get(pendingKey(locId, fieldKey))?.value;
}

export function markPersistDirty(): void {
  if (appState.persistStatus === "saving" || appState.persistStatus === "dirty") return;
  patchPersistStatus("dirty");
}

export function queueMetaFieldSave(fieldKey: string, value: unknown, locId = appState.selectedLocId): void {
  if (!locId) return;
  const key = pendingKey(locId, fieldKey);
  pendingValues.set(key, { locId, fieldKey, value });
  markPersistDirty();
  const prev = timers.get(key);
  if (prev !== undefined) clearTimeout(prev);
  timers.set(
    key,
    setTimeout(() => {
      void flushPendingKey(key);
    }, DEBOUNCE_MS),
  );
}

export async function commitMetaFieldSave(
  fieldKey: string,
  value: unknown,
  locId = appState.selectedLocId,
): Promise<void> {
  if (!locId) return;
  const key = pendingKey(locId, fieldKey);
  const prev = timers.get(key);
  if (prev !== undefined) clearTimeout(prev);
  timers.delete(key);
  pendingValues.set(key, { locId, fieldKey, value });
  await flushPendingKey(key);
}

/** Vor Datensatz-Wechsel: offene Entwürfe auf Platte. */
export async function flushAllPendingMetaSaves(): Promise<void> {
  const keys = [...timers.keys()];
  for (const key of keys) {
    timers.delete(key);
    await flushPendingKey(key);
  }
}

async function flushPendingKey(key: string): Promise<void> {
  const entry = pendingValues.get(key);
  if (!entry || !flushImpl) return;
  const { locId, fieldKey, value } = entry;
  patchPersistStatus("saving");
  try {
    await flushImpl(locId, fieldKey, value);
    const latest = pendingValues.get(key);
    if (latest && latest.value === value) pendingValues.delete(key);
    patchPersistStatus("saved");
  } catch (e) {
    patchPersistStatus("dirty");
    throw e;
  }
}