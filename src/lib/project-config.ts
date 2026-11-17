import type { SystemSchemaConfig } from "./dataset-schema-types";
import type { WebDavSettings } from "./credentials";
import { createDefaultSystemSchemaConfig } from "./dataset-schema-defaults";
import { readTextFromFolder, writeTextInFolder } from "./workspace";

/** Projektspezifische Konfiguration im Stammordner (neben den Datensatz-Ordnern). */
export const PROJECT_CONFIG_FILENAME = "r-base.project.json";

export const PROJECT_CONFIG_VERSION = 1 as const;

export type ProjectUiSettings = {
  /** Zusatzfelder aus meta.json, die nicht im Feldkatalog stehen. */
  showObsoleteFieldsInDetail: boolean;
};

export type ProjectSettings = {
  webdav: WebDavSettings;
  ui?: ProjectUiSettings;
};

const DEFAULT_UI: ProjectUiSettings = {
  showObsoleteFieldsInDetail: true,
};

let projectUi: ProjectUiSettings = { ...DEFAULT_UI };

export function getProjectUiSettings(): ProjectUiSettings {
  return { ...projectUi };
}

export function setProjectUiSettings(partial: Partial<ProjectUiSettings>): void {
  projectUi = { ...projectUi, ...partial };
}

export type ProjectConfigFile = {
  configVersion: typeof PROJECT_CONFIG_VERSION;
  schemas: SystemSchemaConfig;
  settings: ProjectSettings;
};

let boundRoot: FileSystemDirectoryHandle | null = null;

export function bindProjectRoot(root: FileSystemDirectoryHandle | null): void {
  boundRoot = root;
}

export function getBoundProjectRoot(): FileSystemDirectoryHandle | null {
  return boundRoot;
}

function parseUiSettings(raw: unknown): ProjectUiSettings {
  if (!isRecord(raw)) return { ...DEFAULT_UI };
  return {
    showObsoleteFieldsInDetail:
      typeof raw.showObsoleteFieldsInDetail === "boolean"
        ? raw.showObsoleteFieldsInDetail
        : DEFAULT_UI.showObsoleteFieldsInDetail,
  };
}

function defaultSettings(): ProjectSettings {
  return { webdav: { baseUrl: "", username: "" }, ui: { ...DEFAULT_UI } };
}

function defaultProjectConfig(): ProjectConfigFile {
  return {
    configVersion: PROJECT_CONFIG_VERSION,
    schemas: createDefaultSystemSchemaConfig(),
    settings: defaultSettings(),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseWebDavSettings(raw: unknown): WebDavSettings {
  if (!isRecord(raw)) return { baseUrl: "", username: "" };
  return {
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : "",
    username: typeof raw.username === "string" ? raw.username : "",
  };
}

function parseProjectConfig(raw: unknown): ProjectConfigFile | null {
  if (!isRecord(raw)) return null;
  if (raw.configVersion !== PROJECT_CONFIG_VERSION) return null;
  const schemas = raw.schemas as SystemSchemaConfig | undefined;
  if (!schemas || schemas.configVersion !== 1 || !Array.isArray(schemas.schemas) || !schemas.schemas.length) {
    return null;
  }
  const settingsRaw = raw.settings;
  const settings: ProjectSettings = isRecord(settingsRaw)
    ? {
        webdav: parseWebDavSettings(settingsRaw.webdav),
        ui: parseUiSettings(settingsRaw.ui),
      }
    : defaultSettings();
  return {
    configVersion: PROJECT_CONFIG_VERSION,
    schemas: {
      configVersion: 1,
      defaultSchemaId:
        typeof schemas.defaultSchemaId === "string" && schemas.defaultSchemaId.trim()
          ? schemas.defaultSchemaId
          : schemas.schemas[0]!.id,
      schemas: schemas.schemas,
    },
    settings,
  };
}

export function projectConfigToJson(config: ProjectConfigFile): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export async function readProjectConfigFromRoot(
  root: FileSystemDirectoryHandle,
): Promise<ProjectConfigFile | null> {
  const text = await readTextFromFolder(root, PROJECT_CONFIG_FILENAME);
  if (!text?.trim()) return null;
  try {
    return parseProjectConfig(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export async function writeProjectConfigToRoot(
  root: FileSystemDirectoryHandle,
  config: ProjectConfigFile,
): Promise<void> {
  await writeTextInFolder(root, PROJECT_CONFIG_FILENAME, projectConfigToJson(config));
}

export async function loadOrCreateProjectConfig(
  root: FileSystemDirectoryHandle,
): Promise<ProjectConfigFile> {
  const existing = await readProjectConfigFromRoot(root);
  if (existing) return existing;
  const created = defaultProjectConfig();
  await writeProjectConfigToRoot(root, created);
  return created;
}

export async function persistCurrentProjectConfig(
  schemas: SystemSchemaConfig,
  webdav: WebDavSettings,
  ui: ProjectUiSettings = getProjectUiSettings(),
): Promise<void> {
  const root = boundRoot;
  if (!root) return;
  setProjectUiSettings(ui);
  const file: ProjectConfigFile = {
    configVersion: PROJECT_CONFIG_VERSION,
    schemas,
    settings: {
      webdav: { baseUrl: webdav.baseUrl.trim(), username: webdav.username.trim() },
      ui: { ...getProjectUiSettings() },
    },
  };
  await writeProjectConfigToRoot(root, file);
}

export async function ensureProjectConfigFile(root: FileSystemDirectoryHandle): Promise<void> {
  const existing = await readProjectConfigFromRoot(root);
  if (existing) return;
  await writeProjectConfigToRoot(root, defaultProjectConfig());
}