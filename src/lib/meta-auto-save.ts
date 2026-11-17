import { appState, patchPersistStatus } from "../state";

export type MetaSaveFlush = (fieldKey: string, value: unknown) => Promise<void>;

const DEBOUNCE_MS = 650;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingValues = new Map<string, unknown>();

let flushImpl: MetaSaveFlush | null = null;

export function bindMetaAutoSave(flush: MetaSaveFlush): void {
  flushImpl = flush;
}

/** Noch nicht auf Platte — Anzeige im Formular bis zum Flush. */
export function getDraftFieldValue(fieldKey: string): unknown | undefined {
  return pendingValues.get(fieldKey);
}

export function markPersistDirty(): void {
  if (appState.persistStatus === "saving" || appState.persistStatus === "dirty") return;
  patchPersistStatus("dirty");
}

export function queueMetaFieldSave(fieldKey: string, value: unknown): void {
  pendingValues.set(fieldKey, value);
  markPersistDirty();
  const prev = timers.get(fieldKey);
  if (prev !== undefined) clearTimeout(prev);
  timers.set(
    fieldKey,
    setTimeout(() => {
      void flushMetaField(fieldKey);
    }, DEBOUNCE_MS),
  );
}

export async function commitMetaFieldSave(fieldKey: string, value: unknown): Promise<void> {
  const prev = timers.get(fieldKey);
  if (prev !== undefined) clearTimeout(prev);
  timers.delete(fieldKey);
  pendingValues.set(fieldKey, value);
  await flushMetaField(fieldKey);
}

async function flushMetaField(fieldKey: string): Promise<void> {
  timers.delete(fieldKey);
  if (!flushImpl) return;
  const value = pendingValues.get(fieldKey);
  if (value === undefined) return;
  patchPersistStatus("saving");
  try {
    await flushImpl(fieldKey, value);
    if (pendingValues.get(fieldKey) === value) pendingValues.delete(fieldKey);
    patchPersistStatus("saved");
  } catch (e) {
    patchPersistStatus("dirty");
    throw e;
  }
}