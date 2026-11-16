export type WebDavSettings = {
  baseUrl: string;
  username: string;
};

let passwordMemory: string | null = null;

const SESSION_KEY = "r-base.webdav.settings";

export function getWebDavSettings(): WebDavSettings {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { baseUrl: "", username: "" };
    const parsed = JSON.parse(raw) as { baseUrl?: string; username?: string };
    return {
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
      username: typeof parsed.username === "string" ? parsed.username : "",
    };
  } catch {
    return { baseUrl: "", username: "" };
  }
}

export function setWebDavSettings(settings: WebDavSettings): void {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ baseUrl: settings.baseUrl.trim(), username: settings.username.trim() }),
  );
}

export function setWebDavPassword(password: string): void {
  passwordMemory = password;
}

export function getWebDavPassword(): string {
  return passwordMemory ?? "";
}

export function clearWebDavPassword(): void {
  passwordMemory = null;
}

export function hasWebDavCredentials(): boolean {
  const s = getWebDavSettings();
  return Boolean(s.baseUrl.trim() && s.username.trim() && getWebDavPassword());
}

export function basicAuthHeader(): string {
  const { username } = getWebDavSettings();
  const password = getWebDavPassword();
  const token = btoa(`${username}:${password}`);
  return `Basic ${token}`;
}