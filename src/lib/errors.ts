export function formatDirectoryPickerError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "AbortError") return "";
    if (
      err.name === "NotAllowedError" ||
      /not allowed|nicht erlaubt|operation not permitted|vorgang nicht erlaubt/i.test(err.message)
    ) {
      return [
        "Ordnerzugriff vom Browser blockiert.",
        "Bitte erneut auf den Button klicken, Chrome oder Edge verwenden",
        "und die App unter https:// oder http://localhost öffnen — nicht als file://.",
      ].join(" ");
    }
    if (err.name === "SecurityError") {
      return "Ordnerzugriff nur über http://localhost oder https — nicht als file://.";
    }
    if (err.message.trim()) return err.message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Ordner konnte nicht geöffnet werden.";
}

export function formatWebDavError(status: number, context: string): string {
  if (status === 401) return `WebDAV: Anmeldung fehlgeschlagen (${context}).`;
  if (status === 403) return `WebDAV: Keine Berechtigung (${context}).`;
  if (status === 404) return `WebDAV: Pfad nicht gefunden (${context}).`;
  if (status === 0) {
    return [
      "Netzwerk oder CORS blockiert die Anfrage.",
      "Am Synology-Reverse-Proxy CORS für diese GitHub-Pages-Origin freischalten (siehe README).",
    ].join(" ");
  }
  return `WebDAV-Fehler HTTP ${status} (${context}).`;
}